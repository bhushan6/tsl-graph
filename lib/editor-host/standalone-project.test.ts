import { describe, expect, it } from 'vitest';
import {
    getStandaloneEmbedSnippet,
    getStandaloneProjectUrl,
} from './standalone-project';

describe('standalone project sharing helpers', () => {
    it('builds a URL with a safely encoded project id', () => {
        expect(getStandaloneProjectUrl('https://example.com/', 'project/1?x=2'))
            .toBe('https://example.com/editor/standalone?projectId=project%2F1%3Fx%3D2');
    });

    it('builds an iframe snippet with escaped attributes', () => {
        const url = 'https://example.com/editor/standalone?projectId=a&x="quoted"';
        expect(getStandaloneEmbedSnippet(url, 'Graph "demo"'))
            .toBe('<iframe src="https://example.com/editor/standalone?projectId=a&amp;x=&quot;quoted&quot;" width="100%" height="600" title="Graph &quot;demo&quot;" allowfullscreen style="border:0"></iframe>');
    });
});
