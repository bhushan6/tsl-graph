export const STANDALONE_UI_SURFACES = [
    'preview',
    'library',
    'inspector',
    'toolbar',
    'navbar',
    'controls',
    'none',
] as const;

export type StandaloneUiSurface = (typeof STANDALONE_UI_SURFACES)[number];

export interface EditorChromeVisibility {
    navbar: boolean;
    library: boolean;
    preview: boolean;
    inspector: boolean;
    toolbar: boolean;
    controls: boolean;
}

export const FULL_EDITOR_CHROME: EditorChromeVisibility = {
    navbar: true,
    library: true,
    preview: true,
    inspector: true,
    toolbar: true,
    controls: false,
};

const VALID_SURFACES = new Set<string>(STANDALONE_UI_SURFACES);

/**
 * Parse the standalone `show` allow-list. A missing parameter preserves the
 * full editor; a present (including empty) parameter opts into embed controls.
 * The graph canvas is always rendered and is therefore not a configurable
 * surface. `none` is an explicit graph-only preset and overrides other values.
 */
export function parseStandaloneUiVisibility(
    value: string | null,
): EditorChromeVisibility {
    if (value === null) return FULL_EDITOR_CHROME;

    const visible = new Set(
        value
            .split(',')
            .map((surface) => surface.trim().toLowerCase())
            .filter((surface) => VALID_SURFACES.has(surface)),
    );

    if (visible.has('none')) {
        return {
            navbar: false,
            library: false,
            preview: false,
            inspector: false,
            toolbar: false,
            controls: false,
        };
    }

    return {
        navbar: visible.has('navbar'),
        library: visible.has('library'),
        preview: visible.has('preview'),
        inspector: visible.has('inspector'),
        toolbar: visible.has('toolbar'),
        controls: visible.has('controls'),
    };
}
