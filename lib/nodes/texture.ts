import { BaseNodeDef } from './definitions';

export const textureNodes = [
    {
        type: 'texture/sample',
        label: 'Texture',
        category: 'Texture',
        inputs: {
            url: { label: 'URL', type: 'string', default: "/uv-checker.jpeg", propertyOnly: true },
            uv: { label: 'UV', type: 'vec2', connectionOnly: true },
        },
        outputs: { out: { label: 'Out', type: 'vec4' } },
        tsl: 'texture',
    },
] as const;

// Type check
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _textureNodesCheck: readonly BaseNodeDef[] = textureNodes;
