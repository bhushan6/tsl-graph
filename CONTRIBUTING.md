# Contributing to TSL Editor

Thank you for your interest in contributing to the TSL Editor project! We welcome contributions from the community.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (or yarn/pnpm/bun)
- A [Convex](https://convex.dev/) account

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd tsl-editor
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   Fill in the required variables in `.env.local`. You will need to set up a Convex project and OAuth providers (Google/GitHub) if you want to test authentication.

4. **Initialize Convex:**
   ```bash
   npx convex dev
   ```
   This will prompt you to log in to Convex and configure your project.

5. **Run the Development Server:**
   In a separate terminal, run:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

## Testing

We use [Vitest](https://vitest.dev/) for testing. Run the tests with:
```bash
npm run test
```

## Linting

Ensure your code adheres to our coding standards by running:
```bash
npm run lint
```

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. Make your changes, ensuring tests and linting pass.
3. Update documentation if necessary.
4. Submit a Pull Request with a clear description of your changes.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
