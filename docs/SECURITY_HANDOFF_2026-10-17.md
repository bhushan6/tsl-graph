# TSL Graph — conversation and security implementation handoff

Prepared: **17 October 2026**, Asia/Kolkata.

This is a self-contained engineering handoff, summarizing the conversation, decisions, review evidence, actual working-tree changes, and unfinished work. It is not a verbatim transcript. Read this document before making changes, then verify the current files: the filesystem is authoritative.

## Status update (later on 17 October 2026) — supersedes "not implemented" notes below

Still uncommitted and undeployed. Verified with `npx vitest run` (870+ pass; only the known flaky "debounces autosave for burst edits" fails), `npx tsc --noEmit`, ESLint on touched files, and a passing `npm run build`. **Not browser-tested** (the owner tests UI manually).

Done:

- **Preview isolation finished.** All graph code (materials, post, node previews, geometry scripts) runs only in `lib/preview-sandbox` iframes (`sandbox="allow-scripts"`, opaque origin). Image export and AI/thumbnail/snapshot captures go through the bridge; `lib/export-image.ts` no longer evaluates graphs. Dead `components/NodePreview.tsx` removed. Browser-local `blob:` textures are sent to the frame as bytes; public static textures/models get `Access-Control-Allow-Origin: *` (`next.config.ts`). Uniform updates/removals/clears are mirrored; the overlay frame mirrors the main camera for post-graph node previews. `assertIsolatedPreview` now also refuses non-browser runtimes other than Vitest. `npm run dev` now runs an esbuild watcher for the sandbox bundle (`scripts/dev.mjs`).
- **Message hardening.** Standalone editor and postMessage adapter accept host messages only from `window.parent`, and from the exact origin when `targetOrigin` is set; invalid `targetOrigin` disables the channel. Landing demo only trusts its own iframe.
- **Storage ownership** (`convex/files.ts`): grant-backed, rate-limited upload URLs; uploads are bound to their uploader on claim (assets, thumbnails, AI previews, feedback); deletion and GC require an owner binding; guest linking transfers bindings; account deletion deletes only bound files; `getAssetUrl`/`getNodeAssets` enforce owner/project visibility; feedback uploads require sign-in; guests' clone limit enforced. `ai.getPreviewUrl` replaced by `ai.registerPreviewImage`.
- **Also fixed:** open redirect / `javascript:` XSS via `/sign-in?redirect=` (`lib/safe-redirect.ts`); pre-existing `lib/registry.test.ts` type error that blocked `next build`.

Rollout order: deploy Convex first, then Next (old tabs lose AI preview capture until reload). Then run the one-off backfill: `npx convex run files:backfillStorageBindings` (add `--prod` for production). Until it finishes, GC keeps legacy asset files and replaced legacy thumbnails are not deleted; after it finishes, an hourly cron sweeps unclaimed uploads older than 24 h (only files created after the backfill). Files uploaded manually through the Convex dashboard after that point would be swept too.

Still open: file-level privacy (existing Convex storage URLs stay publicly fetchable by anyone who has them; only the queries are ACL'd); Better Auth advisories requiring `@convex-dev/better-auth` 0.12; data-loss and performance findings (#4, #5, #10–#12).

## Start here

The user requested a thorough review of a live node-based Three.js Shading Language editor, then authorized implementing the **security fixes first**. Implementation was interrupted so the user could continue with another AI agent.

**The current working tree is incomplete and is not ready to deploy.** Account migration hardening and dependency updates are present. A preview isolation refactor is partially written. The storage security design was agreed between agents but has not been implemented in the checked files. Existing export paths and some preview paths still require integration.

- Repository: `/Users/bhushan/Documents/vscode/tsl-graph`
- Branch at handoff: `main`
- HEAD: `a7b309b51240964a4fc656483696c494ccf0e99b`
- HEAD subject: `Stop sending full graph data from project list queries`
- No commits, PRs, deployments, or production migrations were made by this security task.
- All security changes are uncommitted. Preserve unrelated user changes.
- The user explicitly authorized GPT-6 Luna sub-agents with **extra-high reasoning**, with the primary agent planning and reviewing. “Six Luna” meant the model **GPT-6 Luna**, not six agents.
- The three sub-agents were asked to stop, then interrupted for handoff. At interruption each reported `pending_init`; no fresh completion reports arrived. Do not depend on them continuing in another session.

Suggested initial instruction for the next agent:

> Continue the security fixes described in this document. Inspect the current working tree and AGENTS.md first. Preserve unrelated changes. Finish and test the account, storage, message-origin, dependency, and isolated-preview security work. In particular, do not treat the partial iframe refactor as finished: exports, private assets, styling, lifecycle, browser compatibility, and adversarial tests remain. Keep changes focused and reviewable; avoid a broad rewrite. Do not deploy the incomplete tree.

## User intent and decisions

The original review request:

- Project: node-based editor for Three.js Shading Language (TSL).
- Stack: Next.js, Convex, TypeScript, React, Three.js, Zustand, React Flow, Better Auth.
- Stage: live with users.
- Main concerns: performance and maintaining the project solo.
- Review priorities, in order: correctness, security, reliability, performance, concrete architecture/maintenance costs, important missing tests.
- Trace actual paths before reporting issues. Skip stylistic rewrites, naming/formatting nitpicks, and generic recommendations.

The user answered the follow-up questions:

1. **Production runs the reviewed revision/dependency set.** The identified issues were therefore relevant to production, not just a local branch.
2. Private projects should probably have private assets. The assistant recommended that visibility cover uploaded assets and that clones retain their assets independently. The user then approved starting the security work.
3. Typical/max graph size, texture size, and editing-session duration are unknown. No performance measurements from production are available.
4. Multiple-tab/device editing is not a present requirement, though useful later. The assistant recommended a minimal revision/conflict guard eventually, rather than full collaborative editing.

Agreed priority sequence: security fixes first; then unsaved-edit/asset-lifecycle data loss; then measured performance work. Do not silently expand the current task into all review findings.

The most recent request was to create this document for another AI agent to continue. No additional implementation was performed while preparing this handoff.

## Repository instructions and working conventions

The user supplied an `AGENTS.md` block, now also present at the repository root:

> This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

The block is generated/re-added by `next dev`. Do not repeatedly remove it to clean the diff. Read the current root `AGENTS.md` before resuming.

Skills already read/used in this conversation:

- `.agents/skills/react-doctor/SKILL.md`: diagnostic scan, then verify issues in actual code. Do not equate scanner warnings with confirmed defects.
- `.agents/skills/uncodixfy/SKILL.md`: apply when changing frontend UI; preserve the existing visual language rather than redesigning the editor.

Paths below are repository-relative unless explicitly absolute. Do not inspect or print secrets from environment files. Local tests used mocked backend contexts; no live exploit or production mutation was performed.

## Short codebase map

| Area | Responsibilities and data flow |
| --- | --- |
| `app/editor/[projectId]/page.tsx` | Queries project, constructs Convex host adapters, bootstraps `EditorHost`. |
| `app/share/[projectId]/page.tsx` | Loads a public project into the store and renders a read-only editor; clone/like actions. |
| `app/editor/standalone/standalone-editor-client.tsx` | Embedded editor, public project bootstrap, browser assets, host postMessage commands. |
| `components/editor-host/EditorHost.tsx` | Store initialization/reset, capabilities, template callbacks, autosave hook. |
| `store/editor.ts` | Graphs, undo/redo, code nodes, subgraphs, globals, preview settings, selection, dirty/saving state. |
| `store/live-uniforms.ts`, `lib/uniform-store.ts` | High-frequency uniform changes independent of structural recompilation. |
| `lib/registry.ts`, `lib/nodes/*` | Node definitions and supported ports/operations. |
| `lib/compiler.ts`, `lib/tsl-builder.ts` | Graph → generated TSL → evaluated Three.js materials/postprocessing. |
| `components/preview/*`, `NodeDebugPreviewOverlay.tsx` | Main preview and node previews. These are undergoing isolation changes. |
| `lib/export-image.ts` | Graph image export, offscreen node previews, stitched main shader preview. Not yet migrated to sandbox capture. |
| `lib/editor-host/adapters/*` | Convex/local/browser persistence and asset services. |
| `convex/*` | Auth, projects, templates, assets/references/GC, feedback, AI preview storage. |
| `app/api/ai`, `app/api/chat` | AI provider requests using user-supplied API keys. |
| `lib/ai/user-ai-settings.ts` | AI settings and key in browser localStorage under `tsl-ai-settings`. |

External services include Convex database/storage, Better Auth OAuth providers, AI providers, PostHog, and HDR/model/texture loading.

## Original review findings

These describe the reviewed baseline. Status below distinguishes fixes actually present from plans.

### 1. Critical: unauthenticated ownership transfer

- Location: `convex/users.ts`, `transferGuestDataToUser`; caller in `convex/auth.ts`.
- Baseline: public mutation accepted arbitrary source/destination user IDs without authenticating the caller or verifying an anonymous source.
- Consequence: account data could be transferred to another user. `.unique()` on source projects meant accounts with multiple projects could instead fail; it was not a security boundary.
- Evidence: mocked local handler invocation transferred a non-anonymous victim’s project without auth.
- Fix: internal mutation, trusted account-link invocation, validate source/destination, propagate failure.
- **Status: implemented locally, focused tests passed earlier.**

### 2. Critical: shared/imported graph code executes in application origin

- Locations: `components/preview/geometry.ts`, `lib/tsl-builder.ts`, public graph loading, standalone host commands.
- Baseline: `new Function` executes persisted geometry scripts and custom code; shared graphs reach it automatically.
- Consequence: code can read app storage, including saved AI API keys, and act in the application’s browser context.
- Evidence: benign local probe loaded persisted geometry code and read `tsl-ai-settings` from a stubbed localStorage.
- Additional surface: generated texture URL interpolation was unescaped; standalone messages lacked source/origin checks.
- Fix chosen: actual opaque-origin preview isolation, no application credentials in renderer, guarded execution sinks, trusted message senders.
- **Status: partial sandbox implementation; no end-to-end/browser proof yet. Standalone host message guards still absent.**

### 3. High: cross-user file deletion/adoption

- Locations: `convex/ai.ts::deletePreviewImage`, `convex/projects.ts::updateThumbnail`, asset registration, attachment adoption.
- Baseline: login alone authorizes deleting caller-supplied storage IDs. Thumbnail attachment accepts arbitrary IDs and later deletes the previous one.
- Consequence: someone knowing another file ID can delete it directly or through adoption/cleanup paths.
- Evidence: local handler probe deleted an arbitrary storage ID for a logged-in different user.
- Fix: server-established ownership/purpose on upload and checks on all adoption/deletion paths. Merely checking project ownership or allowing “first claim” of a storage ID is insufficient.
- **Status: not implemented in current files.**

### 4. High: navigation drops pending edits

- Locations: `lib/editor-host/use-editor-persistence.ts::dispose`, `components/editor-host/EditorHost.tsx` cleanup.
- Baseline: two-second debounce is canceled at unmount, then store reset loses graph/dirty state. No flush/recovery snapshot.
- Evidence: local probe saw zero saves after dirty → dispose → reset.
- Fix: per-project pending snapshot, drain before application navigation, durable local recovery for unload/crash. Flush must account for an in-flight save and newer edits.
- **Status: not changed; deferred beyond initial security scope.**

### 5. High: asset references diverge from graph contents

- Locations: `lib/editor-host/adapters/convex-adapter.ts`, `convex/assets.ts` GC, clone/save/undo paths.
- Baseline: replacement unlinks old asset before upload succeeds; undo restores graph but not Convex refs; clone copies asset IDs without refs; deletion leaves some refs behind.
- Consequence: seven-day GC can delete textures still used by restored/cloned graphs; orphan references also prevent cleanup.
- Evidence: failed-replacement probe; remaining paths traced statically.
- Fix: upload first, atomic replacement, reference reconciliation, explicit clone ownership/reference semantics.
- **Status: not changed. Security storage work must avoid making existing clones unreadable.**

### 6. High: vulnerable Next.js dependency

- Baseline pins/installed versions: Next.js `16.1.1`, React/React DOM `19.2.3`.
- Confirmed advisory: GHSA-h25m-26qc-wcjf / CVE-2026-23864 includes Next `<16.1.5` in the affected 16.x range and describes server DoS.
- **Status: manifest and lockfile updated locally to Next/eslint-config-next `16.3.8`, React/React DOM `19.3.0`. No successful final production build yet.**
- Verify current advisories at continuation; these were checked when the agent made the update. Do not blindly run broad `npm audit fix`.

### 7. Medium: private asset APIs lack authorization

- Locations: `convex/assets.ts::getAssetUrl`, `getNodeAssets`.
- Baseline: return URLs and metadata based only on supplied IDs, without project/caller ACL.
- Evidence: unauthenticated local handler probe returned a private asset.
- Fix: owner or authorized project-reference access; protected file delivery. Query checks alone cannot revoke already-issued public file URLs.
- **Status: not implemented.**

### 8. Medium: unauthenticated feedback upload issuance

- Location: `convex/feedback.ts::generateUploadUrl`.
- Baseline: unauthenticated upload URLs; later `submitFeedback` auth does not protect the upload endpoint. GC does not reclaim arbitrary unattached uploads.
- Fix: authenticated, bounded, purpose-scoped uploads; expire unattached uploads.
- **Status: not implemented.**

### 9. Medium: guest clone count breaks account migration

- Locations: `convex/projects.ts::clone`, `convex/users.ts` migration.
- Baseline: `create` limits guests to one project, `clone` does not; migration assumed one via `.unique()` and swallowed failures.
- Evidence: two mocked guest clones succeeded and migration then failed with multi-document state.
- **Status: migration now transfers all projects and throws on failure. Clone’s inconsistent guest limit remains.**

### 10. Medium: retry exhaustion does not stop autosave

- Location: `lib/editor-host/use-editor-persistence.ts`, catch/finally and subscription.
- Baseline: after retry budget is exhausted, dirty state causes ordinary autosave scheduling again.
- Evidence: with shortened timers and `maxRetries: 1`, more than ten attempts occurred in 500 ms.
- Fix: explicit exhausted/failure state; resume on new edit, reconnect or manual action. Existing test stops before the unwanted next attempt.
- **Status: not changed.**

### 11. Medium: texture/pass resource leaks across recompiles

- Locations: `lib/compiler.ts` texture creation; original preview component, now copied into `lib/preview-sandbox/UnsafePreviewCanvas3D.tsx`.
- Baseline: each build creates new textures; material disposal does not dispose them; rebuilt postprocessing scene passes are not disposed.
- Evidence: three builds created three textures and material cleanup disposed none. Installed Three.js pass disposal implementation inspected.
- Fix: runtime texture ownership/cache and explicit pass/effect disposal. Environment intensity/background changes should not reload HDR files.
- **Status: not fixed. Isolation copies preserve these existing issues; do not claim performance work is complete.**

### 12. Medium: node selectors scan whole graph on store notifications

- Location: `components/TSLNode.tsx`, node lookup and connected-handle selectors.
- Baseline: each mounted node scans nodes/edges even on position updates; avoiding React rerenders does not avoid selector computation.
- Cost: approximately `O(N² + N×E)` across mounted nodes per update. At 1,000 nodes/edges, around 1.5 million examined entries. This is an operation-count estimate, not a browser benchmark.
- Fix: shared node/adjacency indexes; adjacency invalidated only by edge changes; benchmark dragging.
- **Status: not changed; deferred.**

## Implemented changes and their limits

### Account migration

Agent: `auth_boundary`, GPT-6 Luna, xhigh.

Files:

- `convex/auth.ts`: imports `internal`, uses `requireRunMutationCtx(ctx)`, calls `internal.users.transferGuestDataToUser` from `onLinkAccount`.
- `convex/users.ts`: `internalMutation`; source/target IDs must differ; source must exist and have `isAnonymous === true`; target must exist and not be anonymous; collect and transfer all projects, assets, feedbacks; errors propagate so the mutation can roll back.
- `convex/users.auth.test.ts`: five tests plus compile-time public-API exclusion assertion.

Agent inspected installed Better Auth anonymous-plugin behavior: it awaits `onLinkAccount` before deleting the anonymous user. Focused tests, type check, and lint were reported passing. Revalidate after integrating storage ownership tables: new bindings must follow guest migration, and outstanding upload grants must not remain usable by deleted guest identities.

### Dependencies/build hooks

Agent: `dependency_patch`, GPT-6 Luna, xhigh.

- `package.json`, `package-lock.json`: Next/eslint-config-next `16.3.8`, React/React DOM `19.3.0`.
- `predev` and `prebuild` run `npm run build:preview-sandbox`.
- `build:preview-sandbox` runs `node scripts/build-preview-sandbox.mjs`.
- `npm ls` and diff checks passed earlier; registry publication and Next peer compatibility were checked by the agent.
- npm reported 43 audit findings during installation; these were not individually triaged or automatically fixed. Do not infer all dependencies are secure.

### Preview isolation: partially implemented by primary agent

New files:

- `lib/preview-sandbox/security.ts`: `PREVIEW_SANDBOX = 'allow-scripts'`; guard requires a framed browser with `window.origin === 'null'`; Node tests without window are allowed. Builds srcdoc with CSP and escapes closing script tags.
- `lib/preview-sandbox/protocol.ts`: graph snapshots, slot rectangles, capture requests, uniform updates.
- `lib/preview-sandbox/bridge.ts`: loads local bundle, creates sandboxed iframe, sends snapshots/uniforms, checks response source and opaque origin, handles bounded pending capture responses. Exposes `captureIsolatedPreview` and main-preview registration.
- `lib/preview-sandbox/runtime.tsx`: isolated React/Three runtime with its own editor store; renders main/overlay previews; captures main/node images; forwards errors/readiness. It has no upload/auth/persistence RPC.
- `lib/preview-sandbox/UnsafePreviewCanvas3D.tsx`: copy of original main renderer, with import paths adapted.
- `lib/preview-sandbox/UnsafeNodeDebugPreviewOverlay.tsx`: copy of original overlay renderer.
- `scripts/build-preview-sandbox.mjs`: esbuild IIFE bundle of runtime, production mode, analytics stub.

Changed files:

- `components/preview/PreviewCanvas3D.tsx`: now a bridge wrapper; uploads remain in parent via existing callbacks.
- `components/NodeDebugPreviewOverlay.tsx`: now creates an overlay bridge and sends DOM slot rectangles.
- `components/preview/geometry.ts`, `lib/tsl-builder.ts`: guard before each `new Function` evaluation.
- `lib/compiler.ts`: texture URL literal now uses `JSON.stringify(url)`.
- `lib/uniform-store.ts`: listener subscription for forwarding uniform updates, including when parent has no local material node.
- `.gitignore`: generated `/public/preview-sandbox.js` excluded.

Important intended boundary: arbitrary shader/geometry JavaScript executes only in an opaque-origin frame with **no `allow-same-origin`**. The parent sends only graph/rendering data and explicitly authorized file bytes. The parent must never expose a general fetch, Convex, auth, AI-key, upload or persistence RPC to the renderer. Do not “fix” rendering by giving the iframe the application's origin.

### Known incomplete integration and likely regressions

1. **Exports are not migrated.** `lib/export-image.ts` still imports/calls `buildNodePreviewMaterial` in the parent. The new guard will reject it. It also queries a parent `canvas[data-shader-preview-canvas]`, which now lives inside the iframe. Use the bridge capture API for node snapshots and stitched main preview; create safe image/bitmap intermediates and dispose them.
2. **Other evaluation callers remain.** `components/NodePreview.tsx` still calls `buildNodePreviewMaterial`. Determine whether it is mounted; migrate or safely remove dead use. Audit every execution sink and caller.
3. **Private/browser assets are not hydrated.** The bridge currently sends URL-bearing graph snapshots directly. Parent-created IndexedDB blob URLs and future authenticated asset URLs may be inaccessible from an opaque frame. Fetch authorized bytes in parent, send Blobs, create/revoke object URLs inside frame, and replace graph asset URLs there.
4. **Iframe CSS is incomplete.** `previewDocument` supplies only root/canvas styles. Copied renderers still use Tailwind classes such as `w-full h-full` and `absolute inset-0`. The standalone bundle does not include Tailwind CSS. Explicit sizing/positioning is needed and must be browser-tested; otherwise containers can be zero-height or overlays misplaced.
5. **Camera synchronization is incomplete.** Main and overlay run separate stores/renderers. Overlay mode creates its own hidden main renderer for post-debug output. Main-camera orbit changes are not synchronized to the overlay/export scene. Review fidelity and unnecessary rendering cost.
6. **Capture readiness/error/lifecycle needs testing.** Ready may arrive before the desired graph is rendered; init errors are mostly logged by copied components. Add failure/timeout behavior and prevent stale/unsolicited messages from affecting state or uploads.
7. **Uniform ordering needs tests.** Validate values changed before iframe boot, during compilation, on undo/root switches, and while sliders are moving. Structural snapshots and separate uniform messages must not overwrite newer values.
8. **Security tests are absent.** No `lib/preview-sandbox/security.test.ts` exists in the handoff snapshot. The assigned review agent had not delivered findings. Test real browser access to parent/localStorage/cookies, forged messages, script-tag payloads, captures, and escaping; do not rely only on mocked `window.origin`.
9. **CSP/resource access needs review.** Current sandbox permits HTTP(S)/blob/data image and connection resources for textures/HDR. It does not prevent arbitrary shader code from transmitting data deliberately supplied to that frame, or guarantee CPU/GPU denial-of-service isolation. Confirm the intended threat model and request credential behavior.
10. **Dev bundle freshness is manual after startup.** `predev` builds once. Changes to copied runtime files during an already-running dev server require rebuilding the bundle; no watch integration exists.

## Planned storage security design — NOT yet implemented

Agent: `storage_security`, GPT-6 Luna, xhigh. Its proposal was approved by the primary agent, but `convex/schema.ts`, `convex/assets.ts`, `convex/ai.ts`, `convex/feedback.ts`, `convex/projects.ts`, and `convex/http.ts` have no storage-security changes in this handoff snapshot. No new storage helper, grant/binding tables, HTTP file routes, or Next file proxies exist.

### Upload ownership

Do **not** issue a generic Convex upload URL and then let a caller claim any storage ID. A caller-supplied ID plus a grant is still vulnerable if the server cannot prove which upload produced the ID.

Planned approach:

1. Authenticated mutation creates a short-lived, one-use upload grant scoped to user, purpose and optionally project.
2. Client POSTs bytes to a Convex HTTP upload action, proposed shape `/upload?grant=<opaque-grant-id>&filename=...`.
3. The HTTP action calls `ctx.storage.store(blob)` itself.
4. An internal mutation validates/consumes the grant and records a binding between the resulting storage ID and owner/purpose/project.
5. Adoption/deletion operations validate the binding, not client assertions.
6. Bound file type/size/rate; verify actual server metadata; expire/clean unattached uploads. Handle partial failure and replay safely, including deletion of an uploaded file if final registration fails.

Table/function names were provisional (`storageBindings`, upload grants), not existing contracts.

### File privacy and routes

Proposed Convex HTTP GET routes:

| Convex path | Proposed Next proxy | Access rule |
| --- | --- | --- |
| `/assets/:assetId` | `/api/assets/[assetId]` | Owner or authorized project reference; public-reference access when appropriate. |
| `/project-thumbnails/:projectId` | `/api/project-thumbnails/[projectId]` | Project owner or public project. |
| `/ai-previews/:storageId` | `/api/ai-previews/[storageId]` | Owner binding, correct purpose. |
| `/feedback-attachments/:storageId` | `/api/feedback-attachments/[storageId]` | Authorized owner/admin and attachment binding. |

Next proxy would obtain the session token with existing `lib/auth-server.ts::getToken()` and forward it server-side as a Bearer JWT. Convex serves bytes via `ctx.storage.get`, not new public `getUrl` values. Use private/no-store caching, safe content headers, bounded errors and current Next route-handler conventions. Public graphs must still work without login where intended.

`assets.getAssetUrl` and project thumbnail projections would return logical same-origin proxy URLs. The parent preview bridge would fetch these URLs with the user's session and send only bytes to the isolated renderer.

AI providers cannot fetch an authenticated local preview URL. Adapt the explicit capture flow to send a small compressed data URL/image bytes to the provider, or another narrowly scoped delivery mechanism, rather than restoring a permanent public file URL.

Relevant client files for upload integration:

- `lib/editor-host/adapters/convex-adapter.ts`
- `components/Preview.tsx`
- `components/feedback/FeedbackDialog.tsx`
- `hooks/use-asset-manager.ts`
- `components/AiChatDock.tsx` and `lib/ai/tool-runner.ts` for preview consumption/cleanup

### Compatibility/migration constraints

- Already-issued raw storage URLs do not become private simply because queries now check ACL. Plan an explicit migration/rotation and URL rewriting, and document the residual exposure until it is done. Do not delete production files as an implicit implementation step.
- Legacy ownership can be inferred only from trustworthy stored project/asset/feedback relationships, not caller-supplied IDs or “first claim.”
- Clone currently copies graph data supplied by the caller and lacks asset reference creation. A protected-file implementation must not strand clones or let callers attach arbitrary private assets. Prefer server-side source graph selection and validated clone reference/copy behavior.
- Guest linking must transfer new ownership bindings and invalidate outstanding guest grants.
- Account/project deletion and GC must understand bindings and grants; don't reintroduce arbitrary-file deletion through cleanup.
- Tests should cover owner/non-owner/anonymous access, arbitrary storage adoption, purpose mismatch, expired/replayed grants, partial upload failures, private/public transitions, clone lifetime, and legacy handling.

## Standalone message hardening — NOT yet implemented

The auth agent was assigned a follow-up but has not written it in the handoff snapshot.

Files:

- `lib/editor-host/postmessage.ts`
- `lib/editor-host/adapters/postmessage-adapter.ts`
- `app/editor/standalone/standalone-editor-client.tsx`

Current code still checks envelope source/type without checking actual `event.source` or `event.origin`, and uses `'*'` as default target origin.

Intended fix:

- Accept commands/responses only from the actual parent window.
- Pin expected origin using an explicitly valid HTTP(S) origin, or a carefully validated embedding/referrer policy; preserve legitimate landing-page and third-party embeds.
- Do not treat `'*'` as inbound authorization, accept opaque `null` origins indiscriminately, or accept top-level arbitrary messages.
- Use a restricted response target origin for external host protocols.
- Distinguish this from the **internal preview iframe**: an opaque-origin renderer requires `postMessage(..., '*')` delivery, combined with exact `contentWindow` and `event.origin === 'null'` checks. Do not confuse the two protocols.
- Test wrong source, wrong origin, malformed values, top-level pages, and valid embeds.

## Validation performed, and what was not performed

Historical review baseline:

- `npm test -- --run`: **803 passed, 1 failed, 804 total across 70 files**.
- Failing test: `lib/editor-host/use-editor-persistence.test.ts`, “debounces autosave for burst edits”; expected zero saves but got one. Repeated `markDirty()` does not notify once already dirty; this is a separate baseline issue from exhausted retries.
- Nine temporary local probes reproduced ownership transfer, arbitrary file deletion, private asset access, geometry code access to global storage, retry overrun, dropped pending save, failed asset replacement, undisposed textures, and guest clone/migration mismatch.
- The probes were moved out of the repo to `/tmp/tsl-review-probes.test.ts`. That file and `/tmp/tsl-review-*.log` were **not found when preparing this handoff**. Do not depend on them; recreate meaningful regression tests in the repo.
- React Doctor completed with score 32 and many warnings. The review deliberately excluded generic/style diagnostics. This is historical, not a score for the modified tree.

Implementation checks reported earlier:

- Auth agent: five new tests passed, focused TypeScript and ESLint passed.
- Dependency agent: npm package-version/peer verification, `npm ls`, and diff check passed.
- Dependency agent attempted a production build while `runtime.tsx` did not yet exist; prebuild failed at that point. It has since been written, but **no final successful production build was recorded**.
- Primary agent ran `node scripts/build-preview-sandbox.mjs` followed by TypeScript checking after writing the runtime; no bundle error was printed. TypeScript still reported a stale generated route reference and a registry test fixture error. This does not demonstrate browser correctness.
- Earlier full type checks also reported React Flow drag-handler event mismatches at `components/Editor.tsx:864–865`. Later output no longer listed those; inspect current types instead of assuming this was fixed by security work.
- Known recorded type failures: stale `.next/types/validator.ts` importing removed `app/subsurface-refraction/page.js`; `lib/registry.test.ts:11` string not assignable to `NodeType`.
- Handoff-time `git diff --check` produced no errors. Tests/build/browser checks were not rerun during document preparation.

Recommended continuation commands after inspecting instructions and the diff:

```sh
git status --short
git diff --stat
npm run build:preview-sandbox
npm test -- --run
npx tsc --noEmit --incremental false
npm run build
git diff --check
```

Use current Next docs for regenerating stale route types; don't hide source errors with broad compiler exclusions. Validate Convex schema/function generation and backend tests in a safe development environment. Do not point integration tests at production data.

Browser checks still required: ordinary material/post rendering, custom code and geometry scripts, public/share/import/clone flows, standalone embeds, private/local texture loading, main snapshot download, AI capture, graph image export, inline node previews, fullscreen/orbit, uniform dragging, root/subgraph switching, renderer init failure, unmount/remount, and blocked access to app storage/parent.

## Working-tree ownership at handoff

Security-task tracked changes:

```text
.gitignore
components/NodeDebugPreviewOverlay.tsx
components/preview/PreviewCanvas3D.tsx
components/preview/geometry.ts
convex/auth.ts
convex/users.ts
lib/compiler.ts
lib/tsl-builder.ts
lib/uniform-store.ts
package-lock.json
package.json
```

Security-task new files:

```text
convex/users.auth.test.ts
lib/preview-sandbox/UnsafeNodeDebugPreviewOverlay.tsx
lib/preview-sandbox/UnsafePreviewCanvas3D.tsx
lib/preview-sandbox/bridge.ts
lib/preview-sandbox/protocol.ts
lib/preview-sandbox/runtime.tsx
lib/preview-sandbox/security.ts
scripts/build-preview-sandbox.mjs
docs/SECURITY_HANDOFF_2026-10-17.md
```

Other changes present, **not attributable to this security implementation**; preserve them:

```text
skills-lock.json                        (modified)
.agents/skills/fframes-video/           (untracked)
AGENTS.md                              (untracked; current instructions apply)
CLAUDE.md                              (untracked)
components/component-canvas/           (untracked)
launch-video/                          (untracked; already present at review start)
scripts/component-canvas.mjs           (untracked)
```

Do not use a blanket reset/clean or indiscriminate staging. The large preview diff mostly moves original renderer code into isolated-runtime files, then replaces application components with wrappers; review moves as well as additions.

## Suggested continuation order

1. Read `AGENTS.md`, current relevant Next docs, and this diff. Verify no newer work supersedes the snapshot.
2. Revalidate the completed internal migration and dependency updates independently.
3. Finish the isolated renderer integration before claiming script execution is fixed: CSS/layout, assets, export/legacy callers, lifecycle, uniform ordering, and actual browser security tests.
4. Implement and test server-owned upload grants/bindings and protected file routes; integrate all upload/serving clients and guest migration. Keep deployment/migration actions explicit and reviewable.
5. Harden standalone host message origin/source handling and test valid embed compatibility.
6. Run complete tests, type checks, production build, targeted security tests, and browser smoke tests. Separate pre-existing failures from introduced regressions.
7. Review the whole security diff for alternate file adoption/deletion paths and execution sinks. Present a concrete rollout plan, including legacy public URLs and Convex/Next deployment compatibility. No production rollout has been authorized/performed in this session.
8. After security work is complete, return to pending autosave/data-loss and performance findings if the user requests them. Multi-tab conflict protection remains optional follow-up work.

## References consulted during the conversation

- Convex internal functions: https://docs.convex.dev/functions/internal-functions
- Next.js DoS advisory: https://github.com/vercel/next.js/security/advisories/GHSA-h25m-26qc-wcjf
- Next.js September 2026 security release: https://nextjs.org/blog/september-2026-security-release
- Next.js support policy: https://nextjs.org/support-policy
- React 19.3 release (dependency agent reference): https://react.dev/blog/2026/09/09/react-19-3
- React RSC DoS explanation: https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components

Some other Next.js advisories were inspected and intentionally not claimed as applicable. For example, the September 22 `ImageResponse` RCE advisory covered Next >=16.2.0 and a specific API; the reviewed baseline was 16.1.1 and that path was not established. Continue checking applicability rather than reporting every scanner/advisory entry.
