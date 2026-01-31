# Contributing to TSL Editor

Thank you for your interest in contributing to TSL Editor! We welcome contributions from the community to help improve this project.

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
    The app should be running at `http://localhost:3000`.

## Project Structure

*   `app/`: Next.js App Router pages and layouts.
*   `components/`: React components (UI, Editor, Nodes).
*   `convex/`: Convex backend functions and schema.
*   `lib/`: Core logic (Compiler, Registry, Builder).
*   `store/`: Zustand state management.

## Development Workflow

1.  Create a new branch for your feature or bug fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  Make your changes.
3.  **Run tests** to ensure no regressions:
    ```bash
    npm run test
    ```
4.  **Lint your code**:
    ```bash
    npm run lint
    ```
5.  Commit your changes with a descriptive message.
6.  Push your branch and open a Pull Request.

## Pull Request Guidelines

*   Provide a clear description of the changes.
*   Link to any relevant issues.
*   Ensure all tests pass.
*   Include screenshots if your changes affect the UI.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
