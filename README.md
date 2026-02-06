# TSL Editor

A visual node-based editor for Three.js Shading Language (TSL), built with Next.js, React Flow, and Convex.

![TSL Editor](https://placehold.co/600x400?text=TSL+Editor)

## Features

*   **Visual Graph Editor**: Create shaders using a node-based interface.
*   **Real-time Preview**: See your shader changes instantly on 3D meshes.
*   **TSL Code Generation**: Automatically generate TSL code from your graph.
*   **Subgraphs**: Create reusable shader modules.
*   **Cloud Storage**: Save and share your projects using Convex.
*   **Authentication**: Secure login with Google and GitHub.

## Tech Stack

*   **Frontend**: Next.js 15, React 19, Tailwind CSS, Radix UI
*   **Graph Engine**: React Flow (@xyflow/react)
*   **3D Rendering**: Three.js (WebGPU)
*   **Backend**: Convex
*   **State Management**: Zustand
*   **Authentication**: Better Auth

## Getting Started

### Prerequisites

*   Node.js 18+
*   npm

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/tsl-editor.git
    cd tsl-editor
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up environment variables:
    Copy `.env.example` to `.env.local` and add your API keys.
    ```bash
    cp .env.example .env.local
    ```

    You need to set up a [Convex](https://www.convex.dev/) project and update `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`.
    Also configure OAuth providers for Google and GitHub if you want authentication to work.

4.  Run the development server:
    ```bash
    npm run dev
    ```

5.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

*   `npm run dev`: Start development server.
*   `npm run build`: Build for production.
*   `npm run start`: Start production server.
*   `npm run lint`: Run ESLint.
*   `npm run test`: Run Vitest tests.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## License

This project is open source and available under the [MIT License](LICENSE).
