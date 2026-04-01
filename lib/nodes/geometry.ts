import { BaseNodeDef } from './definitions';

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

const mat4Outputs = {
    out: { label: 'Out', type: 'mat4' as const },
};

export const geometryNodes = [
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
    {
        type: 'geo/positionViewDirection',
        label: 'Position View Direction',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'positionViewDirection',
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
    // Tangent
    {
        type: 'geo/tangentLocal',
        label: 'Tangent Local',
        category: 'Geometry',
        outputs: {
            x: { label: 'X', type: 'float' as const },
            y: { label: 'Y', type: 'float' as const },
            z: { label: 'Z', type: 'float' as const },
            w: { label: 'W', type: 'float' as const },
            out: { label: 'XYZW', type: 'vec4' as const },
        },
        tsl: 'tangentLocal',
        pure: true,
    },
    {
        type: 'geo/bitangentLocal',
        label: 'Bitangent Local',
        category: 'Geometry',
        outputs: {
            x: { label: 'X', type: 'float' as const },
            y: { label: 'Y', type: 'float' as const },
            z: { label: 'Z', type: 'float' as const },
            w: { label: 'W', type: 'float' as const },
            out: { label: 'XYZW', type: 'vec4' as const },
        },
        tsl: 'bitangentLocal',
        pure: true,
    },
    // UV
    {
        type: 'geo/uv',
        label: 'UV',
        category: 'Geometry',
        inputs: {
            index: {
                label: 'Index',
                type: 'int',
                default: 0,
                propertyOnly: true,
                options: [
                    { label: '0', value: 0 },
                    { label: '1', value: 1 },
                    { label: '2', value: 2 },
                    { label: '3', value: 3 },
                    { label: '4', value: 4 },
                    { label: '5', value: 5 },
                    { label: '6', value: 6 },
                ]
            }
        },
        outputs: vec2Outputs,
        tsl: 'uv',
        pure: true,
        callable: true,  // uv() needs to be called as a function
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
    {
        type: 'geo/instanceIndex',
        label: 'Instance Index',
        category: 'Geometry',
        outputs: { out: { label: 'Out', type: 'uint' as const } },
        tsl: 'instanceIndex',
        pure: true,
    },
    {
        type: 'geo/instanceCount',
        label: 'Instance Count',
        category: 'Geometry',
        outputs: { out: { label: 'Out', type: 'int' as const } },
        tsl: 'instanceCount',
        pure: false,
    },
    {
        type: 'geo/camera',
        label: 'Camera',
        category: 'Geometry',
        outputs: {
            near: { label: 'Near', type: 'float' as const },
            far: { label: 'Far', type: 'float' as const },
            out: { label: 'Near/Far', type: 'vec2' as const },
        },
        tsl: 'camera',
        pure: true,
    },
    {
        type: 'geo/cameraPosition',
        label: 'Camera Position',
        category: 'Geometry',
        outputs: vec3Outputs,
        tsl: 'cameraPosition',
        pure: true,
    },
    {
        type: 'geo/cameraViewMatrix',
        label: 'Camera View Matrix',
        category: 'Geometry',
        outputs: mat4Outputs,
        tsl: 'cameraViewMatrix',
        pure: true,
    },
    {
        type: 'geo/screenUV',
        label: 'Screen UV',
        category: 'Geometry',
        outputs: vec2Outputs,
        tsl: 'screenUV',
        pure: true,
    },
    {
        type: 'geo/screenCoordinate',
        label: 'Screen Coordinate',
        category: 'Geometry',
        outputs: vec2Outputs,
        tsl: 'screenCoordinate',
        pure: true,
    },
    {
        type: 'geo/resolution',
        label: 'Resolution',
        category: 'Geometry',
        outputs: vec2Outputs,
        tsl: 'screenSize',
        pure: true,
    },
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _geometryNodesCheck: readonly BaseNodeDef[] = geometryNodes;
