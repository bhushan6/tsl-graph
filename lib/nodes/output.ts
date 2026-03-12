import { BaseNodeDef } from './definitions';

// Material nodes - only ONE material node is allowed per graph
// This is enforced in the store

export const meshStandardMaterial = {
    type: 'material/standard',
    label: 'MeshStandardMaterial',
    category: 'Material',
    defaultActiveInputs: ['colorNode', 'positionNode'],
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        normalNode: { label: 'Normal', type: 'vec3', connectionOnly: true },
        roughnessNode: { label: 'Roughness', type: 'float', default: 0.5 },
        metalnessNode: { label: 'Metalness', type: 'float', default: 0 },
        emissiveNode: { label: 'Emissive', type: 'color', default: '#000000' },
        aoNode: { label: 'AO', type: 'float', default: 1 },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
        outputNode: { label: 'Output', type: 'vec4', connectionOnly: true },
        backdropNode: { label: 'Backdrop', type: 'vec3', connectionOnly: true },
        backdropAlphaNode: { label: 'Backdrop Alpha', type: 'float', connectionOnly: true },
        side: {
            label: 'Side',
            type: 'int',
            default: 0, // FrontSide
            propertyOnly: true,
            isMaterialProp: true,
            options: [
                { label: 'Front', value: 0 }, // THREE.FrontSide
                { label: 'Back', value: 1 }, // THREE.BackSide
                { label: 'Double', value: 2 }, // THREE.DoubleSide
            ]
        },
        transparent: {
            label: 'Transparent',
            type: 'bool',
            default: false,
            propertyOnly: true,
            isMaterialProp: true,
        },
        depthWrite: {
            label: 'Depth Write',
            type: 'bool',
            default: true,
            propertyOnly: true,
            isMaterialProp: true,
        },
    },
    outputs: {},
    tsl: 'MeshStandardNodeMaterial',
    importFrom: 'three/webgpu',
} as const;

export const nodeMaterial = {
    type: 'material/node',
    label: 'NodeMaterial',
    category: 'Material',
    defaultActiveInputs: ['fragmentNode', 'vertexNode'],
    inputs: {
        fragmentNode: { label: 'Fragment', type: 'vec4', connectionOnly: true },
        vertexNode: { label: 'Vertex', type: 'vec3', connectionOnly: true },
    },
    outputs: {},
    tsl: 'NodeMaterial',
    importFrom: 'three/webgpu',
} as const;

export const meshBasicMaterial = {
    type: 'material/basic',
    label: 'MeshBasicMaterial',
    category: 'Material',
    defaultActiveInputs: ['colorNode', 'positionNode'],
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
        outputNode: { label: 'Output', type: 'vec4', connectionOnly: true },
        backdropNode: { label: 'Backdrop', type: 'vec3', connectionOnly: true },
        backdropAlphaNode: { label: 'Backdrop Alpha', type: 'float', connectionOnly: true },
        side: {
            label: 'Side',
            type: 'int',
            default: 0,
            propertyOnly: true,
            isMaterialProp: true,
            options: [
                { label: 'Front', value: 0 },
                { label: 'Back', value: 1 },
                { label: 'Double', value: 2 },
            ]
        },
        transparent: {
            label: 'Transparent',
            type: 'bool',
            default: false,
            propertyOnly: true,
            isMaterialProp: true,
        },
        depthWrite: {
            label: 'Depth Write',
            type: 'bool',
            default: true,
            propertyOnly: true,
            isMaterialProp: true,
        },
    },
    outputs: {},
    tsl: 'MeshBasicNodeMaterial',
    importFrom: 'three/webgpu',
} as const;

export const meshPhysicalMaterial = {
    type: 'material/physical',
    label: 'MeshPhysicalMaterial',
    category: 'Material',
    defaultActiveInputs: ['colorNode', 'positionNode'],
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        normalNode: { label: 'Normal', type: 'vec3', connectionOnly: true },
        roughnessNode: { label: 'Roughness', type: 'float', default: 0.5 },
        metalnessNode: { label: 'Metalness', type: 'float', default: 0 },
        emissiveNode: { label: 'Emissive', type: 'color', default: '#000000' },
        clearcoatNode: { label: 'Clearcoat', type: 'float', default: 0 },
        clearcoatRoughnessNode: { label: 'Clearcoat Rough', type: 'float', default: 0 },
        sheenNode: { label: 'Sheen', type: 'color', default: '#000000' },
        sheenRoughnessNode: { label: 'Sheen Rough', type: 'float', default: 0 },
        iridescenceNode: { label: 'Iridescence', type: 'float', default: 0 },
        transmissionNode: { label: 'Transmission', type: 'float', default: 0 },
        thicknessNode: { label: 'Thickness', type: 'float', default: 0 },
        iorNode: { label: 'IOR', type: 'float', default: 1.5 },
        aoNode: { label: 'AO', type: 'float', default: 1 },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
        outputNode: { label: 'Output', type: 'vec4', connectionOnly: true },
        backdropNode: { label: 'Backdrop', type: 'vec3', connectionOnly: true },
        backdropAlphaNode: { label: 'Backdrop Alpha', type: 'float', connectionOnly: true },
        side: {
            label: 'Side',
            type: 'int',
            default: 0,
            propertyOnly: true,
            isMaterialProp: true,
            options: [
                { label: 'Front', value: 0 },
                { label: 'Back', value: 1 },
                { label: 'Double', value: 2 },
            ]
        },
        transparent: {
            label: 'Transparent',
            type: 'bool',
            default: false,
            propertyOnly: true,
            isMaterialProp: true,
        },
        depthWrite: {
            label: 'Depth Write',
            type: 'bool',
            default: true,
            propertyOnly: true,
            isMaterialProp: true,
        },
    },
    outputs: {},
    tsl: 'MeshPhysicalNodeMaterial',
    importFrom: 'three/webgpu',
} as const;

export const meshPhongMaterial = {
    type: 'material/phong',
    label: 'MeshPhongMaterial',
    category: 'Material',
    defaultActiveInputs: ['colorNode', 'positionNode'],
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        normalNode: { label: 'Normal', type: 'vec3', connectionOnly: true },
        specularNode: { label: 'Specular', type: 'color', default: '#111111' },
        shininessNode: { label: 'Shininess', type: 'float', default: 30 },
        emissiveNode: { label: 'Emissive', type: 'color', default: '#000000' },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
        outputNode: { label: 'Output', type: 'vec4', connectionOnly: true },
        backdropNode: { label: 'Backdrop', type: 'vec3', connectionOnly: true },
        backdropAlphaNode: { label: 'Backdrop Alpha', type: 'float', connectionOnly: true },
        side: {
            label: 'Side',
            type: 'int',
            default: 0,
            propertyOnly: true,
            isMaterialProp: true,
            options: [
                { label: 'Front', value: 0 },
                { label: 'Back', value: 1 },
                { label: 'Double', value: 2 },
            ]
        },
        transparent: {
            label: 'Transparent',
            type: 'bool',
            default: false,
            propertyOnly: true,
            isMaterialProp: true,
        },
        depthWrite: {
            label: 'Depth Write',
            type: 'bool',
            default: true,
            propertyOnly: true,
            isMaterialProp: true,
        },
    },
    outputs: {},
    tsl: 'MeshPhongNodeMaterial',
    importFrom: 'three/webgpu',
} as const;

export const spriteNodeMaterial = {
    type: 'material/sprite',
    label: 'SpriteNodeMaterial',
    category: 'Material',
    defaultActiveInputs: ['colorNode', 'positionNode'],
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
        scaleNode: { label: 'Scale', type: 'vec2', connectionOnly: true },
        rotationNode: { label: 'Rotation', type: 'float', default: 0 },
        alphaTest: { label: 'Alpha Test', type: 'float', default: 0 },
        depthWrite: {
            label: 'Depth Write',
            type: 'bool',
            default: false,
            propertyOnly: true,
            isMaterialProp: true
        },
        blending: {
            label: 'Blending',
            type: 'int',
            default: 2, // NormalBlending
            propertyOnly: true,
            isMaterialProp: true,
            options: [
                { label: 'No', value: 0 }, // NoBlending
                { label: 'Normal', value: 1 }, // NormalBlending
                { label: 'Additive', value: 2 }, // AdditiveBlending
                { label: 'Subtractive', value: 3 }, // SubtractiveBlending
                { label: 'Multiply', value: 4 }, // MultiplyBlending
                { label: 'Custom', value: 5 }, // CustomBlending
            ]
        }
    },
    outputs: {},
    tsl: 'SpriteNodeMaterial',
    importFrom: 'three/webgpu',
} as const;

// All material node types for easy checking
export const MATERIAL_NODE_TYPES = [
    'material/node',
    'material/standard',
    'material/basic',
    'material/physical',
    'material/phong',
    'material/sprite',
] as const;

export const materialNodes = [
    nodeMaterial,
    meshStandardMaterial,
    meshBasicMaterial,
    meshPhysicalMaterial,
    meshPhongMaterial,
    spriteNodeMaterial,
] as const;

// Type checks
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _materialChecks: readonly BaseNodeDef[] = [
    nodeMaterial, meshStandardMaterial, meshBasicMaterial, meshPhysicalMaterial, meshPhongMaterial, spriteNodeMaterial
];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _materialNodesCheck: readonly BaseNodeDef[] = materialNodes;
