import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearRecoverySnapshot,
    isSameGraphContent,
    readRecoverySnapshot,
    writeRecoverySnapshot,
} from './recovery-snapshot';

describe('recovery snapshot', () => {
    beforeEach(() => {
        const items = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => items.get(key) ?? null,
            setItem: (key: string, value: string) => items.set(key, value),
            removeItem: (key: string) => items.delete(key),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('only clears the snapshot it was asked to clear', () => {
        const firstId = writeRecoverySnapshot('project:a', '{"nodes":[]}');
        const secondId = writeRecoverySnapshot('project:a', '{"nodes":[1]}');
        expect(firstId).not.toBe(secondId);

        clearRecoverySnapshot('project:a', firstId ?? undefined);
        expect(readRecoverySnapshot('project:a')?.graphJson).toBe('{"nodes":[1]}');

        clearRecoverySnapshot('project:a', secondId ?? undefined);
        expect(readRecoverySnapshot('project:a')).toBeNull();
    });

    it('is a no-op without browser storage', () => {
        vi.stubGlobal('localStorage', undefined);
        expect(writeRecoverySnapshot('project:a', '{}')).toBeNull();
        expect(readRecoverySnapshot('project:a')).toBeNull();
    });

    it('ignores layout measurement, selection and key order when comparing graphs', () => {
        const saved = JSON.stringify({
            nodes: [{ id: 'a', position: { x: 1, y: 2 }, data: { value: 1 } }],
            edges: [],
        });
        const measured = JSON.stringify({
            edges: [],
            nodes: [{
                data: { value: 1 },
                id: 'a',
                measured: { width: 120, height: 40 },
                position: { y: 2, x: 1 },
                selected: true,
            }],
        });
        const edited = JSON.stringify({
            nodes: [{ id: 'a', position: { x: 1, y: 2 }, data: { value: 2 } }],
            edges: [],
        });

        expect(isSameGraphContent(saved, measured)).toBe(true);
        expect(isSameGraphContent(saved, edited)).toBe(false);
        expect(isSameGraphContent(saved, 'not json')).toBe(false);
    });
});
