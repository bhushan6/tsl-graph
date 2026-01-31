# TSL Editor

A visual node-based editor for Three.js Shading Language (TSL). Create shader materials visually by connecting nodes, similar to Blender's Shader Editor or Unreal Engine's Material Editor.

## Features

- **Visual Graph Editor**: Intuitive node-based interface using React Flow.
- **Real-time Preview**: See your material update instantly on a 3D model using `three/webgpu`.
- **Code Generation**: Generates valid JavaScript/TSL code.
- **Live Compilation**: Runs directly in the browser.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Documentation

See [doc.md](doc.md) for detailed architectural documentation.

## Community & Contributing

We welcome contributions! Please see the following resources:

- [Contributing Guidelines](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
