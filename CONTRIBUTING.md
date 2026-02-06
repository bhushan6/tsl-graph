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
4.  **Set up environment variables**:
    Copy `.env.example` to `.env.local` and fill in the required values.
    ```bash
    cp .env.example .env.local
    ```
    You will need a [Convex](https://www.convex.dev/) account and project for the backend.

5.  **Run the development server**:
    ```bash
    npm run dev
    ```

## Development Workflow

*   **Branching**: Create a new branch for your feature or bug fix.
    ```bash
    git checkout -b my-feature-branch
    ```
*   **Committing**: Write clear and concise commit messages.
*   **Linting**: Ensure your code passes linting checks.
    ```bash
    npm run lint
    ```
*   **Testing**: Run tests to ensure no regressions.
    ```bash
    npm run test
    ```

## Project Structure

*   `app/`: Next.js app router pages and layouts.
*   `components/`: React components.
*   `convex/`: Convex backend functions and schema.
*   `lib/`: Utility functions and core logic (compiler, types).
*   `store/`: Zustand state management (editor store).
*   `utils/`: Helper utilities.

## Pull Requests

1.  Push your branch to your fork.
2.  Open a Pull Request against the `main` branch of this repository.
3.  Describe your changes and link to any relevant issues.

## Code of Conduct

Please be respectful and considerate of others when contributing.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
