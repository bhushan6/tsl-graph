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
4.  **Set up environment variables**:
    - Copy `.env.example` to `.env.local`:
      ```bash
      cp .env.example .env.local
      ```
    - Fill in the required environment variables. You will need a Convex project and Auth providers (Google/GitHub) set up.

5.  **Run the development server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the application.

## Backend Setup (Convex)

This project uses Convex for the backend. You will need to initialize a Convex project:

```bash
npx convex dev
```

This will guide you through setting up a project on Convex and will automatically update your `.env.local` with `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`.

## Testing

We use Vitest for testing. Run tests with:

```bash
npm run test
```

## Linting

Please ensure your code is linted before submitting. We use ESLint:

```bash
npm run lint
```

## Making a Pull Request

1.  Create a new branch for your feature or fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  Make your changes and commit them with descriptive commit messages.
3.  Push your branch to your fork:
    ```bash
    git push origin feature/my-new-feature
    ```
4.  Open a Pull Request on the original repository.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
