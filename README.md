# TSL Editor

![TSL Editor Banner](public/dark-logo.ico)

**TSL Editor** is a powerful visual node-based shader editor for **Three.js Shading Language (TSL)**. It allows developers and artists to create complex shaders visually by connecting nodes, similar to Blender's Shader Editor or Unreal Engine's Material Editor, and export the generated TSL code for use in Three.js projects.

## Features

*   **Visual Node Graph**: Intuitive drag-and-drop interface powered by [React Flow](https://reactflow.dev/).
*   **Live WebGPU Preview**: Real-time 3D preview of your material using `three/webgpu`.
*   **Code Generation**: Automatically generates valid, optimized TSL code from your graph.
*   **Material Library**: Save and load your shader graphs (persisted via [Convex](https://www.convex.dev/)).
*   **Subgraphs**: Create reusable custom nodes (subgraphs) to modularize your logic.
*   **Authentication**: Secure login via Google/GitHub to manage your projects.

## Tech Stack

*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
*   **UI Library**: [React 19](https://react.dev/) & [Tailwind CSS](https://tailwindcss.com/)
*   **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
*   **3D Engine**: [Three.js](https://threejs.org/) (WebGPU)
*   **Backend & Database**: [Convex](https://www.convex.dev/)
*   **Auth**: [Better Auth](https://www.better-auth.com/)

## Getting Started

### Prerequisites

*   Node.js 18+
*   npm or pnpm

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/tsl-editor.git
    cd tsl-editor
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Setup**:
    Copy the example environment file to `.env.local`:
    ```bash
    cp .env.example .env.local
    ```
    Fill in the required environment variables in `.env.local`:
    *   `CONVEX_DEPLOYMENT`: Your Convex deployment URL.
    *   `NEXT_PUBLIC_CONVEX_URL`: Public URL for Convex.
    *   `GOOGLE_CLIENT_ID` / `SECRET`: For Google Auth.
    *   `GITHUB_CLIENT_ID` / `SECRET`: For GitHub Auth.
    *   `NEXT_PUBLIC_POSTHOG_KEY`: For analytics (optional).

4.  **Run the development server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the editor.

5.  **Run Convex**:
    In a separate terminal, run:
    ```bash
    npx convex dev
    ```

## Documentation

*   [Technical Guide](docs/TECHNICAL_GUIDE.md): Deep dive into the architecture, compiler logic, and data structures.
*   [Learnings](docs/LEARNINGS.md): Developer notes and learnings during development.
*   [User Guide](docs/USER_GUIDE.md): Instructions on how to use the editor.

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).
