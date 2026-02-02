# TSL Editor

A visual node-based editor for Three.js Shading Language (TSL). Create shader materials visually by connecting nodes, similar to Blender's Shader Editor or Unreal Engine's Material Editor.

## Features

- **Visual Node Graph**: Edit shaders using a flow-based interface.
- **Real-time Preview**: See your material changes instantly in a 3D preview using Three.js WebGPU.
- **Code Generation**: Generates valid JavaScript/TSL code.
- **Subgraph Support**: Create reusable custom nodes.
- **Asset Management**: Upload and use textures and other assets.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS, Radix UI
- **State Management**: Zustand
- **Graph Engine**: React Flow
- **3D Engine**: Three.js (WebGPU)
- **Backend**: Convex (Auth, Database, Storage)
- **Analytics**: PostHog

## Getting Started

1.  **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/tsl-editor.git
    cd tsl-editor
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Setup Environment Variables**

    Copy `.env.example` to `.env.local` and fill in the required values.

    ```bash
    cp .env.example .env.local
    ```

4.  **Run the development server**

    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser.

## Environment Variables

See `.env.example` for the list of required environment variables.

- `CONVEX_DEPLOYMENT`: Convex deployment URL.
- `NEXT_PUBLIC_CONVEX_URL`: Public Convex URL.
- `NEXT_PUBLIC_CONVEX_SITE_URL`: Convex Site URL (usually same as deployment URL or specific for auth).
- `NEXT_PUBLIC_POSTHOG_KEY`: PostHog API Key.
- `NEXT_PUBLIC_POSTHOG_HOST`: PostHog Host (default: https://us.posthog.com).
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret.
- `GITHUB_CLIENT_ID`: GitHub OAuth Client ID.
- `GITHUB_CLIENT_SECRET`: GitHub OAuth Client Secret.
- `SITE_URL`: The URL of the deployed site (e.g., http://localhost:3000 for dev).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
