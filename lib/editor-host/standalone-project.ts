/** Build the public, auth-free editor URL used for embeds. */
export function getStandaloneProjectUrl(origin: string, projectId: string): string {
    const url = new URL('/editor/standalone', origin);
    url.searchParams.set('projectId', projectId);
    return url.toString();
}

export function escapeHtmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function getStandaloneEmbedSnippet(
    standaloneUrl: string,
    title = 'TSL Graph',
): string {
    return `<iframe src="${escapeHtmlAttribute(standaloneUrl)}" width="100%" height="600" title="${escapeHtmlAttribute(title)}" allowfullscreen style="border:0"></iframe>`;
}
