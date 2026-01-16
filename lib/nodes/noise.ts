import { BaseNodeDef } from './definitions';

export const noiseNodes = [
    {
        type: 'noise/mx_fractal_noise_float',
        label: 'Fractal Noise (Float)',
        category: 'Noise',
        inputs: {
            position: { label: 'Position', type: 'vec3', default: [0, 0, 0] },
            octaves: { label: 'Octaves', type: 'int', default: 3 },
            lacunarity: { label: 'Lacunarity', type: 'float', default: 2.0 },
            gain: { label: 'Gain', type: 'float', default: 0.5 },
            amplitude: { label: 'Amplitude', type: 'float', default: 1.0 },
        },
        outputs: {
            out: { label: 'Out', type: 'float' },
        },
        tsl: 'mx_fractal_noise_float',
    },
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _noiseNodesCheck: readonly BaseNodeDef[] = noiseNodes;
