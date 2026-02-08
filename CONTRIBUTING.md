# Contributing to TSL Editor

Thank you for your interest in contributing to TSL Editor! We welcome contributions from the community to help improve this project.

## Getting Started

1.  **Fork the repository**: Click the "Fork" button on the top right of the repository page.
2.  **Clone your fork**:
    ```bash
    git clone https://github.com/YOUR_USERNAME/tsl-editor.git
    cd tsl-editor
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Set up environment variables**:
    Copy `.env.example` to `.env.local` and fill in the required values.
    ```bash
    cp .env.example .env.local
    ```
5.  **Run the development server**:
    ```bash
    npm run dev
    ```

## Development Workflow

1.  Create a new branch for your feature or bug fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  Make your changes.
3.  Run tests to ensure everything is working:
    ```bash
    npm run test
    ```
4.  Run linting to check for code style issues:
    ```bash
    npm run lint
    ```
5.  Commit your changes with descriptive commit messages.
6.  Push your branch to your fork.
7.  Open a Pull Request against the `main` branch of the original repository.

## Coding Standards

*   We use **TypeScript** for type safety. Please ensure all new code is typed correctly.
*   We use **ESLint** for linting.
*   We use **Tailwind CSS** for styling.
*   We use **Vitest** for testing. Please add tests for new features or bug fixes.

## Project Structure

*   `app/`: Next.js App Router pages and layouts.
*   `components/`: Reusable React components.
*   `lib/`: Core logic (compiler, registry, utils).
*   `store/`: Zustand state management.
*   `convex/`: Backend logic (database, auth).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
