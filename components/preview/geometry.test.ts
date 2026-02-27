import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { PreviewSettings } from '@/store/editor';
import { buildPreviewGeometry } from './geometry';

function createPreviewSettings(overrides: Partial<PreviewSettings> = {}): PreviewSettings {
    return {
        mesh: 'sphere',
        config: {},
        isInstanced: false,
        instanceCount: 100,
        geometryScript: '',
        codeMode: 'generated',
        customCode: '',
        environment: 'studio',
        environmentIntensity: 1,
        showEnvironmentBackground: false,
        showBackdrop: false,
        showGrid: true,
        postEnabled: true,
        ...overrides,
    };
}

describe('buildPreviewGeometry', () => {
    it.each([
        ['sphere', 'SphereGeometry'],
        ['box', 'BoxGeometry'],
        ['torus', 'TorusKnotGeometry'],
        ['plane', 'PlaneGeometry'],
        ['fullscreenQuad', 'PlaneGeometry'],
        ['cylinder', 'CylinderGeometry'],
    ] as const)('maps %s mesh to %s', (mesh, expectedType) => {
        const settings = createPreviewSettings({ mesh });
        const result = buildPreviewGeometry(settings);

        expect(result.geometry.type).toBe(expectedType);
        expect(result.geometryScriptError).toBeNull();

        result.geometry.dispose();
    });

    it('creates fullscreen quad with [-1, 1] bounds in X/Y', () => {
        const settings = createPreviewSettings({
            mesh: 'fullscreenQuad',
        });

        const result = buildPreviewGeometry(settings);
        result.geometry.computeBoundingBox();

        expect(result.geometry.boundingBox?.min.x).toBeCloseTo(-1);
        expect(result.geometry.boundingBox?.max.x).toBeCloseTo(1);
        expect(result.geometry.boundingBox?.min.y).toBeCloseTo(-1);
        expect(result.geometry.boundingBox?.max.y).toBeCloseTo(1);

        result.geometry.dispose();
    });

    it('applies geometry script when script executes successfully', () => {
        const settings = createPreviewSettings({
            mesh: 'sphere',
            geometryScript: 'geometry.scale(2, 1, 1);',
        });

        const result = buildPreviewGeometry(settings);
        result.geometry.computeBoundingBox();

        expect(result.geometryScriptError).toBeNull();
        expect(result.geometry.boundingBox?.max.x).toBeGreaterThan(1.5);

        result.geometry.dispose();
    });

    it('returns script error while keeping a valid fallback geometry', () => {
        const settings = createPreviewSettings({
            mesh: 'sphere',
            geometryScript: 'throw new Error(\"boom\")',
        });

        const result = buildPreviewGeometry(settings);

        expect(result.geometryScriptError).toContain('boom');
        expect(result.geometry).toBeInstanceOf(THREE.BufferGeometry);

        result.geometry.dispose();
    });
});
