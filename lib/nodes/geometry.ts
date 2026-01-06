import { NodeDef } from '../types';

// Helper for vec3 outputs with components
const vec3Outputs = {
    x: { label: 'X', type: 'float' as const },
    y: { label: 'Y', type: 'float' as const },
    z: { label: 'Z', type: 'float' as const },
    out: { label: 'XYZ', type: 'vec3' as const },
};

// Helper for vec2 outputs with components
const vec2Outputs = {
    x: { label: 'X', type: 'float' as const },
    y: { label: 'Y', type: 'float' as const },
    out: { label: 'XY', type: 'vec2' as const },
};

export const geometryNodes: NodeDef[] = [
    // Position
    {
        type: 'geo/positionLocal',
        label: 'Position Local',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'positionLocal',
        pure: true,
    },
    {
        type: 'geo/positionWorld',
        label: 'Position World',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'positionWorld',
        pure: true,
    },
    {
        type: 'geo/positionView',
        label: 'Position View',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'positionView',
        pure: true,
    },
    // Normal
    {
        type: 'geo/normalLocal',
        label: 'Normal Local',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'normalLocal',
        pure: true,
    },
    {
        type: 'geo/normalWorld',
        label: 'Normal World',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'normalWorld',
        pure: true,
    },
    {
        type: 'geo/normalView',
        label: 'Normal View',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'normalView',
        pure: true,
    },
    // UV
    {
        type: 'geo/uv',
        label: 'UV',
        category: 'Geometry',
        outputs: vec2Outputs,
        tsl: 'uv',
        pure: true,
    },
    // Time
    {
        type: 'geo/time',
        label: 'Time',
        category: 'Geometry',
        outputs: { out: { label: 'Out', type: 'float' } },
        tsl: 'time',
        pure: true,
    },
];
