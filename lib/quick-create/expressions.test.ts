import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNodes } from '../nodes';
import {
    buildQuickCreateExpressionGraph,
    getQuickCreateEvaluatedConstantSuggestion,
    parseQuickCreateExpression,
} from './index';

beforeAll(() => {
    initializeNodes();
});

describe('parseQuickCreateExpression', () => {
    it('parses binary math over numeric literal constants', () => {
        const intent = parseQuickCreateExpression('2 * 1');

        expect(intent).toMatchObject({
            expression: '2 * 1',
            label: 'Create Expression 2 * 1',
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

    it('uses the constant parser for expression leaves', () => {
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

    it('folds signs into scalar literals and negates everything else', () => {
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
        expect(parseQuickCreateExpression('-(2 * 1)')).toMatchObject({
            ast: {
                kind: 'unary',
                operator: '-',
                nodeType: 'math/negate',
                operand: { kind: 'operator', operator: '*' },
            },
        });
    });

    it('parses registry function calls with positional arguments', () => {
        expect(parseQuickCreateExpression('sin(2)')).toMatchObject({
            outputType: 'float',
            ast: {
                kind: 'call',
                entry: { nodeType: 'math/sin', inputHandles: ['x'] },
                args: [{ kind: 'constant' }],
            },
        });

        expect(parseQuickCreateExpression('mix(red, blue, 0.5)')).toMatchObject({
            outputType: 'color',
            ast: {
                kind: 'call',
                entry: { nodeType: 'math/mix', inputHandles: ['a', 'b', 't'] },
            },
        });

        // Aliases and case-insensitive lookup
        expect(parseQuickCreateExpression('lerp(0, 1, 0.5)')).toMatchObject({
            ast: { entry: { nodeType: 'math/mix' } },
        });
        expect(parseQuickCreateExpression('OneMinus(0.25)')).toMatchObject({
            ast: { entry: { nodeType: 'math/oneMinus' } },
        });

        // Partial arguments fall back to port defaults
        expect(parseQuickCreateExpression('clamp(5)')).toMatchObject({
            ast: { kind: 'call', entry: { nodeType: 'math/clamp' } },
        });

        // Too many arguments fail
        expect(parseQuickCreateExpression('sin(1, 2)')).toBeNull();
        expect(parseQuickCreateExpression('unknownFn(1)')).toBeNull();
    });

    it('parses source identifiers like time and uv', () => {
        expect(parseQuickCreateExpression('sin(time * 2)')).toMatchObject({
            outputType: 'float',
            ast: {
                kind: 'call',
                entry: { nodeType: 'math/sin' },
                args: [{
                    kind: 'operator',
                    operator: '*',
                    left: { kind: 'ident', nodeType: 'geo/time', outputType: 'float' },
                }],
            },
        });

        expect(parseQuickCreateExpression('uv() * 2')).toMatchObject({
            outputType: 'vec2',
            ast: {
                kind: 'operator',
                left: { kind: 'ident', nodeType: 'geo/uv' },
            },
        });
    });

    it('parses extended operators', () => {
        expect(parseQuickCreateExpression('5 % 2')).toMatchObject({
            ast: { kind: 'operator', nodeType: 'math/mod', leftHandleId: 'x', rightHandleId: 'y' },
        });
        expect(parseQuickCreateExpression('2 ** 3')).toMatchObject({
            ast: { kind: 'operator', nodeType: 'math/pow' },
        });
        expect(parseQuickCreateExpression('2 ^ 3')).toMatchObject({
            ast: { kind: 'operator', nodeType: 'math/pow' },
        });
        // Right-associative exponentiation
        expect(parseQuickCreateExpression('2 ** 3 ** 2')).toMatchObject({
            ast: {
                kind: 'operator',
                left: { kind: 'constant' },
                right: { kind: 'operator', nodeType: 'math/pow' },
            },
        });
        expect(parseQuickCreateExpression('uv().x > 0.5')).toMatchObject({
            outputType: 'bool',
            ast: { kind: 'operator', nodeType: 'logic/greaterThan' },
        });
        expect(parseQuickCreateExpression('time > 1 && time < 2')).toMatchObject({
            outputType: 'bool',
            ast: { kind: 'operator', nodeType: 'logic/and' },
        });
        expect(parseQuickCreateExpression('!(time > 1)')).toMatchObject({
            outputType: 'bool',
            ast: { kind: 'unary', nodeType: 'logic/not' },
        });
    });

    it('parses ternaries into select', () => {
        expect(parseQuickCreateExpression('time > 1 ? red : blue')).toMatchObject({
            outputType: 'color',
            ast: {
                kind: 'ternary',
                cond: { kind: 'operator', nodeType: 'logic/greaterThan' },
                ifTrue: { kind: 'constant' },
                ifFalse: { kind: 'constant' },
            },
        });
    });

    it('parses swizzles with type validation', () => {
        expect(parseQuickCreateExpression('uv.x * 2')).toMatchObject({
            outputType: 'float',
            ast: {
                kind: 'operator',
                left: { kind: 'member', swizzle: 'x', object: { kind: 'ident', nodeType: 'geo/uv' } },
            },
        });
        expect(parseQuickCreateExpression('positionLocal.xy * 2')).toMatchObject({
            outputType: 'vec2',
        });
        // uv is a vec2: z is out of range
        expect(parseQuickCreateExpression('uv.z * 2')).toBeNull();
        expect(parseQuickCreateExpression('red.rgb + 1')).toMatchObject({
            outputType: 'vec3',
        });
    });

    it('parses TSL-style method chains', () => {
        expect(parseQuickCreateExpression('uv().mul(2).sub(1)')).toMatchObject({
            outputType: 'vec2',
            ast: {
                kind: 'call',
                entry: { nodeType: 'math/sub' },
                args: [
                    {
                        kind: 'call',
                        entry: { nodeType: 'math/mul' },
                        args: [{ kind: 'ident', nodeType: 'geo/uv' }, { kind: 'constant' }],
                    },
                    { kind: 'constant' },
                ],
            },
        });
        expect(parseQuickCreateExpression('time.sin()')).toMatchObject({
            ast: { kind: 'call', entry: { nodeType: 'math/sin' } },
        });
    });

    it('supports vector constructors with expression arguments', () => {
        expect(parseQuickCreateExpression('vec3(time, 0, 0)')).toMatchObject({
            outputType: 'vec3',
            ast: {
                kind: 'call',
                entry: { nodeType: 'const/vec3' },
                args: [{ kind: 'ident' }, { kind: 'constant' }, { kind: 'constant' }],
            },
        });
    });

    it('supports $ source references only when context provides one', () => {
        expect(parseQuickCreateExpression('$ * 2')).toBeNull();

        const withSource = parseQuickCreateExpression('$ * 2 + 0.5', {
            source: { dataType: 'float' },
        });
        expect(withSource).toMatchObject({
            outputType: 'float',
            ast: {
                kind: 'operator',
                operator: '+',
                left: {
                    kind: 'operator',
                    operator: '*',
                    left: { kind: 'source', dataType: 'float' },
                },
            },
        });

        // A lone $ would just recreate the dragged edge
        expect(parseQuickCreateExpression('$', { source: { dataType: 'float' } })).toBeNull();
    });

    it('rejects single-node and malformed inputs', () => {
        expect(parseQuickCreateExpression('2')).toBeNull();
        expect(parseQuickCreateExpression('vec3(0, 1, 0)')).toBeNull();
        expect(parseQuickCreateExpression('blue')).toBeNull();
        expect(parseQuickCreateExpression('time')).toBeNull();
        expect(parseQuickCreateExpression('uv()')).toBeNull();
        expect(parseQuickCreateExpression('2 *')).toBeNull();
        expect(parseQuickCreateExpression('sin(')).toBeNull();
        expect(parseQuickCreateExpression('sin(2))')).toBeNull();
        expect(parseQuickCreateExpression('time ? 1 : ')).toBeNull();
    });
});

describe('buildQuickCreateExpressionGraph', () => {
    it('folds scalar literals into operator node values', () => {
        const intent = parseQuickCreateExpression('2 * 1');
        expect(intent).not.toBeNull();

        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        expect(graph.outputNodeId).toBe('expr-math-mul-0');
        expect(graph.outputHandleId).toBe('out');
        expect(graph.nodes).toHaveLength(1);
        expect(graph.nodes[0]).toMatchObject({
            data: {
                type: 'math/mul',
                values: { a: 2, b: 1 },
                connected: {},
            },
            position: { x: 500, y: 300 },
            selected: true,
        });
        expect(graph.edges).toHaveLength(0);
    });

    it('keeps vector and color literals as nodes and wires them', () => {
        const intent = parseQuickCreateExpression('vec3(0, 1, 0) * 2');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        expect(graph.nodes.map((node) => node.data.type)).toEqual(['const/vec3', 'math/mul']);
        expect(graph.nodes[0].data.values).toEqual({ x: 0, y: 1, z: 0 });
        expect(graph.nodes[0].position).toEqual({ x: 280, y: 300 });
        expect(graph.nodes[1].data.values).toEqual({ b: 2 });
        expect(graph.nodes[1].position).toEqual({ x: 500, y: 300 });
        expect(graph.edges).toMatchObject([
            {
                source: 'expr-const-vec3-0',
                sourceHandle: 'out',
                target: 'expr-math-mul-1',
                targetHandle: 'a',
            },
        ]);
    });

    it('places deeper subexpressions farther left and keeps the root at the base position', () => {
        const intent = parseQuickCreateExpression('sin(time * 2)');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 600, y: 200 },
            idPrefix: 'chain',
        });

        expect(graph.nodes.map((node) => node.data.type)).toEqual([
            'geo/time',
            'math/mul',
            'math/sin',
        ]);
        const [time, mul, sin] = graph.nodes;
        expect(sin.position).toEqual({ x: 600, y: 200 });
        expect(mul.position).toEqual({ x: 380, y: 200 });
        expect(time.position).toEqual({ x: 160, y: 200 });
        expect(graph.edges).toMatchObject([
            { source: time.id, sourceHandle: 'out', target: mul.id, targetHandle: 'a' },
            { source: mul.id, sourceHandle: 'out', target: sin.id, targetHandle: 'x' },
        ]);
    });

    it('wires call arguments positionally and folds scalar args', () => {
        const intent = parseQuickCreateExpression('mix(red, blue, 0.5)');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        expect(graph.nodes.map((node) => node.data.type)).toEqual([
            'const/color',
            'const/color',
            'math/mix',
        ]);
        const mix = graph.nodes[2];
        expect(mix.data.values).toEqual({ t: 0.5 });
        expect(mix.data.connected).toEqual({ a: true, b: true });
        expect(mix.position).toEqual({ x: 500, y: 300 });
        expect(graph.edges).toMatchObject([
            { targetHandle: 'a' },
            { targetHandle: 'b' },
        ]);
    });

    it('reuses component output handles for swizzles when available', () => {
        const intent = parseQuickCreateExpression('uv.x * 2');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        // geo/uv exposes an x output directly: no split node needed
        expect(graph.nodes.map((node) => node.data.type)).toEqual(['geo/uv', 'math/mul']);
        expect(graph.edges).toMatchObject([
            { sourceHandle: 'x', targetHandle: 'a' },
        ]);
    });

    it('inserts a split node when the object has no component outputs', () => {
        const intent = parseQuickCreateExpression('(uv * 2).x');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        expect(graph.nodes.map((node) => node.data.type)).toEqual([
            'geo/uv',
            'math/mul',
            'math/split',
        ]);
        expect(graph.outputNodeId).toBe(graph.nodes[2].id);
        expect(graph.outputHandleId).toBe('x');
    });

    it('recombines multi-component swizzles through a vector constructor', () => {
        const intent = parseQuickCreateExpression('positionLocal.xz + 1');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        const types = graph.nodes.map((node) => node.data.type);
        expect(types).toContain('geo/positionLocal');
        expect(types).toContain('const/vec2');
        expect(types).toContain('math/add');
        const vec2 = graph.nodes.find((node) => node.data.type === 'const/vec2')!;
        expect(graph.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceHandle: 'x', target: vec2.id, targetHandle: 'x' }),
            expect.objectContaining({ sourceHandle: 'z', target: vec2.id, targetHandle: 'y' }),
        ]));
    });

    it('builds ternaries as select nodes', () => {
        const intent = parseQuickCreateExpression('time > 1 ? 1 : 0');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        expect(graph.nodes.map((node) => node.data.type)).toEqual([
            'geo/time',
            'logic/greaterThan',
            'logic/select',
        ]);
        const select = graph.nodes[2];
        expect(select.data.values).toEqual({ trueVal: 1, falseVal: 0 });
        expect(select.data.connected).toEqual({ cond: true });
        const greaterThan = graph.nodes[1];
        expect(greaterThan.data.values).toEqual({ b: 1 });
    });

    it('deduplicates repeated identifier leaves', () => {
        const intent = parseQuickCreateExpression('uv.x + uv.y');
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
        });

        expect(graph.nodes.map((node) => node.data.type)).toEqual(['geo/uv', 'math/add']);
        expect(graph.edges).toMatchObject([
            { sourceHandle: 'x', targetHandle: 'a' },
            { sourceHandle: 'y', targetHandle: 'b' },
        ]);
    });

    it('wires $ references to the provided drag source', () => {
        const intent = parseQuickCreateExpression('$ * 2 + 0.5', {
            source: { dataType: 'float' },
        });
        const graph = buildQuickCreateExpressionGraph(intent!, {
            basePosition: { x: 500, y: 300 },
            idPrefix: 'expr',
            source: { nodeId: 'noise-1', handleId: 'out' },
        });

        expect(graph.nodes.map((node) => node.data.type)).toEqual(['math/mul', 'math/add']);
        expect(graph.edges).toMatchObject([
            { source: 'noise-1', sourceHandle: 'out', target: 'expr-math-mul-0', targetHandle: 'a' },
            { source: 'expr-math-mul-0', sourceHandle: 'out', target: 'expr-math-add-1', targetHandle: 'a' },
        ]);
        expect(graph.nodes[0].data.values).toEqual({ b: 2 });
        expect(graph.nodes[1].data.values).toEqual({ b: 0.5 });
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

describe('getQuickCreateEvaluatedConstantSuggestion', () => {
    it('evaluates purely numeric expressions', () => {
        expect(getQuickCreateEvaluatedConstantSuggestion('3 - 2')).toMatchObject({
            nodeType: 'const/float',
            values: { value: 1 },
            label: 'Create Float 1 (evaluated)',
        });
        expect(getQuickCreateEvaluatedConstantSuggestion('2 ** 3 * 0.5')).toMatchObject({
            values: { value: 4 },
        });
    });

    it('rejects non-numeric and non-finite results', () => {
        expect(getQuickCreateEvaluatedConstantSuggestion('1 / 0')).toBeNull();
        expect(getQuickCreateEvaluatedConstantSuggestion('sin(2)')).toBeNull();
        expect(getQuickCreateEvaluatedConstantSuggestion('time * 2')).toBeNull();
        expect(getQuickCreateEvaluatedConstantSuggestion('2')).toBeNull();
    });
});
