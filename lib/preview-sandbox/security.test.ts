import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import * as THREE from 'three/webgpu';
import type { TSLNodeData } from '@/lib/types';
import type { PreviewSettings } from '@/store/editor';
import { buildPreviewGeometry } from '@/components/preview/geometry';
import { buildNodePreviewMaterial, buildTSLMaterial } from '@/lib/tsl-builder';
import { initializeNodes } from '@/lib/nodes';
import { PREVIEW_SANDBOX, assertIsolatedPreview, previewDocument } from './security';

function stubWindow(framed: boolean, origin: string) {
    const win: Record<string, unknown> = { origin };
    win.parent = framed ? {} : win;
    vi.stubGlobal('window', win);
}

const previewSettings = (geometryScript: string): PreviewSettings => ({
    mesh: 'plane', config: {}, isInstanced: false, instanceCount: 1, geometryScript,
    codeMode: 'generated', customCode: '', environment: 'none', environmentIntensity: 1,
    showEnvironmentBackground: false, showBackdrop: false, showGrid: false, postEnabled: false,
});

const floatNode = (id: string): Node<TSLNodeData> => ({
    id, type: 'default', position: { x: 0, y: 0 }, data: { type: 'const/float', values: { value: 1 }, connected: {} } as unknown as TSLNodeData,
});

describe('preview sandbox document', () => {
    it('grants scripts only, so the frame keeps an opaque origin', () => {
        expect(PREVIEW_SANDBOX).toBe('allow-scripts');
    });

    it('cannot be broken out of by a script-closing sequence in the bundle', () => {
        const html = previewDocument('a("</script><img src=x>");b("</SCRIPT >")', 'https://app.test/editor/1');
        expect(html.match(/<\/script>/gi)).toHaveLength(1);
        expect(html).toContain('<\\/script><img src=x>');
        expect(html).toContain('<\\/SCRIPT >');
    });

    it('escapes the base URL and denies everything except what rendering needs', () => {
        const html = previewDocument('', 'https://app.test/"&<x>?q=1');
        expect(html).toContain('<base href="https://app.test/">');
        expect(html).toContain("default-src 'none'");
        expect(html).toContain("frame-src 'none'");
        expect(html).toContain("form-action 'none'");
        expect(html).not.toContain('allow-same-origin');
    });
});

describe('assertIsolatedPreview', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('allows Vitest but no other non-browser runtime', () => {
        expect(() => assertIsolatedPreview()).not.toThrow();
        vi.stubEnv('VITEST', '');
        expect(() => assertIsolatedPreview()).toThrow('isolated preview');
    });

    it('rejects the top-level application window and same-origin frames', () => {
        stubWindow(false, 'https://app.test');
        expect(() => assertIsolatedPreview()).toThrow('isolated preview');
        stubWindow(true, 'https://app.test');
        expect(() => assertIsolatedPreview()).toThrow('isolated preview');
        stubWindow(false, 'null');
        expect(() => assertIsolatedPreview()).toThrow('isolated preview');
    });

    it('allows a framed document with an opaque origin', () => {
        stubWindow(true, 'null');
        expect(() => assertIsolatedPreview()).not.toThrow();
    });
});

describe('graph code execution sinks', () => {
    beforeAll(() => initializeNodes());
    afterEach(() => {
        vi.unstubAllGlobals();
        delete (globalThis as { __previewProbe?: boolean }).__previewProbe;
    });

    it('refuses geometry scripts in the application origin', () => {
        stubWindow(false, 'https://app.test');
        const result = buildPreviewGeometry(previewSettings('globalThis.__previewProbe = true;'));
        expect(result.geometryScriptError).toContain('isolated preview');
        expect((globalThis as { __previewProbe?: boolean }).__previewProbe).toBeUndefined();
        result.geometry.dispose();
    });

    it('refuses to evaluate compiled graphs in the application origin', () => {
        stubWindow(false, 'https://app.test');
        expect(() => buildTSLMaterial([floatNode('f')], [])).toThrow('isolated preview');

        // Node previews degrade to a magenta fallback instead of throwing.
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        const material = buildNodePreviewMaterial('f', [floatNode('f')], []);
        expect(material).toBeInstanceOf(THREE.MeshBasicNodeMaterial);
        expect(String(logged.mock.calls[0]?.[1])).toContain('isolated preview');
        logged.mockRestore();
        material.dispose();
    });

    it('still runs geometry scripts inside the isolated frame', () => {
        stubWindow(true, 'null');
        const result = buildPreviewGeometry(previewSettings('globalThis.__previewProbe = true;'));
        expect(result.geometryScriptError).toBeNull();
        expect((globalThis as { __previewProbe?: boolean }).__previewProbe).toBe(true);
        result.geometry.dispose();
    });
});
