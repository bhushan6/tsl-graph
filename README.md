# TSL Graph

A node-based editor for [Three.js Shading Language (TSL)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language). Connect nodes to build materials and post-processing effects, watch the result update live in a WebGPU preview, and copy out the TSL code it generates.

Live at **[tsl-graph.xyz](https://tsl-graph.xyz)**.

## Features

- Material and post-processing graphs that compile to readable TSL code
- Live preview; graph code runs in a sandboxed iframe
- Subgraphs (your own reusable nodes) and code nodes (hand-written TSL and WGSL inside a graph)
- Per-node debug previews
- Procedural textures from [tsl-textures](https://github.com/boytchev/tsl-textures)
- Interactive tutorials and generated node reference docs (`/docs`)
- Accounts with guest, Google and GitHub sign-in, cloud-saved projects, a public gallery and share links
- An embeddable standalone editor driven over `postMessage` ([protocol](docs/INSPECTOR_POSTMESSAGE_PROTOCOL.md))
- Loop node

## Tech stack

Next.js (App Router), React, TypeScript, [React Flow](https://reactflow.dev), Zustand, three.js (`three/webgpu`), [Convex](https://convex.dev) for the database, file storage and backend functions, [Better Auth](https://better-auth.com) for authentication, and Tailwind CSS.

## Running locally

You need Node.js 20.9 or newer and a free [Convex](https://convex.dev) account.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start Convex. The first run asks you to log in and create a project, then writes the deployment's URLs to `.env.local` (see [.env.example](.env.example)). Leave it running.

   ```bash
   npx convex dev
   ```

3. Set the backend variables on your Convex deployment:

   ```bash
   npx convex env set SITE_URL http://localhost:3000
   npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   npx convex env set GOOGLE_CLIENT_ID ...
   npx convex env set GOOGLE_CLIENT_SECRET ...
   npx convex env set GITHUB_CLIENT_ID ...
   npx convex env set GITHUB_CLIENT_SECRET ...
   ```

   For the OAuth apps, use `http://localhost:3000/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/github` as the callback URLs.

4. In a second terminal, start the app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

Analytics (PostHog) are off unless you set `NEXT_PUBLIC_POSTHOG_KEY`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server, plus a watcher that rebuilds the preview sandbox bundle |
| `npm run build` | Production build (builds the preview sandbox bundle first) |
| `npx vitest` | Tests |
| `npx tsc --noEmit` | Type check |
| `npm run generate:tsl-textures-inline` | Regenerates the inlined tsl-textures code after upgrading that package |

## Deploying

Deploy the Convex functions with `npx convex deploy` and set the same backend variables on the production deployment (with `--prod`), using your public URL for `SITE_URL` and in the OAuth callback URLs. Then deploy the Next.js app (for example on Vercel) with `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` pointing at the production deployment.

## Project layout

| Path | Contents |
| --- | --- |
| `app/` | Next.js routes: landing page, dashboard, editor, share pages, docs |
| `components/` | Editor UI: canvas, nodes, panels, toolbar, preview, tutorials |
| `lib/nodes/` | Node definitions, registered through `lib/registry.ts` |
| `lib/compiler.ts` | Turns a graph into TSL code |
| `lib/preview-sandbox/` | The sandboxed iframe that runs graph code for previews |
| `lib/editor-host/` | Persistence and host integration for the different editor modes |
| `store/` | Zustand stores (editor state, history, tutorials) |
| `convex/` | Database schema and backend functions (projects, templates, assets, files, auth) |
| `docs/` | User guide, TSL notes, the embed protocol and design notes |

The [user guide](docs/USER_GUIDE.md) explains how to use the editor.

## License

[MIT](LICENSE)
