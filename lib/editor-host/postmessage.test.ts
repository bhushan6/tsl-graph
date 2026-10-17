import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFromHostWindow, postMessageToHost, resolveHostTargetOrigin } from './postmessage';

describe('resolveHostTargetOrigin', () => {
    it('defaults to any embedder', () => {
        expect(resolveHostTargetOrigin(null)).toBe('*');
        expect(resolveHostTargetOrigin('')).toBe('*');
        expect(resolveHostTargetOrigin('*')).toBe('*');
    });

    it('normalizes an exact http(s) origin', () => {
        expect(resolveHostTargetOrigin('https://host.test')).toBe('https://host.test');
        expect(resolveHostTargetOrigin('https://host.test/')).toBe('https://host.test');
        expect(resolveHostTargetOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    });

    it('rejects values that are not a bare http(s) origin', () => {
        for (const value of ['host.test', 'null', 'javascript:alert(1)', 'file:///x', 'https://host.test/app', 'https://host.test/?a=1', 'https://u:p@host.test']) {
            expect(resolveHostTargetOrigin(value)).toBeNull();
        }
    });
});

describe('isFromHostWindow', () => {
    const parent = { postMessage: vi.fn() };
    const stubFramed = () => vi.stubGlobal('window', { parent } as unknown as Window & typeof globalThis);
    afterEach(() => vi.unstubAllGlobals());

    it('accepts only the embedding window', () => {
        stubFramed();
        expect(isFromHostWindow({ source: parent as unknown as Window, origin: 'https://any.test' }, '*')).toBe(true);
        // e.g. the sandboxed preview frame, a popup, or another frame on the page
        expect(isFromHostWindow({ source: {} as Window, origin: 'null' }, '*')).toBe(false);
        expect(isFromHostWindow({ source: null, origin: 'https://any.test' }, '*')).toBe(false);
    });

    it('enforces a pinned origin and a disabled channel', () => {
        stubFramed();
        const source = parent as unknown as Window;
        expect(isFromHostWindow({ source, origin: 'https://host.test' }, 'https://host.test')).toBe(true);
        expect(isFromHostWindow({ source, origin: 'https://evil.test' }, 'https://host.test')).toBe(false);
        expect(isFromHostWindow({ source, origin: 'https://host.test' }, null)).toBe(false);
    });

    it('treats a top-level page as having no host', () => {
        const self: Record<string, unknown> = {};
        self.parent = self;
        vi.stubGlobal('window', self);
        expect(isFromHostWindow({ source: self as unknown as Window, origin: 'https://host.test' }, '*')).toBe(false);
        expect(postMessageToHost({ source: 'tsl-graph-editor', type: 'x' })).toBe(false);
    });
});
