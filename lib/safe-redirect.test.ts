import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
    it('keeps same-origin paths', () => {
        expect(safeRedirectPath('/editor/abc')).toBe('/editor/abc');
        expect(safeRedirectPath('/dashboard/gallery?tab=new#top')).toBe('/dashboard/gallery?tab=new#top');
    });

    it('falls back for script URLs, other origins and malformed values', () => {
        for (const value of [
            null, '', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,x',
            'https://evil.example', '//evil.example/path', '/\\evil.example', '\\\\evil.example', 'dashboard',
        ]) {
            expect(safeRedirectPath(value)).toBe('/dashboard');
        }
    });

    it('normalizes tricks that would leave the origin', () => {
        expect(safeRedirectPath('/\t/evil.example')).toBe('/dashboard');
        expect(safeRedirectPath('/../editor')).toBe('/editor');
    });
});
