import { describe, expect, it } from 'vitest';
import {
    buildQuickCreateExpressionGraph,
    parseQuickCreateExpression,
} from './quick-create-expressions';

describe('parseQuickCreateExpression', () => {
    it('parses binary math over numeric literal constants', () => {
        const intent = parseQuickCreateExpression('2 * 1');

        expect(intent).toMatchObject({
            expression: '2 * 1',
            label: 'Create Expression 2 * 1',
            outputHandleId: 'out',
            outputType: 'float',
            ast: {
                kind: 'operator',
                operator: '*',
                nodeType: 'math/mul',
            },
        });

        expect(intent?.ast.kind === 'operator' ? intent.ast.left : null).toMatchObject({
            kind: 'constant',
            intent: {
                nodeType: 'const/float',
                values: { value: 2 },
            },
        });
        expect(intent?.ast.kind === 'operator' ? intent.ast.right : null).toMatchObject({
            kind: 'constant',
            intent: {
                nodeType: 'const/float',
                values: { value: 1 },
            },
        });
    });

    it('respects arithmetic precedence and parentheses', () => {
        const precedence = parseQuickCreateExpression('2 + 1 * 4');
        expect(precedence?.ast).toMatchObject({
            kind: 'operator',
            operator: '+',
            left: { kind: 'constant' },
            right: {
                kind: 'operator',
                operator: '*',
            },
        });

        const grouped = parseQuickCreateExpression('(2 + 1) * 4');
        expect(grouped?.ast).toMatchObject({
            kind: 'operator',
            operator: '*',
            left: {
                kind: 'operator',
                operator: '+',
            },
            right: { kind: 'constant' },
        });
    });

    it('uses the current constant parser for expression leaves', () => {
        const vectorScale = parseQuickCreateExpression('vec3(0, 1, 0) * 2');
        expect(vectorScale).toMatchObject({
            outputType: 'vec3',
            ast: {
                kind: 'operator',
                operator: '*',
                left: {
                    kind: 'constant',
                    intent: {
                        nodeType: 'const/vec3',
                        values: { x: 0, y: 1, z: 0 },
                    },
                },
            },
        });

        const colorMix = parseQuickCreateExpression('#ff0000 + blue');
        expect(colorMix).toMatchObject({
            outputType: 'color',
            ast: {
                kind: 'operator',
                left: {
                    kind: 'constant',
                    intent: {
                        nodeType: 'const/color',
                        values: { value: '#ff0000' },
                    },
                },
                right: {
                    kind: 'constant',
                    intent: {
                        nodeType: 'const/color',
                        values: { value: '#0000ff' },
                    },
                },
            },
        });
    });

    it('supports signed numeric operands without enabling general unary expressions', () => {
        expect(parseQuickCreateExpression('-2 * .5')).toMatchObject({
            outputType: 'float',
            ast: {
                kind: 'operator',
                left: {
                    kind: 'constant',
                    intent: { values: { value: -2 } },
                },
                right: {
                    kind: 'constant',
                    intent: { values: { value: 0.5 } },
                },
            },
        });
        expect(parseQuickCreateExpression('2 * -1')).toMatchObject({
            ast: {
                kind: 'operator',
                right: {
                    kind: 'constant',
                    intent: { values: { value: -1 } },
                },
            },
        });
        expect(parseQuickCreateExpression('-(2 * 1)')).toBeNull();
    });

    it('rejects incomplete expressions and non-expression literals', () => {
        expect(parseQuickCreateExpression('2')).toBeNull();
        expect(parseQuickCreateExpression('vec3(0, 1, 0)')).toBeNull();
        expect(parseQuickCreateExpression('2 *')).toBeNull();
        expect(parseQuickCreateExpression('sin(2)')).toBeNull();
        expect(parseQuickCreateExpression('2 ** 3')).toBeNull();
    });
});

describe('buildQuickCreateExpressionGraph', () => {
    it('builds constants, an operator node, and connecting edges', () => {
        const intent = parseQuickCreateExpression('2 * 1');
        expect(intent).not.toBeNull();

        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        expect(graph.outputNodeId).toBe('expr-math-mul-2');
        expect(graph.nodes.map((node) => node.data.type)).toEqual([
            'const/float',
            'const/float',
            'math/mul',
        ]);
        expect(graph.nodes.map((node) => node.selected)).toEqual([true, true, true]);
        expect(graph.nodes[0].position).toEqual({ x: 280, y: 252 });
        expect(graph.nodes[1].position).toEqual({ x: 280, y: 348 });
        expect(graph.nodes[2].position).toEqual({ x: 500, y: 300 });
        expect(graph.edges).toMatchObject([
            {
                source: 'expr-const-float-0',
                sourceHandle: 'out',
                target: 'expr-math-mul-2',
                targetHandle: 'a',
            },
            {
                source: 'expr-const-float-1',
                sourceHandle: 'out',
                target: 'expr-math-mul-2',
                targetHandle: 'b',
            },
        ]);
    });

    it('places deeper subexpressions farther left and keeps the final node at the base position', () => {
        const intent = parseQuickCreateExpression('(2 + 1) * 4');
        expect(intent).not.toBeNull();

        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 600, y: 200 },
            idPrefix: 'grouped',
        });

        const root = graph.nodes.find((node) => node.id === graph.outputNodeId);
        const addNode = graph.nodes.find((node) => node.data.type === 'math/add');
        const constants = graph.nodes.filter((node) => node.data.type === 'const/float');

        expect(root?.data.type).toBe('math/mul');
        expect(root?.position).toEqual({ x: 600, y: 200 });
        expect(addNode?.position.x).toBe(380);
        expect(constants.map((node) => node.position.x).sort((a, b) => a - b)).toEqual([
            160,
            160,
            380,
        ]);
        expect(graph.edges).toHaveLength(4);
    });

    it('can return positions relative to a parent group', () => {
        const intent = parseQuickCreateExpression('2 + 1');
        expect(intent).not.toBeNull();

        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'parented',
            parent: {
                id: 'group-1',
                absolutePosition: { x: 100, y: 40 },
            },
        });

        expect(graph.nodes.every((node) => node.parentId === 'group-1')).toBe(true);
        expect(graph.nodes.every((node) => node.extent === 'parent')).toBe(true);
        expect(graph.nodes.find((node) => node.id === graph.outputNodeId)?.position).toEqual({
            x: 400,
            y: 260,
        });
    });
});
