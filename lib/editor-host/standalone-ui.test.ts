import { describe, expect, it } from 'vitest';
import {
    FULL_EDITOR_CHROME,
    parseStandaloneUiVisibility,
} from './standalone-ui';

describe('standalone UI visibility', () => {
    it('keeps the full editor when show is absent', () => {
        expect(parseStandaloneUiVisibility(null)).toEqual(FULL_EDITOR_CHROME);
    });

    it('uses show as a positive allow-list while keeping the graph implicit', () => {
        expect(parseStandaloneUiVisibility('preview, toolbar, controls')).toEqual({
            navbar: false,
            library: false,
            preview: true,
            inspector: false,
            toolbar: true,
            controls: true,
        });
    });

    it('normalizes known values and ignores unknown ones', () => {
        expect(parseStandaloneUiVisibility(' PREVIEW,unknown,preview ')).toEqual({
            navbar: false,
            library: false,
            preview: true,
            inspector: false,
            toolbar: false,
            controls: false,
        });
    });

    it('supports an explicit graph-only preset', () => {
        expect(parseStandaloneUiVisibility('none,preview,controls')).toEqual({
            navbar: false,
            library: false,
            preview: false,
            inspector: false,
            toolbar: false,
            controls: false,
        });
    });

    it('treats an empty allow-list as graph-only for compatibility', () => {
        expect(parseStandaloneUiVisibility('')).toEqual(parseStandaloneUiVisibility('none'));
    });
});
