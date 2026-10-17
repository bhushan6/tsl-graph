import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { watchPreviewSandbox } from './build-preview-sandbox.mjs';

// The sandboxed shader preview is bundled outside Next (public/preview-sandbox.js),
// so keep it rebuilding alongside `next dev`.
const watcher = await watchPreviewSandbox();
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const next = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], { stdio: 'inherit' });

// Ctrl+C already reaches Next through the terminal's process group; let it shut
// down, then exit with its code. SIGTERM (e.g. from a process manager) is forwarded.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => next.kill('SIGTERM'));
next.on('exit', async (code, signal) => {
    await watcher.dispose();
    process.exit(code ?? (signal ? 1 : 0));
});
