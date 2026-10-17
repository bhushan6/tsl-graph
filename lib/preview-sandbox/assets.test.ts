import { describe, expect, it } from 'vitest';
import { collectLocalBlobUrls, createFrameAssetUrls } from './assets';

const ORIGIN = 'https://app.test';

describe('collectLocalBlobUrls', () => {
    it('finds same-origin blob URLs anywhere in the snapshot', () => {
        const snapshot = {
            nodes: [{ data: { values: { url: `blob:${ORIGIN}/a` } } }],
            subgraphs: { s: { nodes: [{ data: { values: { url: `blob:${ORIGIN}/b`, other: 1 } } }] } },
            post: [`blob:${ORIGIN}/a`],
        };
        expect([...collectLocalBlobUrls(snapshot, ORIGIN)].sort()).toEqual([`blob:${ORIGIN}/a`, `blob:${ORIGIN}/b`]);
    });

    it('ignores remote, data and other-origin blob URLs', () => {
        const snapshot = ['https://cdn.test/t.png', 'data:image/png;base64,AA', 'blob:https://evil.test/x', `blob:${ORIGIN}x`];
        expect(collectLocalBlobUrls(snapshot, ORIGIN).size).toBe(0);
    });
});

describe('createFrameAssetUrls', () => {
    const setup = () => {
        let next = 0;
        const revoked: string[] = [];
        const urls = createFrameAssetUrls(() => `blob:null/${++next}`, (url) => revoked.push(url));
        return { urls, revoked };
    };
    const blob = () => new Blob(['x'], { type: 'image/png' });

    it('rewrites parent URLs to frame object URLs and keeps others intact', () => {
        const { urls } = setup();
        const snapshot = { nodes: [{ url: `blob:${ORIGIN}/a` }, { url: 'https://cdn.test/t.png' }] };
        urls.apply(snapshot, [{ url: `blob:${ORIGIN}/a`, blob: blob() }]);
        expect(snapshot.nodes).toEqual([{ url: 'blob:null/1' }, { url: 'https://cdn.test/t.png' }]);
    });

    it('reuses object URLs across snapshots and revokes them once unreferenced', () => {
        const { urls, revoked } = setup();
        const asset = { url: `blob:${ORIGIN}/a`, blob: blob() };
        const first = { url: asset.url };
        const second = { url: asset.url };
        urls.apply(first, [asset]);
        urls.apply(second, [asset]);
        expect(second.url).toBe('blob:null/1');
        expect(revoked).toEqual([]);

        urls.apply({ url: 'https://cdn.test/t.png' }, []);
        expect(revoked).toEqual(['blob:null/1']);
        const third = { url: asset.url };
        urls.apply(third, [asset]);
        expect(third.url).toBe('blob:null/2');
    });

    it('ignores malformed asset entries', () => {
        const { urls } = setup();
        const snapshot = { url: `blob:${ORIGIN}/a` };
        urls.apply(snapshot, [{ url: `blob:${ORIGIN}/a`, blob: 'not a blob' as unknown as Blob }]);
        expect(snapshot.url).toBe(`blob:${ORIGIN}/a`);
    });
});
