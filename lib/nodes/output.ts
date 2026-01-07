import { BaseNodeDef } from './definitions';

// Material nodes - only ONE material node is allowed per graph
// This is enforced in the store

export const meshStandardMaterial = {
    type: 'material/standard',
    label: 'MeshStandardMaterial',
    category: 'Material',
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        normalNode: { label: 'Normal', type: 'vec3', connectionOnly: true },
        roughnessNode: { label: 'Roughness', type: 'float', default: 0.5 },
        metalnessNode: { label: 'Metalness', type: 'float', default: 0 },
        emissiveNode: { label: 'Emissive', type: 'color', default: '#000000' },
        aoNode: { label: 'AO', type: 'float', default: 1 },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
    },
    outputs: {},
    tsl: 'MeshStandardNodeMaterial',
} as const;

export const meshBasicMaterial = {
    type: 'material/basic',
    label: 'MeshBasicMaterial',
    category: 'Material',
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
    },
    outputs: {},
    tsl: 'MeshBasicNodeMaterial',
} as const;

export const meshPhysicalMaterial = {
    type: 'material/physical',
    label: 'MeshPhysicalMaterial',
    category: 'Material',
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
    },
    outputs: {},
    tsl: 'MeshPhysicalNodeMaterial',
} as const;

export const meshPhongMaterial = {
    type: 'material/phong',
    label: 'MeshPhongMaterial',
    category: 'Material',
    inputs: {
        colorNode: { label: 'Color', type: 'color', default: '#ffffff' },
        normalNode: { label: 'Normal', type: 'vec3', connectionOnly: true },
        specularNode: { label: 'Specular', type: 'color', default: '#111111' },
        shininessNode: { label: 'Shininess', type: 'float', default: 30 },
        emissiveNode: { label: 'Emissive', type: 'color', default: '#000000' },
        opacityNode: { label: 'Opacity', type: 'float', default: 1 },
        positionNode: { label: 'Position', type: 'vec3', connectionOnly: true },
    },
    outputs: {},
    tsl: 'MeshPhongNodeMaterial',
} as const;

// All material node types for easy checking
export const MATERIAL_NODE_TYPES = [
    'material/standard',
    'material/basic',
    'material/physical',
    'material/phong',
] as const;

export const materialNodes = [
    meshStandardMaterial,
    meshBasicMaterial,
    meshPhysicalMaterial,
    meshPhongMaterial,
] as const;

// Type checks
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _materialChecks: readonly BaseNodeDef[] = [
    meshStandardMaterial, meshBasicMaterial, meshPhysicalMaterial, meshPhongMaterial
];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _materialNodesCheck: readonly BaseNodeDef[] = materialNodes;
