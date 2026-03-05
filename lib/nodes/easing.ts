import { BaseNodeDef } from './definitions';

const EASING_FUNCTIONS = [
    'easeLinear',
    'easeInQuad',
    'easeOutQuad',
    'easeInOutQuad',
    'easeInCubic',
    'easeOutCubic',
    'easeInOutCubic',
    'easeInQuart',
    'easeOutQuart',
    'easeInOutQuart',
    'easeInQuint',
    'easeOutQuint',
    'easeInOutQuint',
    'easeInSine',
    'easeOutSine',
    'easeInOutSine',
    'easeInExpo',
    'easeOutExpo',
    'easeInOutExpo',
    'easeInCircular',
    'easeOutCircular',
    'easeInOutCircular',
    'easeInBack',
    'easeOutBack',
    'easeInOutBack',
    'easeInElastic',
    'easeOutElastic',
    'easeInOutElastic',
    'easeInBounce',
    'easeOutBounce',
    'easeInOutBounce',
] as const;

type EasingFunctionName = typeof EASING_FUNCTIONS[number];
type EasingNodeType = `easing/${EasingFunctionName}`;

function toEasingLabel(functionName: EasingFunctionName): string {
    return functionName
        .replace(/^ease/, 'Ease ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/\s+/g, ' ')
        .trim();
}

export const easingNodes = EASING_FUNCTIONS.map((functionName) => ({
    type: `easing/${functionName}` as EasingNodeType,
    label: toEasingLabel(functionName),
    category: 'Easing',
    inputs: {
        t: { label: 'T', type: 'float', default: 0 },
    },
    outputs: { out: { label: 'Out', type: 'float' } },
    tsl: functionName,
    importFrom: 'tsl-easings',
} as const)) satisfies readonly BaseNodeDef[];

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _easingNodesCheck: readonly BaseNodeDef[] = easingNodes;
