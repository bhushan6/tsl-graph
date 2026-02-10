# Contributing to TSL Editor

Thank you for your interest in contributing to TSL Editor! We welcome contributions from everyone.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/your-username/tsl-editor.git
    cd tsl-editor
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Set up environment variables**:
    Copy `.env.example` to `.env.local` and fill in the required values (Convex, Auth providers, etc.).

## Development Workflow

1.  Create a new branch for your feature or bugfix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  Make your changes.
3.  Run linting and tests to ensure code quality:
    ```bash
    npm run lint
    npm run test
    ```
4.  Commit your changes using conventional commits (e.g., `feat: add new node type`, `fix: resolve hydration error`).

## Pull Requests

1.  Push your branch to your fork.
2.  Open a Pull Request against the `main` branch of the original repository.
3.  Provide a clear description of your changes and link any relevant issues.

## Code Style

*   We use ESLint and Prettier. Run `npm run lint` to check for issues.
*   Write clear, self-documenting code.
*   Add comments for complex logic.

## Reporting Issues

If you find a bug or have a feature request, please open an issue on GitHub.
