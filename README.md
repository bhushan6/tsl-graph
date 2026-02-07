# TSL Editor

TSL Editor is a visual node-based editor for Three.js Shading Language (TSL). It allows you to create complex shaders visually and export them as TSL code.

## Features

- **Visual Node Editor**: Create shaders using a drag-and-drop interface.
- **Real-time Preview**: See your changes instantly in a 3D viewport.
- **TSL Export**: Generate clean, reusable TSL code.
- **Share Projects**: Save and share your shader creations with others.

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

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

3.  Configure environment variables:
    Copy `.env.example` to `.env.local` and fill in the required values.
    ```bash
    cp .env.example .env.local
    ```

4.  Start the Convex backend:
    ```bash
    npx convex dev
    ```

5.  Start the development server:
    ```bash
    npm run dev
    ```

6.  Open [http://localhost:3000](http://localhost:3000) with your browser.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Tech Stack

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Three.js](https://threejs.org/) (WebGPU)
- [React Flow](https://reactflow.dev/)
- [Convex](https://convex.dev/)
- [Zustand](https://github.com/pmndrs/zustand)
