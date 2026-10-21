# Private files: design proposal

Status: **proposal, waiting for owner approval. Nothing here is implemented.**
Prepared 17 October 2026 on top of `security-hardening` (`f15395e`). Read with `docs/SECURITY_HANDOFF_2026-10-17.md`.

**Revision, 18 October 2026.** An independent review found three medium issues. All three are now resolved:

- **5-M1.** Cloned or imported code in your *own* project could send your private textures anywhere, because the frame CSP allows `https:`. Holder scoping can't stop this. The old follow-up F2 (parent fetches everything, frame CSP limited to `blob: data:`) is now part of the core. Files must not be called private until it ships. Added threat 5, the exact CSP, the parent fetch rules, residual channels (WebRTC and others), spike S6 and tests (§2, §4.5).
- **5-M2.** Serving every public file through an HTTP action costs two function calls per request with no CDN, and adds load to action concurrency. Public files now keep plain Convex storage URLs. Only private files go through the authorized route. When a file stops being public it is rotated automatically, which kills its old URLs. Added a cost model, an abuse analysis and spike S7 (§3, §4.11).
- **5-M3.** Account deletion no longer hands every shared upload to someone else. Only assets that were public when another user pinned them are transferred. Everything else is deleted, and the user can choose to remove those too. Pins record whether the asset was public at pin time (§4.2, §4.10, D2, D8).

## Summary

Files in private projects should be readable only by people who can open the project. Today every texture, thumbnail, AI capture and feedback attachment is a raw Convex storage URL. Anyone holding the URL can fetch the file until it is deleted. The ACLs added to `assets.getAssetUrl`/`getNodeAssets` do not take back URLs that have already been handed out.

Recommendation:

1. **Delivery is split by visibility.** *Public* files keep plain Convex storage URLs (`ctx.storage.getUrl`): no function of ours runs per request, and their cost stays as it is today. *Private* files are served by **Convex HTTP routes** (`/files/...` on the `.convex.site` host). These check access on every request, need `Authorization: Bearer <Convex JWT>`, and read with `ctx.storage.get`. No Next.js proxy, so no file bytes pass through Vercel.
2. **Rotation on visibility change.** When a file stops being public, it is copied to a new storage ID and the old file is deleted after a short grace period. Every old URL dies within about 70 minutes (§4.11, D7). Storage URLs are only ever minted for public files.
3. **Graph data.** Keep the existing `{ url, assetId }` value shape. `assetId` becomes the source of truth, and `url` is always the canonical route URL (`<site>/files/a/<assetId>`). The app resolves public assets to storage URLs at load time. Exported code gets those resolved URLs.
4. **Access is scoped to a holder.** A server-maintained `assetPins` table records which projects and templates use which assets. It is derived from saved graph data, not from client calls. A request is judged in the context of the project being viewed, so a graph can never use a viewer's credentials to pull that viewer's other files.
5. **The preview sandbox can't reach the network.** The parent window fetches every URL the frame would load: user textures (including external `https:` URLs), HDR environments, the backdrop model, and Convex files. It sends them to the frame as Blobs. The frame CSP drops to `img-src blob: data:; connect-src blob: data:`. This used to be follow-up F2. It is now core, because cloned or imported code in your own project could otherwise send your private textures anywhere (threat 5). **Do not describe files as private until it ships.** A few channels CSP can't close are listed honestly in §4.5.6.
6. **Clones** pin the source's assets ("logical copy"). Deleting the source project or asset doesn't strand them, and fixes finding #5 for clones.
7. **Account deletion** transfers an asset to another user only if that user copied it while it was public. Everything else is deleted. The deleting user can also remove the copied ones (§4.10, D2, D8).
8. **AI previews stop being stored.** The capture goes to the model inline as image data. Today the model only receives a URL string it cannot see, so this also fixes the feature.
9. **Migration** is non-destructive until one explicit, owner-run step. Rewrite graph URLs, back-fill pins, copy each *private* legacy file to a new storage ID, then delete the old files only when the owner runs `finalizeRotations`. Public legacy URLs are simply public storage URLs. They keep working while the file stays public.

Estimated work: **about 14–19 focused days** for the core, plus optional extras (see [Work estimate](#8-work-estimate)).

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
- The preview frame's CSP allows `img-src`/`connect-src https: http: data: blob:` (`lib/preview-sandbox/security.ts:21`). The frame fetches public storage URLs itself today. Parent `blob:` URLs are sent as bytes (`bridge.ts::resolveAssets` → `runtime.tsx::applySnapshot` → `createFrameAssetUrls`), with whole-string replacement of URLs in the snapshot.
- The only URL loader the compiler emits is `new THREE.TextureLoader().load(<url>)` for texture nodes (`compiler.ts:734`). The texture node's default URL is the app-relative `/uv.png`. No video, audio, font or worker loading exists in `lib/`, `components/` or `store/`.
- The frame also loads two fixed assets itself (`UnsafePreviewCanvas3D.tsx`): HDR presets from `https://raw.githubusercontent.com/pmndrs/assets/main/src/hdri/<name>.hdr` (line 581; checked 18 Oct: 1.4–1.9 MB each, `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=300`), and `/clothe-backdrop.glb` (line 633; 1.3 MB, one embedded texture, no Draco/KTX2). The `<base href>` in the frame document resolves relative URLs to the app origin. `next.config.ts` adds `Access-Control-Allow-Origin: *` to root static images and models for this reason. The overlay frame renders its own copy of the scene for post-graph previews, so it downloads the HDR and the backdrop a second time.
- The public gallery (`listPublic`) returns up to 300 projects (`PUBLIC_GALLERY_FETCH_LIMIT`). `CommunityProjectCard` renders each thumbnail as an eager `<img>` (no `loading="lazy"`).
- The delete-account dialog (`components/dashboard/Sidebar.tsx`) promises to "permanently delete your account and all associated data (projects, assets, etc.)". There is no privacy policy page in `app/`.
- Convex counts "explicit client calls, scheduled executions, subscription updates, and file accesses" as function calls (Convex limits page). Serving a storage URL is therefore probably a function call already, not egress only. This design assumes so; S7 checks.

## 2. Goals, non-goals, threat model

**Goals**

- Bytes of a file used only by private projects (or private templates) can be fetched only by the owner, and only through the app, after migration.
- Graph code in the preview can't send those bytes anywhere, apart from the residual channels in §4.5.6.
- Public projects keep working with no login everywhere they work today: share page, gallery, standalone embed, third-party iframes, exported code.
- Making a project private kills the public URLs of files that are no longer public within about 70 minutes (D7).
- A clone keeps working after its source is deleted, changes, or goes private.
- Migration makes no implicit production deletes. The one destructive migration step is explicit, owner-run, and has a dry run. At runtime, the only new automatic delete is of a superseded copy after a verified rotation (§4.11).
- Public file serving costs no more function calls than today (§3.1).

**Non-goals**

- Taking back bytes someone already downloaded. That covers clones made while a project was public, which behave like a download, and browser-cached copies.
- Stopping the owner from sharing their own files, for example via JSON export with embedded bytes.
- Multi-user ACLs (collaborators). The model leaves room for them.

**Threats addressed**

1. **Old URLs.** Someone holds an old raw URL from a log, a previous public period, an AI provider, exported code or a forwarded JSON file. Storage URLs are minted only for public files. When a file stops being public it is rotated and the old file deleted (§4.11). Legacy private files are rotated by M2/M3.
2. **Guessing.** Someone guesses or harvests asset IDs (they appear in public graph JSON). The ID is never the access check. Every route request is authorized.
3. **Confused deputy.** An attacker's public graph references a victim's *own* private asset ID. The victim's browser, holding the victim's JWT, must not fetch those bytes and hand them to the attacker's shader code in the frame. Closed by holder-scoped authorization (§4.2): the parent authenticates only in the context of the project being viewed, and an attacker's project can't pin assets it can't read.
4. **Adoption.** Someone attaches a foreign private asset to their own project to make it public. Closed because pins are only created for assets the project owner can read at save time.
5. **Untrusted code in your own project.** Clones bring the source's custom code nodes and geometry scripts into a project you own. Imported or pasted JSON does the same, and if it names your own asset IDs (for example ones harvested while a project was public), pin derivation correctly creates `own` pins (§4.2 step 2). In both cases the holder is your project, so the resolver correctly hands your private bytes to the frame. Holder scoping can't help. Closed by §4.5: the parent fetches everything and the frame CSP allows only `blob:` and `data:`, so the code has nowhere to send the bytes. The residual channels are in §4.5.6.

**Residual risk (documented, accepted)**

- The channels in §4.5.6 that CSP doesn't govern: WebRTC, DNS prefetch, and frame self-navigation if spike S6 shows the parent's `frame-src` can't block it. They need code you put into your own project. Clone and import show a one-line warning (§4.5.5).
- Anyone can spend function calls and egress by requesting public files in a loop. That is true today as well. The hybrid keeps the cost per request at today's level (§3.2).

## 3. Delivery options

| | A. Convex HTTP route, browser fetch with JWT | B. Next route handler proxy in front of A | C. Signed, expiring capability URLs | D. Raw `getUrl` behind ACL'd queries + rotation |
| --- | --- | --- | --- | --- |
| How | `GET <site>/files/a/:id`. Private: `Authorization: Bearer` from `authClient.convex.token()`. The parent turns the response into a `blob:` URL. | `GET /api/files/[...path]` on the app domain. Reads the cookie, calls `getToken()`, forwards to A with Bearer, streams the body back. | An ACL'd mutation mints `<site>/files/a/:id?exp=&sig=` (HMAC, secret in Convex env). The route checks only the signature and expiry. | Graph stores only `assetId`. An ACL'd query returns `getUrl` to authorized viewers. Files are rotated when visibility drops. |
| Works as `<img src>` / `TextureLoader.load` | Only with a fetch → `blob:` step | Yes (same origin, cookies) | Yes | Yes |
| Revocation | Immediate (per request) | Immediate | At expiry (e.g. ≤ 1 h) | Only by copy + delete per transition |
| Latency (owner is in India, deployment in US East) | 1 user→Convex round trip, plus a CORS preflight the first time per URL (cached up to 2 h in Chrome) | 1 user→Vercel round trip, plus Vercel→Convex (same region, ms), plus a token call per request unless `jwtCache` is enabled | 1 round trip, no preflight | 1 round trip |
| Vercel cost | None | Every byte passes through Vercel: Fast Data Transfer (Hobby: 100 GB/mo hard cap; Pro: 1 TB then from $0.15/GB) plus function duration while streaming. Convex egress is still billed. | None | None |
| Convex cost per request | 1 HTTP action + 1 `runQuery` (2 calls, A2 in §3.1), +1 OPTIONS per URL per preflight window, plus egress | Same as A, plus a token-endpoint action per request without `jwtCache` | Same as A minus preflights; mint mutations | 1 call per storage-URL GET (A1), plus egress. Same as today. |
| Uses action concurrency | Yes: shares the 64 (Starter) / 512 (Professional) Convex-runtime and HTTP action slots | Yes | Yes | No (assumed: storage serving runs none of our code) |
| Sandbox fit | Parent fetches → Blob → frame | Parent fetches → Blob → frame | Frame could fetch directly, but that hands the frame credentials-equivalent URLs | Parent fetches → Blob → frame (§4.5) |
| Complexity | Medium: a client resolver plus CORS | Medium: two hops, token caching, Vercel limits | High: key management, expiry refresh, Convex query caching makes time-based minting in queries awkward (needs mutations or bucketed expiry) | Low to serve; needs rotation on every public→private transition |
| Verdict | **Use for private files** | Fallback only for `<img>`-only contexts if A proves awkward | Not needed: private files need the parent resolver anyway because of the sandbox | **Use for public files** (§3.4). Rejected for private files. |

Why A for private files: it is the only option where private bytes never get a long-lived bearer URL, and no bytes pass through Vercel. The parent resolver it needs is already required by the opaque-origin sandbox. The extra round trip (preflight) costs most on the "my projects" dashboard, where thumbnails are many. A persistent client cache for immutable content mitigates that (§4.4). If it turns out painful, private thumbnails alone can move to B: they are small, so Vercel cost is negligible, and `jwtCache` removes the token call.

Rejected sub-option: passing the JWT in the query string to avoid preflights. It puts bearer tokens in URLs, where they can land in server logs.

### 3.1 Cost model

Convex prices (limits page, US regions; other regions cost 1.3×):

| | Free | Starter | Professional |
| --- | --- | --- | --- |
| Function calls | 1 M/month total | 1 M/month included, then $2.20 per M | 25 M/month included, then $2 per M |
| Egress ("serving user files, accessing user files inside functions") | 1 GB/month total | 1 GB included, then $0.132/GB | 50 GB included, then $0.12/GB |
| Convex-runtime + HTTP action concurrency (shared) | 64 | 64 | 512 |

Assumptions. S7 checks each one on the dev deployment:

- **A1.** Each GET of a Convex storage URL counts as one function call. The limits page lists "file accesses" as function calls, but doesn't say exactly what a file access is.
- **A2.** An HTTP action that calls `ctx.runQuery` counts as two calls. The docs don't say. A Convex staff reply on Discord implies nested calls are metered separately.
- **A3.** A `@convex-dev/rate-limiter` `limit` call from an HTTP action runs a component mutation: one more call and one database write per request. The component's docs show `limit` used from mutations and actions. They state no per-check cost.
- **A4.** Typical project: 3 textures (T). Dashboard: 20 own projects, half private. These are guesses; the M0b inventory gives the real distribution. The gallery count of 300 eager thumbnails comes from the code (§1).

Function calls for file serving per **cold** page view. The app's own queries aren't counted. Warm views make no file calls in any option, because canonical and storage URLs are immutable and the parent keeps them in Cache Storage (§4.4).

| Surface | Today | A for everything | A + rate limiter | **Hybrid (recommended)** |
| --- | --- | --- | --- | --- |
| Editor, own private project | 3–6 ¹ | 9 (2 + OPTIONS per texture) | 12 | 9 |
| Editor, own public project | 3–6 ¹ | 9 | 12 | 3 |
| Share page, anonymous | 3–6 ¹ | 6 | 9 | 3 |
| Standalone embed, landing demo, third-party iframe | 3–6 ¹ | 6 | 9 | 3 |
| Dashboard, 20 thumbnails (10 private) | 20 | 50 | 70 | 40 |
| Gallery, 300 eager thumbnails | 300 | 600 | 900 | 300 |
| Gallery with `loading="lazy"` (≈ 24 visible, guess) | — | 48 | 72 | 24 |

¹ The main frame loads each texture, and the overlay frame loads it again when it renders node previews. Whether the second load hits the HTTP cache from an opaque origin is unverified (§4.5.4).

What this means:

- Per 1 M calls (all of Starter's allowance), cold gallery views: about 1,700 with A for everything, 3,300 with the hybrid. With lazy loading: about 21,000 and 42,000.
- Per 100,000 cold share or embed views: 600,000 calls with A, 300,000 with the hybrid. The difference is about $0.60 at overage prices.
- In dollars this is small at today's traffic. The bigger effects are elsewhere. Under A, anonymous public traffic runs our HTTP actions, which share 64 concurrency slots on Starter with every other action (AI included). If an action holds its slot while a slow client downloads a large texture (unknown; S2 measures), a popular embed on a busy third-party page could starve the app. The gallery's eager loading costs more than the choice between options does: add `loading="lazy"` either way.
- Egress is the same in every option. Serving bytes is egress no matter which path serves them.

### 3.2 Abuse

Anyone can request a URL in a loop. At 50 requests/s for 24 hours (4.32 M requests):

| Target | A for everything | Hybrid |
| --- | --- | --- |
| A small public file | 8.64 M calls (≈ $17 Pro / $19 Starter overage) plus egress | 4.32 M calls (≈ $9 / $10) plus egress |
| Random or missing IDs on `/files/a/` | 8.64 M calls: the route must run the query to learn whether the asset is public | 4.32 M calls: the route serves only authenticated callers, so anonymous requests are rejected before any query (§4.3) |
| Missing storage URLs | — | Unknown whether a 404 counts as a file access (S7) |
| Egress of a public file (e.g. 100 KB → 432 GB ≈ $52) | Same as today | Same as today |

Context: anyone can already spend calls by calling public queries such as `listPublic` through the Convex client. Neither option creates a new kind of abuse. The question is how much each request amplifies, and the hybrid keeps that at today's level. Egress abuse of a public file is also possible today. Only a CDN in front of public files fixes that (F5).

### 3.3 Options for public files

**(a) Hybrid (recommended).** Public files are served by plain storage URLs. Only private files go through the authorized route. When a file goes from public to private it is rotated: copy, repoint, delete the old file after a grace period. This reuses the M2 rotation code (§4.11).

- Public calls per request: 1, as today. Anonymous route abuse: 1 call per request.
- Public traffic uses no action concurrency.
- Cost of the transition: per rotated file, egress equal to its size, temporarily doubled storage for the grace period, and about 4 function calls. Example: a project with three 4 MB textures going private costs ≈ 12 MB of egress (≈ $0.0015).
- Extra work over A for everything: about 1.5–2 days (public URL resolution in the loading queries, transition hooks, debounce and automatic finalize). M2 needs the rotation code anyway.

**(b) A for everything, plus rate limiting and/or a CDN.**

- `@convex-dev/rate-limiter` exists (token bucket or fixed window, optional sharding). Each `limit` adds a mutation and a write per request (A3), so public requests cost 3 calls instead of 2. Calls spent on abuse go up, not down.
- To be fair to real users, a limit needs a per-client key. I found no documented way to read the client IP in a Convex HTTP action (unverified; S7). A global limit would block legitimate viewers during an attack.
- A caching Next route on Vercel in front of public files sends every public byte through Vercel (Fast Data Transfer; Hobby has a 100 GB/month hard cap). Revocation would then depend on the CDN's TTL or a purge. A Cloudflare zone in front of a custom domain (F4) is cleaner, but it is new infrastructure for one maintainer.
- It still costs 2 calls per request for every cache miss, and still uses action concurrency.

### 3.4 Recommendation, and option D revisited

Use the hybrid. It is cheaper per request, keeps public traffic out of the action slots, and makes the route reject anonymous traffic early. It adds about two days and reuses migration code that has to be written anyway. If the usage dashboard ever shows abuse, F5 adds per-user limits on the route or a CDN in front of public files.

§3 originally rejected D because its security is "secret URL forever". That objection holds for private files, which never get a storage URL under this design. Public files need no secrecy: anyone may fetch them. What D lacks is revocation when a file stops being public. §4.11 adds that, automatically, on every public→private transition. So D is used only where secrecy isn't needed, and rotation covers the moment that changes.

## 4. Recommended design

### 4.1 Canonical file URLs

| Kind | Stored / returned URL | Public serving URL (resolved at load, never stored in graph data) | Context added only by the app at fetch time |
| --- | --- | --- | --- |
| Asset | `${CONVEX_SITE_URL}/files/a/<assetId>` | `ctx.storage.getUrl(storageId)` while the asset is public (§4.11) | `?p=<projectId>` or `?st=<subgraphTemplateId>` |
| Thumbnail | private project: `${CONVEX_SITE_URL}/files/t/<projectId>?v=<thumbnailUpdatedAt>` | public project: `ctx.storage.getUrl(thumbnailStorageId)` | — (the project is the holder) |
| Feedback attachment | `${CONVEX_SITE_URL}/files/f/<feedbackId>/<index>` | never public | — (admin only) |

- Use `process.env.CONVEX_SITE_URL` (built into Convex functions) on the server and `NEXT_PUBLIC_CONVEX_SITE_URL` on the client. A future custom domain means one more rewrite pass with the same machinery as §5 M1.
- Asset content behind an `assetId` never changes. Replacing a texture creates a new asset, and rotation copies the same bytes. So the canonical URL is safe to cache. A storage URL is tied to one storage ID, so it is immutable too. Rotation produces a new one.
- The canonical URL is an app-level locator. It serves nothing to anonymous callers (§4.3). Off-site consumers (exported code, third-party pages) get the public storage URL instead.
- Storage IDs are never put in URLs or returned to non-owners. Today `projects.get` leaks `thumbnailStorageId` to public viewers; that is fixed.

### 4.2 Access model: asset pins

A new server-maintained table replaces `assetReferences`/`deletedAssetReferences` for access checks and garbage collection:

```ts
assetPins: defineTable({
    assetId: v.id("assets"),
    projectId: v.optional(v.id("projects")),
    subgraphTemplateId: v.optional(v.id("subgraphTemplates")),
    via: v.union(v.literal("own"), v.literal("adopted"), v.literal("legacy")),
    // Adopted and legacy pins only. true: the asset was public when this pin was created
    // ("cloned while public = downloaded"); decides account-deletion transfer (§4.10).
    // Absent: not provably public at pin time (legacy pins M1 can't classify).
    publicAtPin: v.optional(v.boolean()),
    // The public holder it was adopted from, when publicAtPin is true. For support and audit.
    adoptedFrom: v.optional(v.object({
        projectId: v.optional(v.id("projects")),
        subgraphTemplateId: v.optional(v.id("subgraphTemplates")),
    })),
    createdAt: v.number(),
    // Soft-removed: no longer in the holder's saved graph. Keeps the asset alive for undo; grants no access.
    removedAt: v.optional(v.number()),
})
    .index("by_asset", ["assetId"])
    .index("by_project", ["projectId"])
    .index("by_template", ["subgraphTemplateId"]),
// assets: + urlExposed?: boolean, lastRotatedAt?: number   (§4.11)
```

**Deriving pins (on every save).** This runs in `projects.create/update/clone` and `templates.createSubgraphTemplate/updateSubgraphTemplate`, after the existing authorization:

1. Walk the saved `graphData`/`data`, including `subgraphs`, nested subgraph definitions and code nodes. Collect asset IDs from `{ assetId }` objects and from canonical `/files/a/<id>` strings, and validate them with `ctx.db.normalizeId("assets", id)`. Bound the walk; a document is already ≤ 1 MiB.
2. For each asset ID:
   - If an active or soft-removed pin for this holder exists, (re)activate it. No new check is needed: the pin was legitimate when it was created, which makes undo cheap. `publicAtPin` and `adoptedFrom` keep their original values.
   - Else, if `asset.userId === holder owner`, create an `own` pin.
   - Else, if a public holder actively pins the asset, create an `adopted` pin with `publicAtPin: true` and `adoptedFrom` set to the oldest such public holder.
   - Else, if another holder the same owner owns actively pins it, create an `adopted` pin and copy `publicAtPin`/`adoptedFrom` from that pin. Prefer a source pin with `publicAtPin: true`. The asset is readable only because of that earlier pin, so it inherits its history.
   - Else ignore it. The value stays in the graph but won't resolve, and the UI shows "texture unavailable".
3. Mark pins for IDs no longer present as `removedAt = now`.
4. If this save activated a pin from a public holder, or removed an asset's last one, apply the transitions in §4.11.

Graph content is never trusted for access. A client can write any string, but only pins grant reads, and pins are only created for readable assets. Pins decide *who can read*. They do not make the code in the graph trustworthy: that is threat 5, handled in §4.5.

**Read rule for the authorized route** (`internal.fileAccess.authorizeAsset`):

- Public files are not served by the route. Anyone gets them through their storage URL, which the app learns from `publicAssetUrls` (§4.11).
- A request without a valid JWT gets `404` before any query runs (§4.3).
- **With holder context `H`**: the caller can read `H` (public, or owner by JWT), **and** either `H` actively pins the asset, or the caller owns both `H` and the asset. The second case covers a just-uploaded or just-imported texture before the next autosave derives its pin.
- **No holder context**: `404`. Without context, identity is never used, so there is no confused deputy.
- Missing and forbidden both return the same `404`, so the route can't be used to test whether an ID exists.

**Thumbnails:** the route serves only the owner. Public projects' thumbnails use their storage URL. **Feedback:** the caller's `identity.email` matches the admin address used by `getFeedbacks`. Move it to a Convex env var while touching it.

The public-holder check scans `by_asset` pins with a bound (`take(200)`). If popular assets ever have more pins than that, denormalize a `publicHolderCount` on `assets`; not needed at current scale.

### 4.3 Convex HTTP routes

New `convex/fileRoutes.ts`, registered in `convex/http.ts` with `pathPrefix` routes, next to `authComponent.registerRoutes`:

```ts
http.route({ pathPrefix: "/files/a/", method: "GET", handler: serveAsset });
http.route({ pathPrefix: "/files/t/", method: "GET", handler: serveThumbnail });
http.route({ pathPrefix: "/files/f/", method: "GET", handler: serveFeedbackAttachment });
http.route({ pathPrefix: "/files/", method: "OPTIONS", handler: filePreflight });

// serveAsset, in outline:
if (!(await ctx.auth.getUserIdentity())) return notFound(); // anonymous: rejected without a query
const assetId = parseId(request); if (!assetId) return notFound(); // shape check only
const grant = await ctx.runQuery(internal.fileAccess.authorizeAsset, { assetId, holder }); // auth propagates
if (!grant) return notFound();
if (ifNoneMatch(request) === `"${grant.sha256}"`) return new Response(null, { status: 304, headers });
const blob = await ctx.storage.get(grant.storageId);
return blob ? new Response(blob, { headers }) : notFound();
```

Every response from these routes is for an authenticated caller, so there is no public cache case:

| Case | `Cache-Control` | CORS | Other |
| --- | --- | --- | --- |
| Served | `private, no-cache` (revalidate → cheap `304`) | Echo `Origin` only if it is in the app allowlist (`SITE_URL`, `www`, `localhost:3000`); `Vary: Origin, Authorization` | `ETag: "<sha256>"` from `_storage.sha256` |
| All | — | Preflight: `Allow-Methods: GET`, `Allow-Headers: Authorization, If-None-Match`, `Max-Age: 7200` | `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Type` from the policy allowlist (never `text/html`), `Content-Disposition: inline` for images and `attachment` otherwise |

Limits (from the Convex docs): HTTP action responses ≤ 100 MiB, and Convex-runtime actions have 64 MiB of memory. Assets are capped at 50 MB by `FILE_POLICIES`, which is under the response limit but close to the memory limit if `ctx.storage.get` buffers. Spike S2 checks this. If a 50 MB file can't be served, lower `FILE_POLICIES.asset.maxBytes` to 32 MB (no current texture use case needs more).

Cost per request: an authorized request is one HTTP action plus one query (2 calls, A2), plus one OPTIONS action per URL per preflight window, plus egress. An anonymous or malformed request is one call. `ctx.auth.getUserIdentity()` validates the JWT inside the action; I assume it is not a separate function call (S7). Only owners and the admin ever get bytes from these routes, so their traffic is small. Public traffic never reaches them (§3.1).

### 4.4 Client resolver (parent window only)

New `lib/files/resolver.ts`. It is the only code that fetches file bytes for the editor, share page, embed and dashboard, and the only code that attaches credentials to file requests.

- **Token:** `authClient.convex.token({ fetchOptions: { throw: false } })`, cached until `exp − 60 s`, with a single in-flight request. No token (standalone embed, signed out) means no route requests at all.
- **API is by intent, not by URL:**
  - `resolveGraphAsset(value, holder)` serves graph values. `holder` comes from the editor host config (current project or template ID), **never from graph content**. If the asset ID has a public URL (from the holder's loading query, or `fileAccess.publicAssetUrls` for IDs it doesn't cover, §4.11), fetch that storage URL with `credentials: 'omit'`. Otherwise fetch `url?p=<holder>` with the token. On `404`, ask `publicAssetUrls` once more. That covers a public asset pasted in before the next save, and a file that was just rotated.
  - `resolveThumbnail(url)`, `resolveFeedbackAttachment(url)` are called explicitly by the dashboard and admin code. Public thumbnails are plain storage URLs and need neither.
  - `resolveFrameUrl(url)` covers every other URL the preview frame would load (§4.5.2). It never sends credentials.
- **Caching:**
  - An in-memory LRU of `Blob`s (≈ 256 MB budget) shared by both preview bridges (main and overlay) and UI previews, with in-flight dedupe and object-URL revocation on eviction.
  - A persistent Cache Storage layer (`caches.open('tsl-files-v1')`) for immutable content: canonical asset URLs, storage URLs, versioned thumbnail URLs, and HDR presets (7-day TTL, since the upstream URL isn't versioned). Repeat dashboard and editor loads then make no request and no preflight. Cleared on sign-out and on user change.
  - Failures are cached negatively until the next successful save or sign-in change.
- **Priming:** after an upload, `prime(canonicalUrl, file)` puts the local bytes in the cache, so the new texture shows instantly with no refetch.
- **UI consumers:** a `useResolvedFileUrl(value, holder)` hook replaces raw `url` in `TSLNode` `StringPreview`, `AssetInput`, `ProjectCard` (private thumbnails), and the admin feedback page (fetch the blob, then `window.open(objectUrl)`). `CommunityProjectCard` and public `ProjectCard` thumbnails are storage URLs and stay plain `<img src>`, with `loading="lazy"` added (§3.1). `lib/export-image.ts` keeps working because it rasterizes DOM `<img>` elements that now hold `blob:` or storage URLs.

### 4.5 Preview sandbox: the parent fetches everything (core; formerly F2)

#### 4.5.1 Why this is core

Holder scoping decides which bytes the parent hands to the frame. It can't decide what the code in the frame does with them. In your own project, after a clone or an import, the holder is yours and the bytes are correctly handed over (threat 5). Today the frame CSP allows `connect-src https:` and `img-src https:`, so that code can POST the bytes anywhere, or encode them in image URLs. Only the frame CSP, together with the parent doing all fetching, closes this. So it ships in the same phase as the resolver (§6 step 2b). **No UI text, help page or announcement may call files private until step 2b is live and M3 has run.**

The existing rules stay:

- Blobs cross `postMessage` by reference, so there is no byte copy. `createFrameAssetUrls` already swaps any matching string for a frame-local object URL.
- The bridge still exposes no fetch, auth or upload RPC. The frame cannot request a URL; the parent decides from its own store snapshot and its own holder context.

#### 4.5.2 What the parent fetches

`collectLocalBlobUrls` becomes `collectFrameUrls(snapshot, { origin, fileSite, previewSettings })`. It does not take every string in the snapshot. It reads texture-node `url` values (the same field `compiler.ts::getStringValue(node, 'url')` reads), in root graphs and subgraph definitions, plus the HDR preset and backdrop from `previewSettings`. Note text and other strings are never fetched.

The snapshot gains two fields the parent fills in, `environmentUrl` and `backdropUrl`. `createFrameAssetUrls` swaps them for frame-local object URLs like any other asset. `UnsafePreviewCanvas3D` loads those fields instead of building URLs itself. If the parent couldn't fetch a file, the field is `null`.

Each URL is classified in this order:

| # | URL | Fetch | Credentials | Max bytes | Accepted content |
| --- | --- | --- | --- | --- | --- |
| 1 | Same-origin `blob:` (unsaved local uploads) | as today | — | asset cap | any (already local) |
| 2 | Canonical `/files/a/<id>` on our Convex site | public: storage URL from `publicAssetUrls`; else the route with `?p=`/`?st=` from the host's holder context | none for public; **Bearer JWT only here**, only with the host's holder | asset cap (50 MB, or 32 MB under D5) | `Content-Type` from the route's allowlist |
| 3 | Convex storage URL (`<deployment>.convex.cloud/api/storage/…`), e.g. pasted from exported code | direct | none | asset cap | image types below |
| 4 | App static file: a relative or same-origin path matching `^/[^/]+\.(png\|jpe?g\|webp\|glb\|gltf\|hdr)$` (the pattern `next.config.ts` already uses), e.g. `/uv.png`, `/clothe-backdrop.glb` | same-origin | `credentials: 'omit'` | 8 MB | images below; glTF magic `glTF` for models |
| 5 | HDR preset | `https://raw.githubusercontent.com/pmndrs/assets/main/src/hdri/<name>.hdr`, with `name` checked against the preset list (moved from `PreviewControls.tsx` to a shared module) | none | 8 MB (presets are 1.4–1.9 MB) | `#?RADIANCE` or `#?RGBE` header |
| 6 | Any other `https:` URL typed into a texture node | `mode: 'cors'`, `referrerPolicy: 'no-referrer'` | `credentials: 'omit'` | asset cap | images below |
| 7 | Anything else: `http:`, other schemes, other app paths, other paths on our Convex site | not fetched | — | — | node shows "texture unavailable" |

Image types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`, or `application/octet-stream` whose first bytes match one of those (`FILE_POLICIES.asset` allows octet-stream uploads). The size cap is enforced while streaming, so a missing or lying `Content-Length` doesn't help. At most 6 parent fetches run at once.

Rule 7 matters: the parent is not an open proxy for graph content. It never fetches other app routes or other Convex site routes, and it never sends credentials for anything but rule 2. It relies on the app having no open redirects (`lib/safe-redirect.ts`).

**CORS and other failures.** `fetch` rejects with an opaque `TypeError`, and browsers don't expose why. The texture node shows: "Couldn't load this URL. The site may not allow use from other sites (CORS), or it's offline." The requirement is the same as today: `TextureLoader` already requests with `crossOrigin = 'anonymous'`, so hosts that work today keep working. One difference: the request's `Origin` changes from `null` (frame) to the app origin (parent). A host that allow-lists only `null` would break; that would be odd, and S6 checks a few common hosts. A failed HDR renders without an environment and shows one toast. A failed backdrop is skipped and logged.

#### 4.5.3 Frame CSP

Target policy in `security.ts::previewDocument`:

```
default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';
img-src blob: data:; connect-src blob: data:; media-src 'none'; font-src 'none';
worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none';
manifest-src 'none'; form-action 'none'; webrtc 'block'
```

| Directive | Value | Why |
| --- | --- | --- |
| `img-src` | `blob: data:` | `TextureLoader` creates `<img>` on frame-local object URLs. GLTF embedded images use `blob:` or `data:`. |
| `connect-src` | `blob: data:` | `FileLoader`/`fetch` on frame-local object URLs (`RGBELoader`, `GLTFLoader`, `ImageBitmapLoader`). |
| `media-src`, `font-src` | `'none'` | No video, audio or font loading exists. Explicit so a test can assert it. |
| `worker-src` | `'none'` | No workers (no Draco/KTX2 decoders; the backdrop uses no compression extension). Explicit, because otherwise it falls back to `child-src`/`script-src`. |
| `script-src` | `'unsafe-inline' 'unsafe-eval'` | Unchanged. Graph code is compiled with `new Function`. |
| `webrtc` | `'block'` | Defined in CSP3. Ignored where unsupported, so harmless. See §4.5.6. |

WebGPU (and the WebGL2 fallback) needs no CSP directive: no directive governs GPU APIs or WGSL compilation. I expect this to hold but haven't tested it. Spike S6 confirms it, and confirms the three loaders work on `blob:` URLs under this policy in Chrome, Firefox and Safari.

The frame runtime listens for `securitypolicyviolation` and reports each block to the parent through a new bounded error kind (`network`). The UI can then explain what happened (§4.5.5).

#### 4.5.4 Caching and the overlay frame

All parent fetches go through the resolver's single cache (§4.4). The main and overlay frames ask the same cache, so each URL is downloaded once per session, and immutable ones once ever (until eviction). Today the overlay frame downloads the HDR (≈ 1.5 MB) and backdrop (1.3 MB) a second time. Frames with an opaque origin may also miss the browser HTTP cache. Chromium partitions that cache by site, and an opaque origin is likely a fresh partition per frame. I haven't verified this; S6 measures it. The parent-side cache makes the question moot.

#### 4.5.5 Behaviour change for custom code

Code nodes and geometry scripts that load URLs themselves will be blocked. That covers `fetch(...)`, `new THREE.TextureLoader().load('https://…')`, `new Image()` with a remote `src`, and the like. The frame reports "Custom code tried to load `<origin>`. Network access from code is blocked; use a Texture node." through the `network` error kind.

What users do instead: put the URL in a Texture node (or upload the file) and wire its output into the code node. The Texture node takes a UV input, so most custom sampling still works. I haven't verified whether code-node inputs can carry a texture object rather than a sampled value. S6 checks; if not, F6 adds texture-typed code-node inputs. Exported code is unaffected, because it runs on the user's own page.

M0b counts code strings containing `http`, `.load(` or `fetch(`, so the owner sees how many projects this affects before step 2b ships.

Clone and import show one line when the incoming graph has code nodes or geometry scripts: "This project includes custom code from someone else. It runs in a sandbox, but browsers can't fully stop it from leaking textures you add. Only add private textures to code you trust."

#### 4.5.6 Residual channels

| Channel | Governed by the frame CSP? | Mitigation | Status |
| --- | --- | --- | --- |
| `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, `<a ping>` | Yes (`connect-src`) | — | Closed |
| `<img>`, CSS `url()` | Yes (`img-src`) | — | Closed |
| `<link rel=prefetch/preconnect>` | Yes: CSP3 governs resource hints through the union of all source lists | — | Closed (S6 confirms per browser) |
| Workers, nested frames, plugins, forms, popups, downloads, top-level navigation | Yes (`worker-src`, `frame-src`, `object-src`, `form-action`), and the sandbox has no `allow-popups`, `allow-downloads` or `allow-top-navigation` | — | Closed |
| **WebRTC.** `RTCPeerConnection` contacts STUN/TURN servers; data can leak in TURN credentials or ICE traffic without a completed connection | No. CSP3 defines `webrtc 'block'`, but WebKit hasn't implemented it (bug 255651, open). I found no shipped implementation in Chromium or Firefox (unverified) | Send `webrtc 'block'` anyway. Before graph code runs, the frame runtime deletes `RTCPeerConnection`, `webkitRTCPeerConnection`, `RTCDataChannel` and related constructors. That raises the bar but isn't a boundary: code may get fresh constructors from a same-origin `about:blank` child frame (whether `frame-src 'none'` stops that is unverified; S6) | **Accepted residual** |
| **Frame navigating itself** (`location.href = 'https://evil/?<data>'`, `<meta http-equiv=refresh>`, a link click). One navigation can carry a long URL | No. The frame's CSP has no navigation control (`navigate-to` is not in CSP3), and a sandbox can always navigate itself | Send `Content-Security-Policy: frame-src 'self'` on editor, share and standalone pages. A header with only this directive restricts nothing else. The embedding page's `frame-src` should apply to the iframe's own navigations, and the `srcdoc` frame should still load. S6 confirms both in all three browsers. The bridge also disposes a frame that navigates after boot | **Closed if S6 passes**, else accepted residual |
| **DNS prefetch** (`<link rel=dns-prefetch>`, data in hostnames) | Not mentioned in CSP3 | None cheap | **Accepted residual**: low bandwidth. S6 measures whether browsers act on it in a sandboxed `srcdoc` frame |
| Messages to the parent (error text ≤ 2000 characters, captures) | — | The parent validates them. Text is only shown in the UI or sent to the user's own AI provider. Captures become the project's own thumbnail | Accepted: no attacker-controlled destination |

The honest claim after step 2b: "Private files can't be read by other people. Code you put into your own project runs sandboxed without normal network access, but a few browser channels can't be blocked yet, so only add private textures to code you trust."

### 4.6 Thumbnails, AI previews, feedback

- **Thumbnails.** `updateThumbnail` stops calling `getUrl`. It stores `thumbnailUpdatedAt` and returns the canonical URL. `selectProjectSummary` and `get` return `thumbnailUrl` instead of `thumbnail`/`thumbnailStorageId`. For a public project that is the storage URL (from the `fileAccess` helper). For a private project it is the canonical `/files/t/` URL. During the transition, `thumbnail` is still returned until the new Next build is live (§6). A thumbnail stored while its project is public sets `thumbnailUrlExposed`. When the project goes private, the thumbnail is rotated like an asset (§4.11).
- **AI previews: stop storing them.** `capturePreviewImage` returns `{ mediaType, data: <base64>, width, height }`. `TOOL_SET.capturePreviewImage.toModelOutput` turns it into `{ type: 'content', value: [{ type: 'text', … }, { type: 'image-data', data, mediaType }] }`. AI SDK 6.0.134 supports `image-data` tool output, and `convertToModelMessages(messages, { tools: TOOL_SET })` already passes the tools. Cap the capture (e.g. ≤ 768 px JPEG, q≈0.8, about 100–200 KB base64), because history is re-sent on every turn and Vercel caps function request bodies at 4.5 MB. Keep at most N recent images in history and replace older ones with a text stub. Strip base64 from AI trace events. Remove the upload, register and cleanup path in `components/Preview.tsx` and `AiChatDock.tsx`. Keep the three `convex/ai.ts` mutations for one release for old tabs, then delete them.
- **Feedback.** `getFeedbacks` returns canonical attachment URLs. The admin page resolves them with the JWT. Raw feedback URLs only ever reached the admin's browser, so they need no rotation.

### 4.7 Graph data: logical reference

- Value shape stays `{ url, assetId }`. `assetId` is the truth, and `url` is the canonical URL for that ID. Plain string texture values that hold a canonical URL are also recognized. The app never writes a storage URL into graph data.
- `registerAsset` returns `{ assetId, url: canonical }`, not a storage URL: a fresh asset isn't public yet. `convex-adapter.ts::uploadAndLinkAsset` becomes upload, then register, then return. Linking is gone (pins come from the save), and so is unlink-before-upload, which fixes the "replacement unlinks before upload succeeds" part of finding #5.
- `linkAssetToNode`, `unlinkAssetFromNode` and `handleNodeDelete` become no-ops for one release (old tabs), then are removed with the `assetReferences` tables.
- **Server normalization on save** (during the D3 compatibility window): `projects.update/create/clone` and template saves rewrite any known legacy raw storage URL to its canonical URL, using the `legacyFileUrls` map (§5). Tabs opened before the deploy can't write raw URLs back after migration.
- `getAssetUrl`, `getNodeAssets`, `getAssetStats` and `hooks/use-asset-manager.ts` have no callers: delete them rather than port them.
- A test fails if `ctx.storage.getUrl` appears anywhere in `convex/` outside `convex/fileAccess.ts` (the public-URL helper, which returns URLs only for public files) and the migration module.

### 4.8 Share page, standalone embed, third-party iframes, code export

| Surface | Behaviour |
| --- | --- |
| `/share/[projectId]` | Holder = that project. `projects.get` returns `publicAssetUrls`. Anonymous viewers get public assets by storage URL, fetched by the parent. The owner viewing their private project gets private assets through the route with the JWT. |
| `/editor/standalone?projectId=` (incl. the landing demo and third-party iframes) | `getPublicStandalone` returns graph data with canonical URLs plus `publicAssetUrls`. No token. IndexedDB `standalone:` assets are unchanged. |
| Host `load` command with arbitrary JSON | The parent asks `fileAccess.publicAssetUrls` for the asset IDs it contains. Public assets work. Private ones show "texture unavailable". This is the intended behaviour. |
| `getCode` to host / `CodePanel` copy | Export substitutes the public storage URL for each public asset. Those load cross-origin from any site, as today, and die when the file stops being public (rotation, §4.11), which is correct. Private assets keep their canonical URL, which won't load off-site. For those, show a short hint in CodePanel ("textures in this project are private; make it public or download them"). |
| Gallery / favourites | Public thumbnails as plain `<img src>` storage URLs, with `loading="lazy"`. |
| Dashboard | Public thumbnails as storage URLs; private ones through the resolver. |

### 4.9 JSON export/import, paste, templates

- **Export** keeps canonical URLs and `assetId`s.
- **Import or paste into your own project:** the next save derives pins. Your own assets get `own` pins; foreign assets get `adopted` pins if they are currently readable to you (public source, or another project you own). Otherwise they show "texture unavailable". Imported code runs under the frame CSP of §4.5. Imported JSON that names your own private asset IDs is threat 5, and §4.5 handles it.
- **Exporting a private project for someone else** works only if bytes are embedded. Optional follow-up F1: "Export with assets" inlines the files (zip, or base64 in JSON). Import uploads them as the importer's new assets.
- **Subgraph templates** get pins like projects (holder = template). A public template's assets are therefore public, and inserting the template into a project adopts them on the next save, with `publicAtPin: true`. Code-node templates hold no assets.

### 4.10 Clones and lifecycle (finding #5)

- **Clone is server-side.** `projects.clone({ sourceId, name })` reads `source.graphData` itself. The current caller-supplied `graphData` argument is accepted and ignored for one release, then removed. It applies the guest limit (already there), copies the graph, and derives pins. The source is public, so every source asset is public, and the clone gets `adopted` pins with `publicAtPin: true` and `adoptedFrom: { projectId: sourceId }`. `CloneBanner` and the share page stop sending `graphData`.
- **"Logical copy" semantics.** The clone references the same asset rows; bytes are not duplicated. Its pins keep those assets alive. Deleting the source project, removing the texture from the source, or making the source private does not affect the clone. If the clone itself is public, those assets stay public through it. This matches "cloned while public = downloaded"; say so in the visibility toggle's help text.
- **GC** (`garbageCollectAssets`, rewritten): delete an asset row when it has no active pins, and every soft-removed pin (or, for never-pinned assets, `createdAt`) is older than the 7-day grace. Delete the storage file only through `deleteOwnedFile`, as today: it needs an owner binding, and no other asset row may point at that storage ID. Also delete expired soft-removed pins.
- **Project / template delete:** remove that holder's pins (soft for the grace period), so GC decides. If the holder was public, apply §4.11.
- **Account deletion** (`deleteUserFiles`). Thumbnails, AI previews and feedback files are deleted as today. For each asset the user owns:
  1. If the user ticked "Also remove my files from other people's copies" (D8), delete it.
  2. Else, if an active pin from another user's holder has `publicAtPin: true`, keep the asset. Move its ownership (asset row `userId` and storage binding) to the owner of the oldest such pin, and remove the other foreign pins that lack `publicAtPin: true`. The asset then follows the normal rules: if no public holder pins it any more, it is rotated (§4.11), so URLs minted while it was the deleted user's public file die.
  3. Else delete it. That includes assets held only by legacy pins of unknown history (§5 M1b) and assets adopted through a holder that was never public. Other users' projects that pinned it show "texture unavailable".

  Every asset still has exactly one owner. *Owner decisions D2 and D8.*
- **Delete-account dialog** (`components/dashboard/Sidebar.tsx`). A new `users.deletionPreview` query returns the number of the user's files that other people copied while public. If it is zero, the dialog keeps today's text. Otherwise, draft copy:

  > **Delete account?**
  > This permanently deletes your account, your projects, templates and uploaded files. This can't be undone.
  > *N* of your files are used in other people's projects, because they cloned or copied them while your project was public. Those copies stay with them and move to their account.
  > ☐ Also remove my files from other people's copies. Their projects will show "texture unavailable".

- **Privacy policy.** There is no privacy policy page in `app/`. If one exists elsewhere, or is added, it should say: files in public projects can be copied by others; those copies can stay in other users' projects after you delete your account, unless you choose to remove them; and files in private projects are deleted with your account. Today's dialog promises deletion of "all associated data". The checkbox keeps that promise available to anyone who wants it. Whether this meets a specific legal obligation is for the owner to check.
- **Guest → account linking:** pins point at holders, not users, so nothing changes. `transferFileOwnership` already moves bindings and the user migration moves assets and projects.
- **Quota/stats** stay per owner (assets row). Adopted pins don't count against the adopter, until a transfer under D2 makes them the owner.

### 4.11 Public files and visibility changes

**When a file is public.**

- **An asset** is public if at least one *active* pin comes from a public holder: a public project or a public subgraph template. It doesn't matter whether the pin is `own`, `adopted` or `legacy`, or who is asking.
  - An asset pinned by both a public and a private holder is public. Its bytes are world-readable through the public holder anyway, so private viewers get the storage URL too.
  - A clone is created private, so its adopted pins don't make anything public. The asset stays public while the source (or any other public holder) pins it. If the cloner makes the clone public, the asset is public through the clone, even after the source goes private.
  - Soft-removed pins and deleted holders count for nothing.
- **A thumbnail** is public if its project is public.
- **Feedback attachments** are never public.

**What is stored and what is resolved.** Graph data stores the canonical `{ url, assetId }` (§4.7), and `assetId` is the source of truth. At load time:

- The query that already loads the holder (`projects.get`, `getPublicStandalone`, `templates.getSubgraphTemplate`) also returns `publicAssetUrls: Record<assetId, string>` for the public assets the holder pins. These come from `ctx.storage.getUrl`, called only in `convex/fileAccess.ts`. This adds no function call. Queries are reactive, so the map updates when a file is rotated.
- `fileAccess.publicAssetUrls({ assetIds })` (bounded to 64 IDs) covers JSON loaded by a host, and pastes before the next save.
- Everything else goes through the authorized route (§4.3).

**Exposure flag.** `assets.urlExposed` and `projects.thumbnailUrlExposed` mean "a storage URL for the current storage ID may exist outside our database". They are set, in mutations, when a file becomes public. M0a sets them on every legacy file, because each one had a raw URL minted. Rotation clears them. Only exposed files are ever rotated. This replaces `legacyUrlLive`/`thumbnailLegacyUrlLive` from the first draft.

**Transitions.**

| Event | Effect |
| --- | --- |
| **Private → public**: a holder is made public; a public holder's save pins an asset; a thumbnail is stored on a public project | Set the exposure flag. No copy. The storage URL is served from now on. Cost: none. |
| **Public → private**: a holder is made private or deleted; the last public holder's save soft-removes an asset; a public template is made private or deleted; account deletion removes the last public holder | The mutation that makes the change lists the assets (and thumbnail) that just lost their last public pin, with a bounded scan per holder (a paginated scheduled job for large holders). It schedules `fileRotation.check` for each one after the debounce (D7: 10 minutes). |
| `fileRotation.check` runs | If the file is public again, or not exposed, stop. Otherwise rotate it: a Node action (`"use node"`, 512 MiB) does `storage.get` → `storage.store`. A mutation then checks the row still points at the old ID, binds the new file (same owner and purpose), repoints `assets.storageId` / `projects.thumbnailStorageId`, inserts a `storageRotations` row and clears the flag. At most one rotation per file per hour (D7): a second request within the hour is rescheduled. |
| Finalize | After the grace period (D7: 1 hour), delete the old storage file through `deleteOwnedFile`, only if the new file's `sha256` matches. Unlike M3 this runs automatically. It deletes a superseded copy whose bytes exist under the new storage ID, so no data is lost. |

**Who triggers it:** the server, from the mutation that changes visibility or pins. No client call is involved. The owner can force an immediate rotation of one project with `files:rotateProjectFiles { projectId }`, which skips the debounce and grace.

**How long until old URLs die:** debounce (10 min) + copy time + grace (1 h), so about 70 minutes (D7). Browsers that already downloaded the file keep their copy (non-goal).

**Cost:** per rotated file, egress equal to its size (reading a file inside a function is billed egress), double storage for the grace period, and about 4 function calls (check, Node action, repoint, finalize). Toggling visibility back and forth costs at most one rotation per file per hour.

**Threat 1 under this design:** a storage URL is minted only while a file is public. When it stops being public, rotation kills every URL minted for it: in logs, at AI providers, in exported code, in forwarded JSON. Files that were never public after Convex A never had a URL. Legacy files are handled by M2 and M3.

## 5. Migration plan

All steps are internal functions run with `npx convex run` (`--prod` for production). They are paginated and reschedule themselves, like `files:backfillStorageBindings`, are idempotent, and keep progress in `storageMaintenance`. **Only M3 deletes production data, and only when the owner runs it explicitly.** M2 can delete a fresh copy that M2 itself just created, if the row it was for vanished mid-rotation. That copy is either deleted at once or left unbound for the existing orphan sweep. (The automatic finalize in §4.11 handles runtime transitions after migration. It is not part of these steps.)

New tables:

```ts
legacyFileUrls: defineTable({ url: v.string(), assetId: v.optional(v.id("assets")), projectId: v.optional(v.id("projects")) })
    .index("by_url", ["url"]),
storageRotations: defineTable({
    oldStorageId: v.id("_storage"), newStorageId: v.id("_storage"),
    assetId: v.optional(v.id("assets")), projectId: v.optional(v.id("projects")),
    sha256: v.string(), rotatedAt: v.number(), finalizedAt: v.optional(v.number()),
    // "migration": finalized by M3 (owner-run). "transition": finalized automatically after the D7 grace.
    source: v.union(v.literal("migration"), v.literal("transition")),
}).index("by_old", ["oldStorageId"]).index("by_pending", ["finalizedAt"]),
// assets: + urlExposed?: boolean, lastRotatedAt?: number
// projects: + thumbnailUpdatedAt?: number, thumbnailUrlExposed?: boolean
```

| Step | What | Destructive? |
| --- | --- | --- |
| **M0a — URL map** | For each asset and thumbnail, record `getUrl(storageId)` → owner row in `legacyFileUrls`. Set `urlExposed` / `thumbnailUrlExposed`. | No |
| **M0b — Inventory (dry run)** | Read-only report (logged plus stored in `storageMaintenance`): assets and bytes split private/public; thumbnails split; projects and templates holding raw URLs; **foreign references** (project of user U → asset of user V), split by whether the asset is currently public; raw URLs inside code strings; **code that loads URLs itself** (code strings containing `http`, `.load(` or `fetch(`; §4.5.5); raw storage URLs with no map entry (ai-preview URLs, other deployments, thumbnails used as textures); disputed bindings. The owner reviews this and picks D1 and D2. | No |
| **M1 — Pins + rewrite** | Per project and per subgraph template, in one mutation each: rewrite raw URLs → canonical (in `AssetValue`s, in plain strings, and as substrings in code text), fill in a missing `assetId` where the URL maps to an asset, and derive pins. Legacy foreign references follow D1 (default: `legacy` pin, which preserves today's working clones). Stamp `fileRefsVersion: 1` on the holder. | Rewrites `graphData` (a reversible mapping; the raw→canonical table is kept) |
| **M1b — Classify legacy pins** | After M1 has covered every holder: set `publicAtPin: true` on each `legacy` pin whose asset is public at that moment. That is "public when the pin was created", since M1 created it. Leave the rest without `publicAtPin`: their history can't be proven. Clone provenance was never recorded, so a pin from a clone of a project that later went private can't be told apart from a leaked URL pasted into a graph. Under D2 these are deleted on account deletion. | No |
| **M2 — Rotate exposed private files** | For each asset/thumbnail with `urlExposed` that is **not** public (§4.11): the same rotation code as §4.11, run as a sweep, with `source: "migration"`. Old files are kept. Disputed bindings get one copy per row, are left un-finalized, and are listed for the owner. | No (copies only) |
| **M3 — Finalize (owner-run)** | `files:finalizeRotations { dryRun: true }` prints the count and bytes. `{ dryRun: false }` deletes old storage files and their bindings for `source: "migration"` rows where the new file exists with the same `sha256`. **This is the moment old URLs of private files are revoked.** | **Yes, explicit** |
| **M4 — Cleanup (owner-run, after D3 days)** | Remove save-time normalization; drop `projects.thumbnail`, `legacyFileUrls`, `assetReferences`, `deletedAssetReferences` and the no-op mutations. Optionally `files:purgeLegacyAiPreviews { dryRun }` for leftover ai-preview captures. Public legacy files need no rotation: their raw URLs are simply their public storage URLs, and they die by rotation if the file ever stops being public. | **Yes, explicit** (drops legacy tables) |

Cost of M2: Convex egress ≈ total bytes of private legacy files (reading files inside functions counts as egress), plus temporarily doubled storage for those files until M3. The M0b report gives exact figures. As a reference: Starter is $0.132/GB egress after 1 GB, and Professional includes 50 GB then $0.12/GB.

**Residual exposure**

| Period | Who can still fetch what |
| --- | --- |
| Until Convex A deploy | Everyone with any raw URL, forever. New uploads still get raw URLs. |
| Convex A → M1 | New uploads are private from the start (no raw URL ever minted). Legacy raw URLs are still emitted to authorized viewers by old code paths. Transition rotation (§4.11) does nothing yet for legacy holders, because they have no pins. |
| M1 → M3 | The app no longer emits legacy raw URLs for private files (once the Convex B deploy is live). **Anyone already holding one can still fetch it.** Keep this window short: M2 and M3 directly after M1 has been checked. Transition rotation now works for every holder. |
| After M3 | Raw URLs of files that were private at M2 are dead. Raw URLs of public files keep working while they stay public; that is how public files are served. A project made private after M1 has its files rotated automatically within about 70 minutes (D7). |
| After M4 | Only public storage URLs and the per-request-authorized routes remain. Former public viewers may keep browser-cached copies. |

## 6. Rollout order

Each numbered phase is its own branch and PR, per the owner's one-follow-up-per-branch rule. Step 2 is two PRs.

0. **Spikes on the dev deployment** (S1–S7 below). No code lands.
1. **Deploy Convex A** (backward compatible): schema additions, `/files/*` routes (anonymous rejected early), `fileAccess` with `publicAssetUrls` (in the loading queries and standalone), pin derivation on saves including `publicAtPin`, exposure flags and `fileRotation` (check, rotate, automatic finalize) with transition hooks, save-time normalization, server-side clone (ignores `graphData`), `registerAsset`/`updateThumbnail` return canonical URLs, projections return both `thumbnail` (legacy) and `thumbnailUrl`, link/unlink become no-ops, the D2/D8 account-deletion policy and `users.deletionPreview`. Old clients keep working: they still render the raw URLs stored in graphs.
2. **Deploy Next.**
   - **2a.** Resolver, bridge integration for Convex files, UI hooks, upload flow, clone callers, inline AI images, admin feedback, CodePanel export substitution and hint, gallery `loading="lazy"`, delete-account dialog with the D8 checkbox. Old tabs keep working until reload, except AI capture, which uses the old mutations kept in step 1.
   - **2b. Sandbox egress (core, formerly F2).** Parent fetches every frame URL (§4.5.2), snapshot fields for HDR and backdrop, the new frame CSP, `network` violation reporting, the `frame-src 'self'` header on editor/share/standalone pages (if S6 passes), the clone/import code warning. Ship right after 2a and before M1. **Files are not described as private anywhere until 2b is live and M3 has run.**
3. **Run M0a, then M0b** on prod. The owner reviews the report and decides D1, D2 and D3.
4. **Run M1, then M1b.** Check counts against M0b. Spot-check share, embed and editor on a few real public and private projects.
5. **Deploy Convex B**: stop returning `thumbnail`/`thumbnailStorageId`, no `getUrl` outside `fileAccess` and the migration module, `getFeedbacks` canonical, CI guard test enabled.
6. **Run M2** (copies). Check rotation count = M0b count of exposed private files, and spot-render rotated textures.
7. **Owner runs M3** dry run, then the real run.
8. **After D3 days, M4** plus the cleanup deploy (drop no-op mutations, `ai.*` upload mutations, legacy tables).

Deploy Convex before Next at each step (as in the security rollout). Do not run M1 before the Next deploy: old clients without the resolver would send canonical URLs to the frame, and private textures would fail in those tabs.

## 7. Test plan

**Spikes (dev deployment, before implementation)**

- **S1.** Is a `getUrl` URL derivable from its storage ID? Compare the two. If yes, storage IDs given to uploaders and to public viewers (`thumbnailStorageId`) are secrets too, which widens what M2 must rotate.
- **S2.** Serve 1, 25 and 50 MB files from an HTTP action via `new Response(blob)`: memory, time to first byte, throughput, and whether the action holds a concurrency slot while a slow client downloads. Decide the asset cap (D5).
- **S3.** CORS from `localhost:3000` and the prod origin: preflight caching, `304` revalidation with `Authorization`, Cache Storage persistence. Check in Chrome, Firefox and Safari.
- **S4.** `toModelOutput` with `image-data` across the configured providers (Anthropic, OpenAI, Google). Confirm the model receives pixels.
- **S5.** Rotation in a Node action: a 50 MB copy, `sha256` equality, and binding plus repoint in the follow-up mutation.
- **S6. Frame CSP and loader compatibility** (Chrome, Firefox, Safari):
  - Run every bundled example (`public/*.json`), the tutorials, a sample of `tsl-textures` nodes, every HDR preset, the backdrop, and textures in PNG, JPEG, WebP and AVIF, on WebGPU and the WebGL2 fallback. Record any `securitypolicyviolation`.
  - Confirm `TextureLoader`, `GLTFLoader` (embedded image, `ImageBitmapLoader`) and `RGBELoader` work on frame-local `blob:` URLs under the new policy.
  - Run an exfiltration probe graph: a code node that tries `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, `<img>`, CSS `url()`, `<link rel=prefetch/preconnect/dns-prefetch>`, `new Worker`, `RTCPeerConnection` (also from an `about:blank` child frame), `location.href`, `<meta http-equiv=refresh>` and a link click, all to a test host. Record what each browser blocks.
  - Check that `frame-src 'self'` on the parent page blocks the frame's self-navigation without breaking the `srcdoc` frame.
  - Check the opaque-origin HTTP cache behaviour (§4.5.4), and whether a few common image hosts accept the app origin as `Origin`.
  - Check whether a code node can take a texture object as an input (F6).
- **S7. Convex billing and storage serving.**
  - Fetch a storage URL N times, call an HTTP action that runs one query N times, and call a rate-limiter `limit` from an HTTP action N times. Read the usage dashboard to confirm A1–A3, and whether `ctx.auth.getUserIdentity()` in an HTTP action is a separate call.
  - Check whether a 404 on a storage URL counts.
  - Record storage-URL response headers (`Cache-Control`, `Access-Control-Allow-Origin`, `ETag`). Exported code relies on cross-origin use, as it does today.
  - Check whether an HTTP action can see the client IP.

**Automated (Vitest, fake ctx like `convex/files.test.ts`)**

- Pin derivation: own / adopted / ignored (foreign private); soft-remove and reactivation without re-check; nested subgraphs and code nodes; canonical-URL strings; malformed or other-deployment IDs; walk bounds; template holders. `publicAtPin: true` and `adoptedFrom` when adopted from a public holder; `publicAtPin` inherited when adopted through another holder the same user owns; values kept on reactivation; clone pins carry `adoptedFrom: sourceId`.
- ACL matrix: {anonymous, owner, other user} × {private, public holder} × {no context, matching context, wrong context} × {pinned, soft-removed, unpinned own, deleted}. **Confused-deputy case:** victim JWT + attacker's public project context + victim's asset → 404. Anonymous requests return 404 **without calling `runQuery`**. Thumbnails owner-only; feedback admin-only; identical 404 for missing and forbidden.
- Route handler: headers for each case (CORS, `Cache-Control`, `Vary`, `nosniff`, CSP, content-type allowlist), ETag → 304, OPTIONS.
- Public URLs: `publicAssetUrls` contains exactly the assets with an active public pin, from public and private holders alike; never for soft-removed pins, deleted holders or private-only assets; bounded input.
- Transitions and rotation: a public pin activates → flag set, no rotation; the last public pin goes (visibility toggle, holder delete, soft-remove, template made private, account deletion) → check scheduled after the debounce; the check skips a file that is public again or not exposed; the per-file hourly limit reschedules; rotation repoints, binds and clears the flag; finalize deletes the old file only after the grace and only with a matching `sha256`; thumbnails rotate when their project goes private; the race with asset or project deletion.
- Clone: caller `graphData` ignored; pins created; deleting the source project, then running GC past grace, leaves the clone's assets intact; guest limit.
- GC: deletes only past grace with no active pins; storage deleted only with a binding and no other row on that storage ID.
- Account deletion (D2, D8): a foreign pin with `publicAtPin: true` → ownership moves to the oldest such pin's owner, and other foreign pins are removed; a foreign pin without it (legacy unknown, or adopted through a never-public holder) → the asset is deleted; the "also remove" option deletes everything; a transferred asset with no remaining public holder gets a rotation scheduled; `deletionPreview` counts match.
- Migration: map building; inventory counts, including code that loads URLs; rewrite in values, strings and code substrings; idempotent rerun; D1 policy; M1b classification; save-time normalization of raw URLs sent by an "old client"; rotation idempotency; `finalizeRotations` dry run deletes nothing, and the real run deletes only verified `migration` rotations.
- Client: resolver token caching and expiry; credentials attached only for rule-2 route requests with host context; holder never taken from graph content; public assets fetched from storage URLs without credentials; `collectFrameUrls` reads only texture-node `url` values plus HDR and backdrop, never note text; classification rules 1–7, including rejection of other app paths, other Convex site paths and `http:`; HDR name allowlist; size caps enforced while streaming, including a lying `Content-Length`; type and magic-byte checks; one fetch for main + overlay frames; LRU eviction revokes object URLs; negative cache cleared after save; Cache Storage cleared on sign-out. Bridge: URLs collected and sent as Blobs, `environmentUrl`/`backdropUrl` rewritten, still no RPC surface. AI tool `toModelOutput` shape; trace truncation.
- Frame CSP: `previewDocument` contains exactly the §4.5.3 policy, with no `https:` or `http:` anywhere. The runtime removes the WebRTC constructors before graph code runs, and forwards `securitypolicyviolation` as a bounded `network` error.
- Guard: no `storage.getUrl` in `convex/` outside `fileAccess.ts` and the migration module.

**Manual browser checks (owner)**

The editor with private textures (upload, replace, undo/redo, node thumbnails, inline previews, image export); the share page signed out and as owner; the standalone embed via the landing demo and a scratch third-party HTML page, including `getCode` output loading textures off-site; dashboard private thumbnails and the public gallery; clone → delete source → (dev, shortened grace) GC; make a public project private → (dev, shortened debounce and grace) its old storage URLs stop working; JSON export/import own and foreign; template insertion; AI capture per provider; admin feedback attachments; sign out → sign in as another user on the same browser (no cached private bytes shown); Safari.

Sandbox egress: load the S6 exfiltration probe as a cloned project that uses a private texture. The test host receives nothing except through the channels §4.5.6 accepts. An external CORS-enabled texture URL still renders, a non-CORS one shows the CORS message, HDR presets and the backdrop still load, and the network panel shows one download of each for the main and overlay frames together.

Account deletion with the dialog in both states, checked and unchecked.

**Migration rehearsal:** run M0–M3 on a dev deployment first. Rehearsing on a copy of production data (`npx convex export` / `import` into dev) is more faithful but copies user data. *Owner decision D4.*

## 8. Work estimate

Focused solo days, including tests. Ranges reflect unknowns resolved by the spikes.

| Phase | Scope | Days |
| --- | --- | --- |
| 0 | Spikes S1–S7 (S6 is a cross-browser probe) | 1.5–2 |
| 1 | Convex A: schema, pins + derivation (`publicAtPin`), `fileAccess` + `publicAssetUrls`, HTTP routes, exposure flags + transition rotation, server clone, normalization, upload/thumbnail changes, GC rewrite, account-deletion policy + `deletionPreview`, tests | 5–6 |
| 2a | Next: resolver + caches, bridge for Convex files, UI hooks (node preview, AssetInput, cards, admin), upload adapter, clone callers, AI inline images, CodePanel export + hint, gallery lazy loading, delete-account dialog, tests | 3–4 |
| 2b | Sandbox egress: parent fetch rules for all frame URLs, HDR/backdrop protocol fields, frame CSP, WebRTC hardening, `network` errors and messages, `frame-src` header, clone/import warning, tests | 1.5–2 |
| 3 | Migration M0–M3 functions (rotation code shared with phase 1), M1b, report, tests, dev rehearsal | 2–3 |
| 4 | Convex B cleanup, prod rollout steps 3–7, fixes from the owner's browser testing | 1–2 |
| **Core total** | | **14–19** |
| Optional F1 | "Export with assets" (embedded bytes) plus import upload | 1–2 |
| Later | M4 cleanup plus legacy-table removal | 0.5 |

Compared with the first draft (11–15 days): F2 moves into the core (+1.5–2), the hybrid adds public-URL resolution and automatic transition rotation (+1–1.5), and spikes S6–S7 add about half a day. M4 gets smaller, because public legacy files no longer need rotating.

## 9. Decisions needed from the owner

- **D1 — Legacy foreign references to currently-private assets** (counted in M0b). *Recommend: keep with a `legacy` pin.* These are almost always clones of projects that later went private. The cloner already holds a working URL to the bytes, and dropping the pin silently breaks their project. The alternative is to drop them and let those textures go missing after M3. Either way, these pins have no proven public history (M1b), so D2 treats them as "not copied while public".
- **D2 — Account deletion when others pinned your assets.** *Recommend: transfer only assets that another user pinned while they were public (`publicAtPin: true`; "cloned while public = downloaded") to the owner of the oldest such pin. Delete everything else, including assets held only by legacy pins of unknown history.* Clones made from public projects keep working. Files that were never public, or can't be shown to have been, leave with the user. Alternatives: delete everything (matches today's dialog text; breaks every clone's textures), or transfer everything (the first draft's recommendation; keeps files the user asked to delete online under someone else's account, including ones that were public only briefly or never). Check the privacy-policy wording in §4.10 either way.
- **D3 — Legacy compatibility window**: how long save-time normalization, the `thumbnail` field, `legacyFileUrls` and the no-op mutations stay before M4. Public legacy raw URLs no longer need a sunset: they are the files' public storage URLs, and they die by rotation if the file stops being public. *Recommend: 60 days.*
- **D4 — Rehearse the migration on a copy of prod data in a dev deployment?** *Recommend: yes,* if you are comfortable with user data in dev. Otherwise use a seeded dev deployment only.
- **D5 — Asset size cap** if S2 shows HTTP actions can't serve 50 MB comfortably. *Recommend: 32 MB.* The parent's fetch cap for textures (§4.5.2) follows it.
- **D6 — Withdrawn.** It set the cache lifetime of public route responses. Public files are now served by Convex storage URLs, whose cache headers we don't set (S7 records them), and the route serves only private responses (`private, no-cache`).
- **D7 — Rotation timing on public→private** (§4.11). *Recommend: 10-minute debounce, 1-hour grace before deleting the old file, at most one rotation per file per hour.* Old URLs then die within about 70 minutes. A shorter grace (even 0) kills them sooner, but leaves no time to recover from a repoint bug. A longer debounce saves copies when people toggle visibility quickly.
- **D8 — Default of "Also remove my files from other people's copies"** in the delete-account dialog. *Recommend: unchecked,* consistent with "cloned while public = downloaded" and the visibility toggle's help text. Checked by default would break other people's clones whenever someone deletes their account without reading the dialog.

## 10. Risks, rejected alternatives, follow-ups

- **Risk: preflight latency on far-away connections.** Each private URL costs about 2 round trips the first time. Mitigated by Cache Storage (immutable URLs) and a 2 h preflight cache. Fallback: proxy private thumbnails via a Next route with `jwtCache` (option B, thumbnails only).
- **Risk: autosave races** between pin derivation and a stale tab. Pins are recomputed from whatever graph is saved last, and soft-remove plus reactivate makes flip-flopping harmless. The D7 debounce keeps flip-flopping from triggering rotations.
- **Risk: Convex function-call volume.** Public files cost what they cost today (A1). The authorized route costs 2 calls per private request plus OPTIONS, and serves only owners and the admin. Watch the usage dashboard after rollout. If A1 or A2 turn out wrong in S7, recompute §3.1. The hybrid is never more expensive than option A.
- **Risk: abuse of public files** (calls and egress), as today (§3.2). Escalation path F5.
- **Risk: residual exfiltration channels** in the frame (§4.5.6), mainly WebRTC. They need code the user put into their own project. Watch browser support for CSP `webrtc`.
- **Risk: CSP breaks existing custom code** that loads URLs itself (§4.5.5). M0b sizes it before step 2b ships. The fix for users is a Texture node; F6 covers code that needs a texture object.
- **Risk: Convex changes storage URLs** (for example, expiring URLs). A Convex staff member has said storage URLs don't expire today. If that changes, `publicAssetUrls` is already resolved at load, so only exported code would be affected.
- **Rejected:** giving the preview iframe `allow-same-origin` or any credentials; JWT in query strings; signed URLs as the primary mechanism (§3 C); per-clone byte duplication (needless storage and egress; pins give the same durability); trusting `graphData` or client link calls for access; serving public files through the HTTP route (§3.1–3.4); rate limiting every public file request (§3.3: adds a mutation per request, and there's no documented client IP to key on); a CDN in front of public files for now (§3.3).
- **F1** Export with embedded assets. **F2** Moved into the core (§4.5). **F3** Denormalized `publicHolderCount` if pin scans grow. **F4** Optional custom domain for `/files` (one more M1-style rewrite). **F5** If the usage dashboard shows abuse: a per-user limit on the authorized route (the existing `uploadGrants` counting pattern, or `@convex-dev/rate-limiter`), and/or a CDN in front of public storage URLs on a custom domain. **F6** Texture-typed code-node inputs, if S6 shows code nodes can't take a texture object.

## Sources

- Convex HTTP actions (limits, Bearer auth, CORS): https://docs.convex.dev/functions/http-actions
- Convex limits and pricing (function calls per plan and what counts as one, "file accesses" included; egress; database I/O; action and HTTP-action concurrency; US prices, other regions 1.3×): https://docs.convex.dev/production/state/limits
- Convex serving files (`getUrl` is public; revoke by deleting the file): https://docs.convex.dev/file-storage/serve-files
- Nested calls metered separately (community thread with a Convex staff reply; not official billing docs): https://discord-questions.convex.dev/m/1281660927564976199
- Storage URLs don't expire today (Convex staff, community thread): https://discord-questions.convex.dev/m/1432028859921862776
- `@convex-dev/rate-limiter` (token bucket / fixed window, sharding, `limit` vs `check`): https://www.convex.dev/components/rate-limiter and https://github.com/get-convex/rate-limiter
- Vercel pricing (Fast Data Transfer): https://vercel.com/pricing
- CSP Level 3 (the `webrtc` directive; resource hints governed by `default-src`/source-list union; no `navigate-to`; `frame-ancestors` and `sandbox` ignored in `<meta>`): https://w3c.github.io/webappsec-csp/
- MDN CSP reference (fetch directives and fallbacks) and `frame-src`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy and https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-src
- WebKit bug 255651, "Add support for the webrtc CSP directive" (open): https://bugs.webkit.org/show_bug.cgi?id=255651
- Data leaks through WebRTC TURN credentials, and `connect-src` not covering WebRTC: https://github.com/w3c/webappsec-csp/issues/92 and https://lists.w3.org/Archives/Public/public-webrtc/2018Jan/0109.html
- HDR preset headers and sizes: `curl -I` against `raw.githubusercontent.com/pmndrs/assets/main/src/hdri/*.hdr`, 18 October 2026.
- Installed packages checked: `next@16.3.8` route-handler docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`: handlers uncached by default, `params` is a Promise), `convex@1.34.0` (`httpRouter` `pathPrefix`, `ctx.storage.get`), `@convex-dev/better-auth` (15-minute JWT default, `getToken` without `jwtCache` fetches `/api/auth/convex/token` per call), `ai@6.0.134` (`image-data` tool output).
- Code read for this revision: `lib/preview-sandbox/{security,bridge,assets,runtime}.ts(x)`, `UnsafePreviewCanvas3D.tsx` (lines 581, 633), `lib/compiler.ts:734`, `lib/nodes/texture.ts`, `next.config.ts`, `convex/{files,assets,projects,templates,users}.ts`, `components/dashboard/{Sidebar,CommunityProjectCard,ProjectCard}.tsx`, `components/preview/PreviewControls.tsx`.
