import { context, build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const options = {
    entryPoints: ['lib/preview-sandbox/runtime.tsx'],
    outfile: 'public/preview-sandbox.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
    // The isolated renderer has no analytics or access to application services.
    plugins: [{
        name: 'no-preview-analytics',
        setup(build) {
            build.onResolve({ filter: /^posthog-js$/ }, () => ({ path: 'posthog-js', namespace: 'empty-analytics' }));
            build.onLoad({ filter: /.*/, namespace: 'empty-analytics' }, () => ({ contents: 'export default {capture(){}}', loader: 'js' }));
        },
    }],
};

export function buildPreviewSandbox() {
    return build(options);
}

/** Rebuilds whenever the runtime or anything it imports (compiler, nodes, store) changes. */
export async function watchPreviewSandbox() {
    let markBuilt;
    const firstBuild = new Promise((resolve) => { markBuilt = resolve; });
    const ctx = await context({
        ...options,
        plugins: [...options.plugins, {
            name: 'report-rebuilds',
            setup(build) {
                let first = true;
                build.onEnd((result) => {
                    if (first) markBuilt();
                    else if (result.errors.length === 0) console.log('[preview-sandbox] rebuilt; reload the editor to pick it up');
                    first = false;
                });
            },
        }],
    });
    await ctx.watch();
    // The first page load must not race the initial bundle.
    await firstBuild;
    return ctx;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await buildPreviewSandbox();
}
