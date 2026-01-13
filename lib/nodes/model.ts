
import { BaseNodeDef } from './definitions';

// Helper for vec3 outputs with components
const vec3Outputs = {
    x: { label: 'X', type: 'float' as const },
    y: { label: 'Y', type: 'float' as const },
    z: { label: 'Z', type: 'float' as const },
    out: { label: 'XYZ', type: 'vec3' as const },
};

const mat4Outputs = {
    out: { label: 'Out', type: 'mat4' as const },
};

const mat3Outputs = {
    out: { label: 'Out', type: 'mat3' as const },
};

export const modelNodes = [
    {
        type: 'model/modelWorldMatrix',
        label: 'Model World Matrix',
        category: 'Model',
        outputs: mat4Outputs,
        tsl: 'modelWorldMatrix',
        pure: true,
    },
    {
        type: 'model/modelDirection',
        label: 'Model Direction',
        category: 'Model',
        outputs: vec3Outputs,
        tsl: 'modelDirection',
        pure: true,
    },
    {
        type: 'model/modelViewMatrix',
        label: 'Model View Matrix',
        category: 'Model',
        outputs: mat4Outputs,
        tsl: 'modelViewMatrix',
        pure: true,
    },
    {
        type: 'model/modelNormalMatrix',
        label: 'Model Normal Matrix',
        category: 'Model',
        outputs: mat3Outputs,
        tsl: 'modelNormalMatrix',
        pure: true,
    },
    {
        type: 'model/modelPosition',
        label: 'Model Position',
        category: 'Model',
        outputs: vec3Outputs,
        tsl: 'modelPosition',
        pure: true,
    },
    {
        type: 'model/modelScale',
        label: 'Model Scale',
        category: 'Model',
        outputs: vec3Outputs,
        tsl: 'modelScale',
        pure: true,
    },
    {
        type: 'model/modelViewPosition',
        label: 'Model View Position',
        category: 'Model',
        outputs: vec3Outputs,
        tsl: 'modelViewPosition',
        pure: true,
    },
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _modelNodesCheck: readonly BaseNodeDef[] = modelNodes;
