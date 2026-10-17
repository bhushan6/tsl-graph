import type { PreviewAsset } from './protocol';

/** Same-origin `blob:` URLs in the graph; the opaque frame cannot fetch these itself. */
export function collectLocalBlobUrls(value: unknown, origin: string, found = new Set<string>()): Set<string> {
    if (typeof value === 'string') {
        if (value.startsWith(`blob:${origin}/`)) found.add(value);
    } else if (Array.isArray(value)) {
        for (const item of value) collectLocalBlobUrls(item, origin, found);
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collectLocalBlobUrls(item, origin, found);
    }
    return found;
}

/**
 * Frame side: swaps the parent's `blob:` URLs for object URLs created in the
 * frame from the bytes the parent sent, and revokes ones no longer referenced.
 */
export function createFrameAssetUrls(
    createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
    revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
) {
    const urls = new Map<string, string>();

    const rewrite = (value: unknown, used: Set<string>): unknown => {
        if (typeof value === 'string') {
            const local = urls.get(value);
            if (!local) return value;
            used.add(value);
            return local;
        }
        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index += 1) value[index] = rewrite(value[index], used);
        } else if (value && typeof value === 'object') {
            const record = value as Record<string, unknown>;
            for (const key of Object.keys(record)) record[key] = rewrite(record[key], used);
        }
        return value;
    };

    return {
        /** Rewrites `snapshot` in place; it must be the frame's own structured-clone copy. */
        apply<T>(snapshot: T, assets: PreviewAsset[]): T {
            for (const asset of assets) {
                if (typeof asset?.url === 'string' && asset.blob instanceof Blob && !urls.has(asset.url)) {
                    urls.set(asset.url, createUrl(asset.blob));
                }
            }
            const used = new Set<string>();
            rewrite(snapshot, used);
            for (const [url, local] of urls) {
                if (used.has(url)) continue;
                revokeUrl(local);
                urls.delete(url);
            }
            return snapshot;
        },
    };
}
