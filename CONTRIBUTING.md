# Contributing to TSL Editor

Thank you for your interest in contributing to the TSL Editor project! We welcome contributions from the community to help make this tool better.

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm, yarn, pnpm, or bun

### Installation

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
    You will need a [Convex](https://convex.dev) account and project for the backend.

### Running the Development Server

1.  Start the Convex backend (in a separate terminal):
    ```bash
    npx convex dev
    ```
2.  Start the Next.js development server:
    ```bash
    npm run dev
    ```
3.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## Code Quality

### Linting

We use ESLint to maintain code quality. Before submitting a PR, please run:

```bash
npm run lint
```

### Testing

We use Vitest for testing. Please ensure all tests pass before submitting your changes:

```bash
npm run test
```

If you add new features, please include relevant tests.

## Submitting Pull Requests

1.  Create a new branch for your feature or bug fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  Make your changes and commit them with descriptive commit messages.
3.  Push your branch to your fork.
4.  Open a Pull Request against the `main` branch of the original repository.
5.  Provide a clear description of your changes and why they are needed.

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
