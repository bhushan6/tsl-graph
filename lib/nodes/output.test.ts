import { describe, it, expect, beforeAll } from 'vitest';
import { Node } from '@xyflow/react';
import { compileGraph } from '../compiler';
import { registry } from '../registry';
import { materialNodes } from './output';
import type { NodeType, TSLNodeData } from '@/lib/types';

const createNode = (
    id: string,
    type: string,
    data: Partial<TSLNodeData> = {},
): Node<TSLNodeData> => ({
    id,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        values: {},
        connected: {},
        ...data,
    },
});

describe('Material Nodes', () => {
    beforeAll(() => {
        registry.registerMany(materialNodes);
    });

    it('exposes blending as a raw material property on every material node', () => {
        for (const material of materialNodes) {
            expect(material.inputs?.blending).toMatchObject({
                label: 'Blending',
                type: 'int',
                default: 1,
                propertyOnly: true,
                isMaterialProp: true,
                options: [
                    { label: 'No', value: 0 },
                    { label: 'Normal', value: 1 },
                    { label: 'Additive', value: 2 },
                    { label: 'Subtractive', value: 3 },
                    { label: 'Multiply', value: 4 },
                    { label: 'Custom', value: 5 },
                ],
            });
        }
    });

    it('compiles active blending properties for every material node', () => {
        for (const material of materialNodes) {
            const nodes = [createNode('material', material.type, {
                activeInputs: ['blending'],
                values: { blending: 2 },
            })];

            const code = compileGraph(nodes, []);

            expect(code).toContain('material.blending = 2;');
        }
    });

    it('exposes emissiveNode on lit mesh materials', () => {
        const litMaterialTypes = new Set([
            'material/basic',
            'material/standard',
            'material/physical',
            'material/phong',
        ]);

        for (const material of materialNodes) {
            const emissiveNode = material.inputs && 'emissiveNode' in material.inputs
                ? material.inputs.emissiveNode
                : undefined;

            if (litMaterialTypes.has(material.type)) {
                expect(emissiveNode).toMatchObject({
                    label: 'Emissive',
                    type: 'color',
                    default: '#000000',
                });
            } else {
                expect(emissiveNode).toBeUndefined();
            }
        }
    });

    it('compiles an active MeshBasicNodeMaterial emissiveNode', () => {
        const nodes = [createNode('basic', 'material/basic', {
            activeInputs: ['emissiveNode'],
            values: { emissiveNode: '#ff0000' },
        })];

        const code = compileGraph(nodes, []);

        expect(code).toContain('material.emissiveNode = color("#ff0000");');
    });

    it('exposes SpriteNodeMaterial depthTest as a material property', () => {
        const spriteDef = materialNodes.find((node) => node.type === 'material/sprite');
        expect(spriteDef?.inputs?.depthTest).toMatchObject({
            label: 'Depth Test',
            type: 'bool',
            default: true,
            propertyOnly: true,
            isMaterialProp: true,
        });
    });

    it('compiles an active SpriteNodeMaterial depthTest property', () => {
        const nodes = [createNode('sprite', 'material/sprite', {
            activeInputs: ['depthTest'],
            values: { depthTest: false },
        })];

        const code = compileGraph(nodes, []);

        expect(code).toContain('material.depthTest = false;');
    });
});
