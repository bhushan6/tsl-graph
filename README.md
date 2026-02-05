# TSL Editor

TSL Editor is a visual, node-based editor for the Three.js Shading Language (TSL). It allows developers and artists to create and preview shaders in real-time using a graph-based interface, leveraging the power of Three.js and WebGPU.

## Features

*   **Node-Based Editing**: Intuitive graph interface for building shaders.
*   **Real-Time Preview**: See your shader changes instantly in the 3D viewport.
*   **Three.js Integration**: Built on top of the latest Three.js (WebGPU) capabilities.
*   **Backend Integration**: Projects are saved and managed using Convex.
*   **Authentication**: Secure login via Google and GitHub.

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn

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
    Copy the example environment file:
    ```bash
    cp .env.example .env.local
    ```
    Then, edit `.env.local` and add your configuration values.

### Running the Application

1.  Start the Convex backend (this will also help configure your Convex environment variables):
    ```bash
    npx convex dev
    ```

2.  In a separate terminal, start the Next.js development server:
    ```bash
    npm run dev
    ```

3.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and setup your development environment.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
