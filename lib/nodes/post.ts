import { BaseNodeDef } from './definitions';

export const postNodes = [
    {
        type: 'post/input',
        label: 'Post Input',
        category: 'Post',
        inputs: {},
        outputs: {
            color: { label: 'Color', type: 'vec4' },
            sceneTexture: { label: 'Scene Texture', type: 'any' },
            depth: { label: 'Depth', type: 'float' },
            depthTexture: { label: 'Depth Texture', type: 'any' },
            normal: { label: 'Normal Texture', type: 'any' },
        },
        tsl: '__post_input__',
        pure: true,
    },
    {
        type: 'post/output',
        label: 'Post Output',
        category: 'Post',
        inputs: {
            color: { label: 'Color', type: 'vec4', connectionOnly: true },
        },
        outputs: {},
        tsl: '__post_output__',
    },
] as const;

export const POST_ANCHOR_NODE_TYPES = ['post/input', 'post/output'] as const;

// Type check to ensure conformity without widening the inferred type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _postNodesCheck: readonly BaseNodeDef[] = postNodes;
