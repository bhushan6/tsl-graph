import * as THREE from 'three/webgpu';
import type { PreviewSettings } from '@/store/editor';

export interface PreviewGeometryResult {
    geometry: THREE.BufferGeometry;
    geometryScriptError: string | null;
}

export function buildPreviewGeometry(previewSettings: PreviewSettings): PreviewGeometryResult {
    const config = previewSettings.config || {};
    let baseGeometry: THREE.BufferGeometry;

    switch (previewSettings.mesh) {
        case 'box':
            baseGeometry = new THREE.BoxGeometry(
                config.width ?? 1.5,
                config.height ?? 1.5,
                config.depth ?? 1.5,
                config.widthSegments ?? 1,
                config.heightSegments ?? 1,
                config.depthSegments ?? 1
            );
            break;
        case 'torus':
            baseGeometry = new THREE.TorusKnotGeometry(
                config.radiusTorus ?? 0.8,
                config.tube ?? 0.3,
                config.tubularSegments ?? 32,
                config.radialSegments ?? 16
            );
            break;
        case 'plane':
            baseGeometry = new THREE.PlaneGeometry(
                config.widthPlane ?? 1,
                config.heightPlane ?? 1,
                config.widthSegmentsPlane ?? 1,
                config.heightSegmentsPlane ?? 1
            );
            break;
        case 'cylinder':
            baseGeometry = new THREE.CylinderGeometry(
                config.radiusTop ?? 1,
                config.radiusBottom ?? 1,
                config.heightCylinder ?? 1,
                config.radialSegmentsCylinder ?? 20,
                config.heightSegmentsCylinder ?? 20,
                config.openEnded ?? true
            );
            break;
        case 'sphere':
        default:
            baseGeometry = new THREE.SphereGeometry(
                config.radius ?? 1,
                config.widthSegmentsSphere ?? 32,
                config.heightSegmentsSphere ?? 16
            );
            break;
    }

    let geometry: THREE.BufferGeometry = baseGeometry;
    let geometryScriptError: string | null = null;
    const script = previewSettings.geometryScript?.trim();

    if (script) {
        const scriptedGeometry = baseGeometry.clone();
        try {
            const fn = new Function('geometry', 'THREE', `"use strict";\n${script}`);
            fn(scriptedGeometry, THREE);
            geometry = scriptedGeometry;
            baseGeometry.dispose();
        } catch (err) {
            geometryScriptError = err instanceof Error ? err.message : String(err);
            scriptedGeometry.dispose();
        }
    }

    if (geometry.getAttribute('uv') && geometry.getAttribute('normal')) {
        geometry.computeTangents();
    }

    return { geometry, geometryScriptError };
}
