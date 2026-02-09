# TSL Graph Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**TSL Graph Editor** is a visual node-based editor for the Three.js Shading Language (TSL). It empowers developers and artists to create complex shaders visually by connecting logic blocks, similar to tools like Blender's Shader Editor or Unreal Engine's Material Editor.

The editor provides a real-time 3D preview powered by `three/webgpu` and generates valid TSL code that can be directly used in your Three.js projects.

![TSL Graph Editor Preview](https://tsl-graph.xyz/og-image.png)

## Features

-   **Visual Node Graph**: Create shaders by connecting nodes.
-   **Real-time Preview**: See your changes instantly on a 3D model (Box, Sphere, Torus, etc.) using WebGPU.
-   **Code Generation**: Automatically generates optimized TSL code.
-   **Subgraphs**: Group nodes into reusable custom nodes (functions).
-   **Code Nodes**: Write custom TSL code directly within the graph.
-   **Material Library**: Save and load your projects.
-   **Export**: Share your projects via unique URLs.

## Documentation

-   **[User Guide](docs/USER_GUIDE.md)**: Learn how to use the editor, keyboard shortcuts, and node types.
-   **[Technical Guide](docs/TECHNICAL_GUIDE.md)**: Understand the architecture, codebase structure, and key components.

## Getting Started

### Prerequisites

-   Node.js 18+
-   npm or bun

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/tsl-editor.git
    cd tsl-editor
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Copy the example environment file and configure your keys.
    ```bash
    cp .env.example .env.local
    ```
    You will need to set up a [Convex](https://convex.dev) project and add your `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`.
    For authentication, you'll need Google and GitHub OAuth credentials.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) (if available) and check out the [Technical Guide](docs/TECHNICAL_GUIDE.md) to get started with the codebase.

## License

This project is licensed under the MIT License.
