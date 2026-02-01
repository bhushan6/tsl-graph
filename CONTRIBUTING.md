# Contributing to TSL Editor

Thank you for your interest in contributing to TSL Editor! We welcome contributions from the community.

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
4.  **Run the development server**:
    ```bash
    npm run dev
    ```
5.  **Open [http://localhost:3000](http://localhost:3000)** in your browser.

## Backend Development

This project uses [Convex](https://convex.dev) for the backend. You will need to set up a Convex project.

1.  Run `npx convex dev` to initialize the backend and sync it with your local environment.

## Code Style

*   We use **ESLint** for linting. Run `npm run lint` to check for issues.
*   We use **Vitest** for testing. Run `npm run test` to run tests.

## Pull Requests

1.  Create a new branch for your feature or bug fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  Commit your changes.
3.  Push your branch to your fork.
4.  Open a Pull Request against the `main` branch of the original repository.

## Reporting Issues

If you find a bug or have a feature request, please open an issue on GitHub.
