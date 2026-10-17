# Private files: design proposal

Status: **proposal, waiting for owner approval. Nothing here is implemented.**
Prepared 17 October 2026 on top of `security-hardening` (`f15395e`). Read with `docs/SECURITY_HANDOFF_2026-10-17.md`.

## Summary

Files in private projects should be readable only by people who can open the project. Today every texture, thumbnail, AI capture and feedback attachment is a raw Convex storage URL. Anyone holding the URL can fetch the file until it is deleted. The ACLs added to `assets.getAssetUrl`/`getNodeAssets` do not take back URLs that have already been handed out.

Recommendation:

1. **Delivery.** Serve bytes from **Convex HTTP routes** (`/files/...` on the `.convex.site` host) that check access on every request and read with `ctx.storage.get`. The browser fetches them directly. Public files need no credentials. Private files need `Authorization: Bearer <Convex JWT>`. No Next.js proxy, so no file bytes pass through Vercel.
2. **Graph data.** Keep the existing `{ url, assetId }` value shape, but `assetId` becomes the source of truth and `url` is always the canonical route URL (`<site>/files/a/<assetId>`). Public URLs keep working in share pages, embeds, exported code and JSON. Private ones are resolved by the app.
3. **Access is scoped to a holder.** A server-maintained `assetPins` table records which projects and templates use which assets. It is derived from saved graph data, not from client calls. A request is judged in the context of the project being viewed, so a graph can never use a viewer's credentials to pull that viewer's other files.
4. **Preview sandbox.** The parent window fetches authorized bytes and sends Blobs to the opaque-origin frame, extending what `collectLocalBlobUrls` already does for `blob:` URLs. The frame never gets credentials.
5. **Clones** pin the source's assets ("logical copy"). Deleting the source project or asset doesn't strand them, and fixes finding #5 for clones.
6. **AI previews stop being stored.** The capture goes to the model inline as image data. Today the model only receives a URL string it cannot see, so this also fixes the feature.
7. **Migration** is non-destructive until one explicit, owner-run step. Rewrite graph URLs, back-fill pins, copy each *private* legacy file to a new storage ID, then delete the old files only when the owner runs `finalizeRotations`. Public legacy URLs keep working until a later sunset pass.

Estimated work: **about 11–15 focused days** for the core, plus optional extras (see [Work estimate](#8-work-estimate)).

---

## 1. Current state

| File kind | URL minted at | Who receives the raw URL | Where it persists |
| --- | --- | --- | --- |
| Texture assets | `assets.registerAsset` → `ctx.storage.getUrl` | uploader's client; then everyone who can load the graph | `graphData` node values `{ url, assetId }`; JSON exports; clones (`projects.clone` copies caller-supplied `graphData`); subgraph templates; generated code (`compiler.ts` emits `TextureLoader().load(url)`); standalone `getCode` responses to third-party hosts |
| Project thumbnails | `projects.updateThumbnail` | owner; for public projects, everyone (`listPublic`, `get`) | `projects.thumbnail`; `projects.get` also returns `thumbnailStorageId` |
| AI preview captures | `ai.registerPreviewImage` | the AI provider (as **text** in the tool result; `capturePreviewImage` output is JSON, so the model never sees pixels) | chat history in client memory; AI trace log (`/api/ai/log`) |
| Feedback attachments | `feedback.getFeedbacks` | admin only | admin page links |
| Unused | `assets.getAssetUrl`, `getNodeAssets`, `getAssetStats` | nobody (only callers are in the dead `hooks/use-asset-manager.ts`) | — |

Other facts that shape the design:

- `AssetValue = { url: string; assetId?: string }` (`lib/nodes/definitions.ts`). The compiler, `TSLNode` previews and `AssetInput` read `url`. The IndexedDB adapters already treat `assetId` as truth and rewrite `url` on load (`rehydrateAssetUrls` in `lib/editor-host/adapters/indexeddb-assets.ts`). The pattern this design needs already exists.
- `assetReferences` are kept up to date by client calls (`linkAssetToNode`/`unlinkAssetFromNode`). They drift from graph contents (finding #5) and are not created for clones or templates, so they are a weak basis for access checks.
- Better Auth's session cookie is on the app domain. The `.convex.site` host never sees it. Browsers get a 15-minute Convex JWT from `authClient.convex.token()` (default `jwtExpirationSeconds` in the installed plugin). The provider in `ConvexBetterAuthProvider` caches it.
- `lib/auth-server.ts` calls `convexBetterAuthNextJs` **without `jwtCache`**. Each server-side `getToken()` makes a network call to the Convex site's `/api/auth/convex/token`.
- The preview frame's CSP allows `img-src`/`connect-src https: http: data: blob:`. The frame fetches public storage URLs itself today. Parent `blob:` URLs are sent as bytes (`bridge.ts::resolveAssets` → `runtime.tsx::applySnapshot` → `createFrameAssetUrls`), with whole-string replacement of URLs in the snapshot.

## 2. Goals, non-goals, threat model

**Goals**

- Bytes of a file used only by private projects (or private templates) can be fetched only by the owner, and only through the app, after migration.
- Public projects keep working with no login everywhere they work today: share page, gallery, standalone embed, third-party iframes, exported code.
- Making a project private stops new public serving within one cache lifetime (1 h).
- A clone keeps working after its source is deleted, changes, or goes private.
- There are no implicit production deletes. The one destructive migration step is explicit, owner-run, and has a dry run.

**Non-goals**

- Taking back bytes someone already downloaded. That covers clones made while a project was public, which behave like a download.
- Stopping the owner from sharing their own files, for example via JSON export with embedded bytes.
- Multi-user ACLs (collaborators). The model leaves room for them.

**Threats addressed**

1. **Old URLs.** Someone holds an old raw URL from a log, a previous public period, an AI provider, or a forwarded JSON file. Closed by rotation plus deletion of the old file.
2. **Guessing.** Someone guesses or harvests asset IDs (they appear in public graph JSON). The ID is never the access check. Every request is authorized.
3. **Confused deputy.** An attacker's public graph references a victim's *own* private asset ID. The victim's browser, holding the victim's JWT, must not fetch those bytes and hand them to the attacker's shader code in the frame. Closed by holder-scoped authorization (§4.2): the parent authenticates only in the context of the project being viewed, and an attacker's project can't pin assets it can't read.
4. **Adoption.** Someone attaches a foreign private asset to their own project to make it public. Closed because pins are only created for assets the project owner can read at save time.

**Accepted risk (documented, follow-up)**

- Bytes handed to the preview frame can be sent elsewhere by graph code in the same graph (CSP allows `https:`). This matters only when a user brings untrusted code into a project that uses their private textures. The fix is to tighten the frame CSP once every asset arrives as a Blob (§10, follow-up F2).

## 3. Delivery options

| | A. Convex HTTP route, browser fetch with JWT *(recommended)* | B. Next route handler proxy in front of A | C. Signed, expiring capability URLs | D. Raw `getUrl` behind ACL'd queries + rotation |
| --- | --- | --- | --- | --- |
| How | `GET <site>/files/a/:id`. Public: no auth, `ACAO: *`. Private: `Authorization: Bearer` from `authClient.convex.token()`. The parent turns the response into a `blob:` URL. | `GET /api/files/[...path]` on the app domain. Reads the cookie, calls `getToken()`, forwards to A with Bearer, streams the body back. | An ACL'd mutation mints `<site>/files/a/:id?exp=&sig=` (HMAC, secret in Convex env). The route checks only the signature and expiry. | Graph stores only `assetId`. An ACL'd query returns `getUrl` to authorized viewers. Files are rotated when visibility drops. |
| Works as `<img src>` / `TextureLoader.load` | Public: yes. Private: no, needs fetch → `blob:`. | Yes (same origin, cookies) | Yes | Yes |
| Revocation | Immediate (per request); public browser caches ≤ 1 h | Immediate | At expiry (e.g. ≤ 1 h) | Only by copy + delete per transition |
| Latency (owner is in India, deployment in US East) | 1 user→Convex round trip, plus a CORS preflight the first time per URL (cached up to 2 h in Chrome) for private files | 1 user→Vercel round trip, plus Vercel→Convex (same region, ms), plus a token call per request unless `jwtCache` is enabled | 1 round trip, no preflight | 1 round trip |
| Vercel cost | None | Every private byte passes through Vercel: Fast Data Transfer (Hobby: 100 GB/mo hard cap; Pro: 1 TB then from $0.15/GB) plus function duration while streaming. Convex egress is still billed. | None | None |
| Convex cost | Egress same as today (serving files is egress either way). +1 HTTP action and 1 `runQuery` per request; +1 OPTIONS per private URL per preflight window | Same as A, plus a token-endpoint action per request without `jwtCache` | Same as A minus preflights; mint mutations | Lowest |
| Sandbox fit | Parent fetches → Blob → frame | Parent fetches → Blob → frame | Frame could fetch directly, but that hands the frame credentials-equivalent URLs | Frame fetches directly |
| Complexity | Medium: a client resolver plus CORS | Medium: two hops, token caching, Vercel limits | High: key management, expiry refresh, Convex query caching makes time-based minting in queries awkward (needs mutations or bucketed expiry) | Low, but the security is "secret URL forever" |
| Verdict | **Use** | Fallback only for `<img>`-only contexts if A proves awkward | Not needed: private files need the parent resolver anyway because of the sandbox | Its rotation mechanics are reused for migration; rejected as the end state |

Why A: it is the only option where private bytes never get a long-lived bearer URL, and no bytes pass through Vercel. The parent resolver it needs is already required by the opaque-origin sandbox. The extra round trip (preflight) costs most on the "my projects" dashboard, where thumbnails are many. A persistent client cache for immutable content mitigates that (§4.4). If it turns out painful, thumbnails alone can move to B: they are small, so Vercel cost is negligible, and `jwtCache` removes the token call.

Rejected sub-option: passing the JWT in the query string to avoid preflights. It puts bearer tokens in URLs, where they can land in server logs.

## 4. Recommended design

### 4.1 Canonical file URLs

| Kind | Stored / returned URL | Context added only by the app at fetch time |
| --- | --- | --- |
| Asset | `${CONVEX_SITE_URL}/files/a/<assetId>` | `?p=<projectId>` or `?st=<subgraphTemplateId>` |
| Thumbnail | `${CONVEX_SITE_URL}/files/t/<projectId>?v=<thumbnailUpdatedAt>` | — (the project is the holder) |
| Feedback attachment | `${CONVEX_SITE_URL}/files/f/<feedbackId>/<index>` | — (admin only) |

- Use `process.env.CONVEX_SITE_URL` (built into Convex functions) on the server and `NEXT_PUBLIC_CONVEX_SITE_URL` on the client. A future custom domain means one more rewrite pass with the same machinery as §5 M1.
- Asset content behind an `assetId` never changes. Replacing a texture creates a new asset, and rotation copies the same bytes. So the URL is safe to cache.
- Storage IDs are never put in URLs or returned to non-owners. Today `projects.get` leaks `thumbnailStorageId` to public viewers; that is fixed.

### 4.2 Access model: asset pins

A new server-maintained table replaces `assetReferences`/`deletedAssetReferences` for access checks and garbage collection:

```ts
assetPins: defineTable({
    assetId: v.id("assets"),
    projectId: v.optional(v.id("projects")),
    subgraphTemplateId: v.optional(v.id("subgraphTemplates")),
    via: v.union(v.literal("own"), v.literal("adopted"), v.literal("legacy")),
    createdAt: v.number(),
    // Soft-removed: no longer in the holder's saved graph. Keeps the asset alive for undo; grants no access.
    removedAt: v.optional(v.number()),
})
    .index("by_asset", ["assetId"])
    .index("by_project", ["projectId"])
    .index("by_template", ["subgraphTemplateId"]),
```

**Deriving pins (on every save).** This runs in `projects.create/update/clone` and `templates.createSubgraphTemplate/updateSubgraphTemplate`, after the existing authorization:

1. Walk the saved `graphData`/`data`, including `subgraphs`, nested subgraph definitions and code nodes. Collect asset IDs from `{ assetId }` objects and from canonical `/files/a/<id>` strings, and validate them with `ctx.db.normalizeId("assets", id)`. Bound the walk; a document is already ≤ 1 MiB.
2. For each asset ID:
   - If an active or soft-removed pin for this holder exists, (re)activate it. No new check is needed: the pin was legitimate when it was created, which makes undo cheap.
   - Else, if `asset.userId === holder owner`, create an `own` pin.
   - Else, if the holder owner can read the asset right now (it is pinned by a public holder, or by another holder they own), create an `adopted` pin.
   - Else ignore it. The value stays in the graph but won't resolve, and the UI shows "texture unavailable".
3. Mark pins for IDs no longer present as `removedAt = now`.

Graph content is never trusted for access. A client can write any string, but only pins grant reads, and pins are only created for readable assets.

**Read rule** (`internal.fileAccess.authorizeAsset`):

- **No holder context** (exported code, third-party pages): serve only if the asset has an active pin from a **public** holder. Identity is ignored even if a JWT is sent, so there is no confused deputy.
- **With holder context `H`**: the caller can read `H` (public, or owner by JWT), **and** either `H` actively pins the asset, or the caller owns both `H` and the asset. The second case covers a just-uploaded or just-imported texture before the next autosave derives its pin.
- Missing and forbidden both return the same `404`, so the route can't be used to test whether an ID exists.

**Thumbnails:** readable if the project is public or the caller owns it. **Feedback:** the caller's `identity.email` matches the admin address used by `getFeedbacks`. Move it to a Convex env var while touching it.

The public-holder check scans `by_asset` pins with a bound (`take(200)`). If popular assets ever have more pins than that, denormalize a `publicHolderCount` on `assets`; not needed at current scale.

### 4.3 Convex HTTP routes

New `convex/fileRoutes.ts`, registered in `convex/http.ts` with `pathPrefix` routes, next to `authComponent.registerRoutes`:

```ts
http.route({ pathPrefix: "/files/a/", method: "GET", handler: serveAsset });
http.route({ pathPrefix: "/files/t/", method: "GET", handler: serveThumbnail });
http.route({ pathPrefix: "/files/f/", method: "GET", handler: serveFeedbackAttachment });
http.route({ pathPrefix: "/files/", method: "OPTIONS", handler: filePreflight });

// serveAsset, in outline:
const grant = await ctx.runQuery(internal.fileAccess.authorizeAsset, { assetId, holder }); // auth propagates
if (!grant) return notFound();
if (ifNoneMatch(request) === `"${grant.sha256}"`) return new Response(null, { status: 304, headers });
const blob = await ctx.storage.get(grant.storageId);
return blob ? new Response(blob, { headers }) : notFound();
```

Response headers:

| Case | `Cache-Control` | CORS | Other |
| --- | --- | --- | --- |
| Served because publicly pinned / public project | `public, max-age=3600` | `Access-Control-Allow-Origin: *` | `ETag: "<sha256>"` from `_storage.sha256` |
| Served by identity (private) | `private, no-cache` (revalidate → cheap `304`) | Echo `Origin` only if it is in the app allowlist (`SITE_URL`, `www`, `localhost:3000`); `Vary: Origin, Authorization` | same |
| All | — | Preflight: `Allow-Methods: GET`, `Allow-Headers: Authorization, If-None-Match`, `Max-Age: 7200` | `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Type` from the policy allowlist (never `text/html`), `Content-Disposition: inline` for images and `attachment` otherwise |

Limits (from the Convex docs): HTTP action responses ≤ 100 MiB, and Convex-runtime actions have 64 MiB of memory. Assets are capped at 50 MB by `FILE_POLICIES`, which is under the response limit but close to the memory limit if `ctx.storage.get` buffers. Spike S2 checks this. If a 50 MB file can't be served, lower `FILE_POLICIES.asset.maxBytes` to 32 MB (no current texture use case needs more).

Cost per request is one HTTP action plus one query (two function calls), plus egress, which matches today's storage-URL serving.

### 4.4 Client resolver (parent window only)

New `lib/files/resolver.ts`. It is the only code that attaches credentials to file requests.

- **Token:** `authClient.convex.token({ fetchOptions: { throw: false } })`, cached until `exp − 60 s`, with a single in-flight request. No token (standalone embed, signed out) means anonymous requests.
- **API is by intent, not by URL:**
  - `resolveGraphAsset(url, holder)` serves graph values. `holder` comes from the editor host config (current project or template ID), **never from graph content**. It fetches `url?p=<holder>` with the token. On `404` it retries once without context or token (public), which covers a public asset pasted in before the next save.
  - `resolveThumbnail(url)`, `resolveFeedbackAttachment(url)` are called explicitly by the dashboard and admin code.
  - Any other URL in graph content (external `https:` textures, thumbnail or feedback route URLs pasted into a texture field) is fetched **without** credentials, or left to the frame as today.
- **Caching:**
  - An in-memory LRU of `Blob`s (≈ 256 MB budget) shared by the sandbox bridge and UI previews, with in-flight dedupe and object-URL revocation on eviction.
  - A persistent Cache Storage layer (`caches.open('tsl-files-v1')`) for immutable content (asset URLs, and versioned thumbnail URLs). Repeat dashboard and editor loads then make no request and no preflight. Cleared on sign-out and on user change.
  - Failures are cached negatively until the next successful save or sign-in change.
- **Priming:** after an upload, `prime(canonicalUrl, file)` puts the local bytes in the cache, so the new texture shows instantly with no refetch.
- **UI consumers:** a `useResolvedFileUrl(value, holder)` hook replaces raw `url` in `TSLNode` `StringPreview`, `AssetInput`, `ProjectCard`/`CommunityProjectCard` (gallery thumbnails are public, so a plain `src` is fine), and the admin feedback page (fetch the blob, then `window.open(objectUrl)`). `lib/export-image.ts` keeps working because it rasterizes DOM `<img>` elements that now hold `blob:` URLs.

### 4.5 Preview sandbox (`lib/preview-sandbox`)

- Generalize `collectLocalBlobUrls` → `collectResolvableUrls(snapshot, { origin, fileSite })`. It returns same-origin `blob:` URLs (unchanged) plus canonical `/files/a/` URLs.
- In `bridge.ts::resolveAssets`, use the resolver (`resolveGraphAsset` with the host holder, passed into `createPreviewBridge`) instead of a bare `fetch`. It sends `PreviewAsset { url: <stored canonical url>, blob }`. The protocol is unchanged: `createFrameAssetUrls` already swaps any matching string for a frame-local object URL.
- Parent-fetch also covers **public** files, so there is one code path. Blobs cross `postMessage` by reference, so there is no byte copy.
- The bridge still exposes no fetch, auth or upload RPC. The frame cannot request a URL; the parent decides from its own store snapshot and its own holder context.
- Known gap: the frame replaces whole strings only. A canonical URL *inside* custom code text works for public assets (the frame fetches it directly) but not for private ones. Report these in M0 and leave them for now.

### 4.6 Thumbnails, AI previews, feedback

- **Thumbnails.** `updateThumbnail` stops calling `getUrl`. It stores `thumbnailUpdatedAt` and returns the canonical URL. `selectProjectSummary` and `get` return `thumbnailUrl` (canonical) instead of `thumbnail`/`thumbnailStorageId`. During the transition, `thumbnail` is still returned until the new Next build is live (§6).
- **AI previews: stop storing them.** `capturePreviewImage` returns `{ mediaType, data: <base64>, width, height }`. `TOOL_SET.capturePreviewImage.toModelOutput` turns it into `{ type: 'content', value: [{ type: 'text', … }, { type: 'image-data', data, mediaType }] }`. AI SDK 6.0.134 supports `image-data` tool output, and `convertToModelMessages(messages, { tools: TOOL_SET })` already passes the tools. Cap the capture (e.g. ≤ 768 px JPEG, q≈0.8, about 100–200 KB base64), because history is re-sent on every turn and Vercel caps function request bodies at 4.5 MB. Keep at most N recent images in history and replace older ones with a text stub. Strip base64 from AI trace events. Remove the upload, register and cleanup path in `components/Preview.tsx` and `AiChatDock.tsx`. Keep the three `convex/ai.ts` mutations for one release for old tabs, then delete them.
- **Feedback.** `getFeedbacks` returns canonical attachment URLs. The admin page resolves them with the JWT. Raw feedback URLs only ever reached the admin's browser, so they need no rotation.

### 4.7 Graph data: logical reference

- Value shape stays `{ url, assetId }`. `assetId` is the truth, and `url` is the canonical URL for that ID. Plain string texture values that hold a canonical URL are also recognized.
- `registerAsset` returns `{ assetId, url: canonical }`. `convex-adapter.ts::uploadAndLinkAsset` becomes upload, then register, then return. Linking is gone (pins come from the save), and so is unlink-before-upload, which fixes the "replacement unlinks before upload succeeds" part of finding #5.
- `linkAssetToNode`, `unlinkAssetFromNode` and `handleNodeDelete` become no-ops for one release (old tabs), then are removed with the `assetReferences` tables.
- **Server normalization on save** (until the legacy sunset): `projects.update/create/clone` and template saves rewrite any known legacy raw storage URL to its canonical URL, using the `legacyFileUrls` map (§5). Tabs opened before the deploy can't write raw URLs back after migration.
- `getAssetUrl`, `getNodeAssets`, `getAssetStats` and `hooks/use-asset-manager.ts` have no callers: delete them rather than port them.
- A test fails if `ctx.storage.getUrl` appears anywhere in `convex/` outside the migration module.

### 4.8 Share page, standalone embed, third-party iframes, code export

| Surface | Behaviour |
| --- | --- |
| `/share/[projectId]` | Holder = that project. Anonymous viewers get public assets. The owner viewing their private project gets private assets by JWT. |
| `/editor/standalone?projectId=` (incl. the landing demo and third-party iframes) | `getPublicStandalone` returns graph data with canonical URLs. Holder = `projectId`, no token, so it works for public projects. IndexedDB `standalone:` assets are unchanged. |
| Host `load` command with arbitrary JSON | Public assets work (no-context public rule). Private ones return `404` and show "texture unavailable". This is the intended behaviour. |
| `getCode` to host / `CodePanel` copy | Code contains canonical URLs. Public ones load cross-origin from any site (`ACAO: *`) and stop working if the project goes private, which is correct. For private projects, show a short hint in CodePanel ("textures in this project are private; make it public or download them"). |
| Gallery / favourites | Public thumbnails as plain `<img src>`. |

### 4.9 JSON export/import, paste, templates

- **Export** keeps canonical URLs and `assetId`s.
- **Import or paste into your own project:** the next save derives pins. Your own assets get `own` pins; foreign assets get `adopted` pins if they are currently readable to you (public source, or another project you own). Otherwise they show "texture unavailable".
- **Exporting a private project for someone else** works only if bytes are embedded. Optional follow-up F1: "Export with assets" inlines the files (zip, or base64 in JSON). Import uploads them as the importer's new assets.
- **Subgraph templates** get pins like projects (holder = template). A public template's assets are therefore readable, and inserting the template into a project adopts them on the next save. Code-node templates hold no assets.

### 4.10 Clones and lifecycle (finding #5)

- **Clone is server-side.** `projects.clone({ sourceId, name })` reads `source.graphData` itself. The current caller-supplied `graphData` argument is accepted and ignored for one release, then removed. It applies the guest limit (already there), copies the graph, and derives pins. Every source asset is readable (the source is public), so the clone gets `adopted` pins. `CloneBanner` and the share page stop sending `graphData`.
- **"Logical copy" semantics.** The clone references the same asset rows; bytes are not duplicated. Its pins keep those assets alive. Deleting the source project, removing the texture from the source, or making the source private does not affect the clone. Any of the clone's own public holders keep serving those bytes. This matches "cloned while public = downloaded"; say so in the visibility toggle's help text.
- **GC** (`garbageCollectAssets`, rewritten): delete an asset row when it has no active pins, and every soft-removed pin (or, for never-pinned assets, `createdAt`) is older than the 7-day grace. Delete the storage file only through `deleteOwnedFile`, as today: it needs an owner binding, and no other asset row may point at that storage ID. Also delete expired soft-removed pins.
- **Project / template delete:** remove that holder's pins (soft for the grace period), so GC decides.
- **Account deletion** (`deleteUserFiles`): assets pinned only by the user's own holders are deleted, as today. Assets pinned by **other users'** holders are kept and their ownership moves to the owner of the oldest foreign pin (asset row `userId` and storage binding). Clones keep working, and every asset still has exactly one owner. *Owner decision D2.*
- **Guest → account linking:** pins point at holders, not users, so nothing changes. `transferFileOwnership` already moves bindings and the user migration moves assets and projects.
- **Quota/stats** stay per owner (assets row). Adopted pins don't count against the adopter.

## 5. Migration plan

All steps are internal functions run with `npx convex run` (`--prod` for production). They are paginated and reschedule themselves, like `files:backfillStorageBindings`, are idempotent, and keep progress in `storageMaintenance`. **Only M3 deletes production data, and only when the owner runs it explicitly.** M2 can delete a fresh copy that M2 itself just created, if the row it was for vanished mid-rotation. That copy is either deleted at once or left unbound for the existing orphan sweep.

New tables:

```ts
legacyFileUrls: defineTable({ url: v.string(), assetId: v.optional(v.id("assets")), projectId: v.optional(v.id("projects")) })
    .index("by_url", ["url"]),
storageRotations: defineTable({
    oldStorageId: v.id("_storage"), newStorageId: v.id("_storage"),
    assetId: v.optional(v.id("assets")), projectId: v.optional(v.id("projects")),
    sha256: v.string(), rotatedAt: v.number(), finalizedAt: v.optional(v.number()),
}).index("by_old", ["oldStorageId"]).index("by_pending", ["finalizedAt"]),
// assets: + legacyUrlLive?: boolean   projects: + thumbnailUpdatedAt?: number, thumbnailLegacyUrlLive?: boolean
```

| Step | What | Destructive? |
| --- | --- | --- |
| **M0a — URL map** | For each asset and thumbnail, record `getUrl(storageId)` → owner row in `legacyFileUrls`. Set `legacyUrlLive` / `thumbnailLegacyUrlLive`. | No |
| **M0b — Inventory (dry run)** | Read-only report (logged plus stored in `storageMaintenance`): assets and bytes split private/public; thumbnails split; projects and templates holding raw URLs; **foreign references** (project of user U → asset of user V), split by whether the asset is currently public; raw URLs inside code strings; raw storage URLs with no map entry (ai-preview URLs, other deployments, thumbnails used as textures); disputed bindings. The owner reviews this and picks D1. | No |
| **M1 — Pins + rewrite** | Per project and per subgraph template, in one mutation each: rewrite raw URLs → canonical (in `AssetValue`s, in plain strings, and as substrings in code text), fill in a missing `assetId` where the URL maps to an asset, and derive pins. Legacy foreign references follow D1 (default: `legacy` pin, which preserves today's working clones). Stamp `fileRefsVersion: 1` on the holder. | Rewrites `graphData` (a reversible mapping; the raw→canonical table is kept) |
| **M2 — Rotate private legacy files** | For each asset/thumbnail with a live legacy URL that is **not** publicly readable: a Node action (`"use node"`, 512 MiB, one file per run) does `storage.get` → `storage.store`, then a mutation checks the row still points at the old ID, binds the new file (same owner/purpose), repoints `assets.storageId` / `projects.thumbnailStorageId`, inserts `storageRotations`, and clears the legacy flag. Old files are kept. Disputed bindings get one copy per row, are left un-finalized, and are listed for the owner. | No (copies only) |
| **M3 — Finalize (owner-run)** | `files:finalizeRotations { dryRun: true }` prints the count and bytes. `{ dryRun: false }` deletes old storage files and their bindings where the new file exists with the same `sha256`. **This is the moment old URLs are revoked.** | **Yes, explicit** |
| **M4 — Sunset (owner-run, after D3 days)** | Rotate and finalize every remaining legacy file (public ones), remove save-time normalization, drop `projects.thumbnail`, `legacyFileUrls`, `assetReferences`, `deletedAssetReferences`, and the no-op mutations. Optionally `files:purgeLegacyAiPreviews { dryRun }` for leftover ai-preview captures. | **Yes, explicit** |

Cost of M2: Convex egress ≈ total bytes of private legacy files (reading files inside functions counts as egress), plus temporarily doubled storage for those files until M3. The M0b report gives exact figures. As a reference: Starter is $0.132/GB egress after 1 GB, and Professional includes 50 GB then $0.12/GB.

**Residual exposure**

| Period | Who can still fetch what |
| --- | --- |
| Until Convex A deploy | Everyone with any raw URL, forever. New uploads still get raw URLs. |
| Convex A → M1 | New uploads are private from the start (no raw URL ever minted). Legacy raw URLs are still emitted to authorized viewers by old code paths. |
| M1 → M3 | The app no longer emits legacy raw URLs (once the Convex B deploy is live). **Anyone already holding one can still fetch it.** Keep this window short: M2 and M3 directly after M1 has been checked. |
| After M3 | Raw URLs of files that were private at M2 are dead. Raw URLs of public legacy files still work (harmless while public). A project made private **after** M2 keeps its legacy raw URLs alive until M4. If urgent, `files:rotateProjectFiles { projectId }` (owner-run) rotates and finalizes that one project. |
| After M4 | No raw storage URL works anywhere. Only the per-request-authorized routes remain. Former public viewers may have browser-cached copies for ≤ 1 h after a project goes private. |

## 6. Rollout order

Each numbered phase is its own branch and PR, per the owner's one-follow-up-per-branch rule.

0. **Spikes on the dev deployment** (S1–S5 below). No code lands.
1. **Deploy Convex A** (backward compatible): schema additions, `/files/*` routes, `fileAccess`, pin derivation on saves, save-time normalization, server-side clone (ignores `graphData`), `registerAsset`/`updateThumbnail` return canonical URLs, projections return both `thumbnail` (legacy) and `thumbnailUrl`, link/unlink become no-ops. Old clients keep working: they still render the raw URLs stored in graphs.
2. **Deploy Next**: resolver, bridge integration, UI hooks, upload flow, clone callers, inline AI images, admin feedback, CodePanel hint. Old tabs keep working until reload, except AI capture, which uses the old mutations kept in step 1.
3. **Run M0a, then M0b** on prod. The owner reviews the report and decides D1/D3.
4. **Run M1.** Check counts against M0b. Spot-check share, embed and editor on a few real public and private projects.
5. **Deploy Convex B**: stop returning `thumbnail`/`thumbnailStorageId`, no `getUrl` in any client-facing function, `getFeedbacks` canonical, CI guard test enabled.
6. **Run M2** (copies). Check rotation count = M0b private count and spot-render rotated textures.
7. **Owner runs M3** dry run, then the real run.
8. **After D3 days, M4** plus the cleanup deploy (drop no-op mutations, `ai.*` upload mutations, legacy tables).

Deploy Convex before Next at each step (as in the security rollout). Do not run M1 before the Next deploy: old clients without the resolver would send canonical URLs to the frame, and private textures would fail in those tabs.

## 7. Test plan

**Spikes (dev deployment, before implementation)**

- **S1.** Is a `getUrl` URL derivable from its storage ID? Compare the two. If yes, storage IDs given to uploaders and to public viewers (`thumbnailStorageId`) are secrets too, which widens what M2 must rotate.
- **S2.** Serve 1, 25 and 50 MB files from an HTTP action via `new Response(blob)`: memory, time to first byte, throughput. Decide the asset cap (D5).
- **S3.** CORS from `localhost:3000` and the prod origin: preflight caching, `304` revalidation with `Authorization`, Cache Storage persistence. Check in Chrome, Firefox and Safari.
- **S4.** `toModelOutput` with `image-data` across the configured providers (Anthropic, OpenAI, Google). Confirm the model receives pixels.
- **S5.** Rotation in a Node action: a 50 MB copy, `sha256` equality, and binding plus repoint in the follow-up mutation.

**Automated (Vitest, fake ctx like `convex/files.test.ts`)**

- Pin derivation: own / adopted / ignored (foreign private); soft-remove and reactivation without re-check; nested subgraphs and code nodes; canonical-URL strings; malformed or other-deployment IDs; walk bounds; template holders.
- ACL matrix: {anonymous, owner, other user} × {private, public holder} × {no context, matching context, wrong context} × {pinned, soft-removed, unpinned own, deleted}. **Confused-deputy case:** victim JWT + attacker's public project context + victim's asset → 404. Thumbnails; feedback admin-only; identical 404 for missing and forbidden.
- Route handler: headers for each case (CORS, `Cache-Control`, `Vary`, `nosniff`, CSP, content-type allowlist), ETag → 304, OPTIONS.
- Clone: caller `graphData` ignored; pins created; deleting the source project, then running GC past grace, leaves the clone's assets intact; guest limit.
- GC: deletes only past grace with no active pins; storage deleted only with a binding and no other row on that storage ID. Account deletion with foreign pins transfers ownership (D2).
- Migration: map building; inventory counts; rewrite in values, strings and code substrings; idempotent rerun; D1 policy; save-time normalization of raw URLs sent by an "old client"; rotation idempotency and the race with asset or project deletion; `finalizeRotations` dry run deletes nothing, and the real run deletes only verified rotations.
- Client: resolver token caching and expiry; credentials attached only for graph assets with host context; holder never taken from graph content; LRU eviction revokes object URLs; negative cache cleared after save; Cache Storage cleared on sign-out. Bridge: canonical URLs collected and sent as Blobs, frame rewrite applied, still no RPC surface. AI tool `toModelOutput` shape; trace truncation.
- Guard: no `storage.getUrl` in `convex/` outside the migration module.

**Manual browser checks (owner)**

The editor with private textures (upload, replace, undo/redo, node thumbnails, inline previews, image export); the share page signed out and as owner; the standalone embed via the landing demo and a scratch third-party HTML page, including `getCode` output loading textures off-site; dashboard private thumbnails and the public gallery; clone → delete source → (dev, shortened grace) GC; JSON export/import own and foreign; template insertion; AI capture per provider; admin feedback attachments; sign out → sign in as another user on the same browser (no cached private bytes shown); Safari.

**Migration rehearsal:** run M0–M3 on a dev deployment first. Rehearsing on a copy of production data (`npx convex export` / `import` into dev) is more faithful but copies user data. *Owner decision D4.*

## 8. Work estimate

Focused solo days, including tests. Ranges reflect unknowns resolved by the spikes.

| Phase | Scope | Days |
| --- | --- | --- |
| 0 | Spikes S1–S5 | 1 |
| 1 | Convex A: schema, pins + derivation, `fileAccess`, HTTP routes, server clone, normalization, upload/thumbnail changes, GC rewrite, account-deletion policy, tests | 4–5 |
| 2 | Next: resolver + caches, bridge, UI hooks (node preview, AssetInput, cards, admin), upload adapter, clone callers, AI inline images, CodePanel hint, tests | 3–4 |
| 3 | Migration M0–M3 functions, report, tests, dev rehearsal | 2–3 |
| 4 | Convex B cleanup, prod rollout steps 3–7, fixes from the owner's browser testing | 1–2 |
| **Core total** | | **11–15** |
| Optional F1 | "Export with assets" (embedded bytes) plus import upload | 1–2 |
| Optional F2 | Tighten sandbox CSP (`img-src`/`connect-src` → `blob: data:` plus app origin; parent-fetches external textures, HDRs and models) | 1–2 |
| Later | M4 sunset plus legacy-table removal | 0.5–1 |

## 9. Decisions needed from the owner

- **D1 — Legacy foreign references to currently-private assets** (counted in M0b). *Recommend: keep with a `legacy` pin.* These are almost always clones of projects that later went private. The cloner already holds a working URL to the bytes, and dropping the pin silently breaks their project. The alternative is to drop them and let those textures go missing after M3.
- **D2 — Account deletion when others pinned your assets.** *Recommend: keep the file and transfer ownership to the oldest foreign pin's owner,* so clones keep working. The alternative is to delete anyway and break those clones.
- **D3 — Sunset window for public legacy raw URLs** (third-party code copied before migration keeps working until then; projects made private in the window keep live legacy URLs). *Recommend: 60 days.*
- **D4 — Rehearse the migration on a copy of prod data in a dev deployment?** *Recommend: yes,* if you are comfortable with user data in dev. Otherwise use a seeded dev deployment only.
- **D5 — Asset size cap** if S2 shows HTTP actions can't serve 50 MB comfortably. *Recommend: 32 MB.*
- **D6 — Cache lifetime for public responses** (how long after going private a former viewer's browser may still show a cached copy). *Recommend: 1 h.*

## 10. Risks, rejected alternatives, follow-ups

- **Risk: preflight latency on far-away connections.** Each private URL costs about 2 round trips the first time. Mitigated by Cache Storage (immutable URLs) and a 2 h preflight cache. Fallback: proxy thumbnails via a Next route with `jwtCache` (option B, thumbnails only).
- **Risk: autosave races** between pin derivation and a stale tab. Pins are recomputed from whatever graph is saved last, and soft-remove plus reactivate makes flip-flopping harmless.
- **Risk: Convex function-call volume.** Two calls per file request, plus OPTIONS. Fine at current scale. Watch the usage dashboard after rollout.
- **Rejected:** giving the preview iframe `allow-same-origin` or any credentials; JWT in query strings; signed URLs as the primary mechanism (§3 C); per-clone byte duplication (needless storage and egress; pins give the same durability); trusting `graphData` or client link calls for access.
- **F1** Export with embedded assets. **F2** Tighten the frame CSP (closes "untrusted code in your own project can exfiltrate its textures"). **F3** Denormalized `publicHolderCount` if pin scans grow. **F4** Optional custom domain for `/files` (one more M1-style rewrite).

## Sources

- Convex HTTP actions (limits, Bearer auth, CORS): https://docs.convex.dev/functions/http-actions
- Convex limits and egress pricing: https://docs.convex.dev/production/state/limits
- Convex serving files (`getUrl` is public; revoke by deleting the file): https://docs.convex.dev/file-storage/serve-files
- Vercel pricing (Fast Data Transfer): https://vercel.com/pricing
- Installed packages checked: `next@16.3.8` route-handler docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`: handlers uncached by default, `params` is a Promise), `convex@1.34.0` (`httpRouter` `pathPrefix`, `ctx.storage.get`), `@convex-dev/better-auth` (15-minute JWT default, `getToken` without `jwtCache` fetches `/api/auth/convex/token` per call), `ai@6.0.134` (`image-data` tool output).
