import { BaseNodeDef } from './definitions';

export const postNodes = [
    {
        type: 'post/input',
        label: 'Post Input',
        category: 'Post',
        description: 'Provides scene color, linear depth, normal, and optional raw textures for post-processing.',
        inputs: {},
        outputs: {
            color: { label: 'Scene Color', type: 'vec4' },
            depth: { label: 'Scene Depth', type: 'float' },
            normal: { label: 'Scene Normal', type: 'vec3' },
            sceneTexture: { label: 'Scene Texture', type: 'any' },
            depthTexture: { label: 'Depth Texture', type: 'any' },
            normalTexture: { label: 'Normal Texture', type: 'any' },
        },
        tsl: '__post_input__',
        pure: true,
        defaultActiveInputs: ['color', 'depth', 'normal'],
    },
    {
        type: 'post/sceneColor',
        label: 'Scene Color',
        category: 'Post',
        description: 'Returns the current scene color for the post-processing pixel.',
        inputs: {},
        outputs: { out: { label: 'Color', type: 'vec4' } },
        tsl: '__post_scene_color__',
        pure: true,
    },
    {
        type: 'post/sceneDepth',
        label: 'Scene Depth',
        category: 'Post',
        description: 'Returns linear scene depth for the post-processing pixel.',
        inputs: {},
        outputs: { out: { label: 'Depth', type: 'float' } },
        tsl: '__post_scene_depth__',
        pure: true,
    },
    {
        type: 'post/sceneNormal',
        label: 'Scene Normal',
        category: 'Post',
        description: 'Returns the sampled scene normal for the post-processing pixel.',
        inputs: {},
        outputs: { out: { label: 'Normal', type: 'vec3' } },
        tsl: '__post_scene_normal__',
        pure: true,
    },
    {
        type: 'post/output',
        label: 'Post Output',
        category: 'Post',
        description: 'Defines the final color output for the post-processing pipeline.',
        inputs: {
            color: { label: 'Color', type: 'vec4', connectionOnly: true },
            toneMapping: {
                label: 'Tone Mapping',
                type: 'string',
                default: 'NoToneMapping',
                options: [
                    { label: 'None', value: 'NoToneMapping' },
                    { label: 'Linear', value: 'LinearToneMapping' },
                    { label: 'Reinhard', value: 'ReinhardToneMapping' },
                    { label: 'Cineon', value: 'CineonToneMapping' },
                    { label: 'ACES', value: 'ACESFilmicToneMapping' },
                ],
                propertyOnly: true,
            },
            exposure: {
                label: 'Exposure',
                type: 'float',
                default: 1,
                propertyOnly: true,
            },
            outputColorSpace: {
                label: 'Output Color Space',
                type: 'string',
                default: 'SRGBColorSpace',
                options: [
                    { label: 'sRGB', value: 'SRGBColorSpace' },
                    { label: 'Linear sRGB', value: 'LinearSRGBColorSpace' },
                ],
                propertyOnly: true,
            },
        },
        outputs: {},
        tsl: '__post_output__',
    },
] as const;

export const POST_ANCHOR_NODE_TYPES = ['post/input', 'post/output'] as const;
export const POST_NODE_TYPES = postNodes.map((node) => node.type) as readonly string[];
export const POST_INPUT_DEFAULT_OUTPUTS = ['color', 'depth', 'normal'] as const;
export const POST_INPUT_RAW_TEXTURE_OUTPUTS = ['sceneTexture', 'depthTexture', 'normalTexture'] as const;

// Type check to ensure conformity without widening the inferred type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _postNodesCheck: readonly BaseNodeDef[] = postNodes;
