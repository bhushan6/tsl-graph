import { BaseNodeDef } from './definitions';

export const textureNodes = [
    {
        type: 'texture/sample',
        label: 'Texture',
        category: 'Texture',
        inputs: {
            url: { label: 'URL', type: 'string', default: "/uv.png", propertyOnly: true },
            uv: { label: 'UV', type: 'vec2', connectionOnly: true },
            // Texture Properties
            wrapS: {
                label: 'Wrap S',
                type: 'string',
                default: 'RepeatWrapping',
                options: [
                    { label: 'Repeat', value: 'RepeatWrapping' },
                    { label: 'Clamp to Edge', value: 'ClampToEdgeWrapping' },
                    { label: 'Mirrored Repeat', value: 'MirroredRepeatWrapping' },
                ],
                propertyOnly: true,
                hidden: true
            },
            wrapT: {
                label: 'Wrap T',
                type: 'string',
                default: 'RepeatWrapping',
                options: [
                    { label: 'Repeat', value: 'RepeatWrapping' },
                    { label: 'Clamp to Edge', value: 'ClampToEdgeWrapping' },
                    { label: 'Mirrored Repeat', value: 'MirroredRepeatWrapping' },
                ],
                propertyOnly: true,
                hidden: true
            },
            minFilter: {
                label: 'Min Filter',
                type: 'string',
                default: 'LinearMipmapLinearFilter',
                options: [
                    { label: 'Nearest', value: 'NearestFilter' },
                    { label: 'Nearest Mipmap Nearest', value: 'NearestMipmapNearestFilter' },
                    { label: 'Nearest Mipmap Linear', value: 'NearestMipmapLinearFilter' },
                    { label: 'Linear', value: 'LinearFilter' },
                    { label: 'Linear Mipmap Nearest', value: 'LinearMipmapNearestFilter' },
                    { label: 'Linear Mipmap Linear', value: 'LinearMipmapLinearFilter' },
                ],
                propertyOnly: true,
                hidden: true
            },
            magFilter: {
                label: 'Mag Filter',
                type: 'string',
                default: 'LinearFilter',
                options: [
                    { label: 'Nearest', value: 'NearestFilter' },
                    { label: 'Linear', value: 'LinearFilter' },
                ],
                propertyOnly: true,
                hidden: true
            },
        },
        outputs: { out: { label: 'Out', type: 'vec4' } },
        tsl: 'texture',
    },
    {
        type: 'texture/viewportShared',
        label: 'Backdrop',
        category: 'Texture',
        inputs: {
            uv: { label: 'UV', type: 'vec2', connectionOnly: true },
        },
        outputs: { out: { label: 'RGB', type: 'vec3' } },
        tsl: 'viewportSharedTexture',
    },
    {
        type: 'texture/triplanar',
        label: 'Triplanar Texture',
        category: 'Texture',
        inputs: {
            textureX: { label: 'Texture X', type: 'any', connectionOnly: true },
            textureY: { label: 'Texture Y', type: 'any', connectionOnly: true },
            textureZ: { label: 'Texture Z', type: 'any', connectionOnly: true },
            scale: { label: 'Scale', type: 'float', default: 1 },
            position: { label: 'Position', type: 'vec3', connectionOnly: true },
            normal: { label: 'Normal', type: 'vec3', connectionOnly: true },
        },
        outputs: { out: { label: 'Out', type: 'vec4' } },
        tsl: 'triplanarTexture',
    },
    {
        type: 'texture/viewportDepth',
        label: 'Viewport Depth',
        category: 'Texture',
        inputs: {
            uv: { label: 'UV', type: 'vec2', default: [0, 0] },
        },
        outputs: { out: { label: 'Out', type: 'float' } },
        tsl: 'viewportDepthTexture',
    },
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _textureNodesCheck: readonly BaseNodeDef[] = textureNodes;
