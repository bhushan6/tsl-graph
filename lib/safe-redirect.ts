const PLACEHOLDER_ORIGIN = 'https://tsl-graph.invalid';

/**
 * A post-sign-in redirect taken from the URL must be a same-origin path.
 * Anything else (`javascript:`, `//evil.example`, absolute URLs) falls back,
 * so a crafted link can neither run script in the app origin nor send users
 * to another site.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/dashboard'): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
    try {
        const url = new URL(value, PLACEHOLDER_ORIGIN);
        if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}
