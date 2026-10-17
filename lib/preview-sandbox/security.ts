/** Never evaluate graph-controlled JavaScript in the application's origin. */
export function assertIsolatedPreview(): void {
    if (typeof window === 'undefined') {
        // Only Vitest may evaluate graphs outside a browser; server code never may.
        if (typeof process !== 'undefined' && process.env.VITEST) return;
        throw new Error('Shader execution requires an isolated preview.');
    }
    if (window.parent === window || window.origin !== 'null') {
        throw new Error('Shader execution requires an isolated preview.');
    }
}

// No allow-same-origin: the frame gets an opaque origin, so graph code cannot
// reach the app's storage, cookies, DOM or same-origin APIs.
export const PREVIEW_SANDBOX = 'allow-scripts';

export function previewDocument(bundle: string, baseUrl: string): string {
    const base = new URL('/', baseUrl).href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    // The graph is sent through postMessage, never interpolated into this HTML.
    // color-scheme must match the iframe element's, or browsers paint an opaque backdrop over the canvas.
    return `<!doctype html><html><head><meta charset="utf-8"><base href="${base}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https: http: data: blob:; connect-src https: http: data: blob:; font-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'"><style>:root{color-scheme:light}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}#root{position:relative;width:100%;height:100%}canvas{display:block}</style></head><body><div id="root"></div><script>${bundle.replace(/<\/(script)/gi, '<\\/$1')}</script></body></html>`;
}
