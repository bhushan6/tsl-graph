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
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _textureNodesCheck: readonly BaseNodeDef[] = textureNodes;
