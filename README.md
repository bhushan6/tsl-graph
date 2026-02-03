# Visual Node-Based TSL Editor

A powerful visual editor for Three.js Shading Language (TSL), built with Next.js, React, and Convex.

## Features

- **Visual Node Graph**: Create and edit shaders using a node-based interface.
- **Real-time Preview**: See your changes instantly with a live 3D preview.
- **Authentication**: Secure user accounts using Better Auth and Convex.
- **Cloud Storage**: Save and share your graphs.
- **Modern Stack**: Built with Next.js 16, React 19, Tailwind CSS, and TypeScript.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Library**: [React 19](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Node Engine**: [React Flow](https://reactflow.dev/)
- **3D Engine**: [Three.js](https://threejs.org/)
- **Backend**: [Convex](https://convex.dev/)
- **Authentication**: [Better Auth](https://better-auth.com/)

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm (or yarn/pnpm/bun)
- A Convex account

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd tsl-editor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and add your configuration.

4. Initialize Convex:
   ```bash
   npx convex dev
   ```
   Follow the prompts to log in and configure your project.

5. Run the development server:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
