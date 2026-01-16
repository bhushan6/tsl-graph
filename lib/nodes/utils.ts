import { BaseNodeDef } from './definitions';

export const utilsNodes: readonly BaseNodeDef[] = [
    {
        type: 'utils/rotation3d',
        label: 'Rotation 3D',
        category: 'Utils',
        inputs: {
            pos: { label: 'Pos', type: 'vec3', default: [0, 0, 0] },
            axis: { label: 'Axis', type: 'vec3', default: [0, 1, 0] },
            angle: { label: 'Angle', type: 'float', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'vec3' },
        },
        tsl: 'rotation3d',
        pure: true,
    },
    {
        type: 'utils/rotate2D',
        label: 'Rotation 2D',
        category: 'Utils',
        inputs: {
            pos: { label: 'Pos', type: 'vec2', default: [0, 0] },
            angle: { label: 'Angle', type: 'float', default: 0 },
        },
        outputs: {
            out: { label: 'Out', type: 'vec2' },
        },
        tsl: 'rotate2D',
        pure: true,
    },
] as const;
