import type { Edge } from '@xyflow/react';
import type { AppNode, NodeType, TSLType, TSLValueType } from './types';
import {
    parseQuickCreateConstant,
    type QuickCreateConstantIntent,
} from './quick-create-constants';

export type QuickCreateExpressionOperator = '+' | '-' | '*' | '/';

export type QuickCreateExpressionNode =
    | {
        kind: 'constant';
        intent: QuickCreateConstantIntent;
    }
    | {
        kind: 'operator';
        operator: QuickCreateExpressionOperator;
        nodeType: NodeType;
        left: QuickCreateExpressionNode;
        right: QuickCreateExpressionNode;
    };

export interface QuickCreateExpressionIntent {
    ast: QuickCreateExpressionNode;
    expression: string;
    label: string;
    outputHandleId: 'out';
    outputType: TSLType;
}

export interface QuickCreateExpressionGraph {
    nodes: AppNode[];
    edges: Edge[];
    outputNodeId: string;
    outputHandleId: 'out';
    outputType: TSLType;
}

export interface BuildQuickCreateExpressionGraphOptions {
    basePosition: { x: number; y: number };
    idPrefix?: string;
    parent?: {
        id: string;
        absolutePosition: { x: number; y: number };
    };
}

const OPERATOR_NODE_TYPES: Record<QuickCreateExpressionOperator, NodeType> = {
    '+': 'math/add',
    '-': 'math/sub',
    '*': 'math/mul',
    '/': 'math/div',
};

const NUMBER_LITERAL_RE = /^(?:\d+(?:\.\d*)?|\.\d+)/;
const IDENTIFIER_RE = /^[a-zA-Z][a-zA-Z0-9]*/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}/;
const HORIZONTAL_GAP = 220;
const VERTICAL_GAP = 96;

let graphIdCounter = 0;

function getTypeLength(type: TSLType): number {
    if (type === 'color') return 3;
    if (type === 'float' || type === 'int' || type === 'uint' || type === 'bool') return 1;
    const vectorMatch = /^[biu]?vec([2-4])$/.exec(type);
    if (vectorMatch) return Number(vectorMatch[1]);
    if (type === 'mat2') return 4;
    if (type === 'mat3') return 9;
    if (type === 'mat4') return 16;
    return 0;
}

function isMatrixType(type: TSLType): boolean {
    return type === 'mat2' || type === 'mat3' || type === 'mat4';
}

function isVectorType(type: TSLType): boolean {
    return /^[biu]?vec[2-4]$/.test(type);
}

function getVectorFromMatrix(type: TSLType): TSLType {
    if (type === 'mat2') return 'vec2';
    if (type === 'mat3') return 'vec3';
    if (type === 'mat4') return 'vec4';
    return 'any';
}

function resolveBinaryOperatorResultType(leftType: TSLType, rightType: TSLType): TSLType {
    if (isMatrixType(leftType)) {
        if (rightType === 'float') return leftType;
        if (isVectorType(rightType)) return getVectorFromMatrix(leftType);
        if (isMatrixType(rightType)) return leftType;
    } else if (isMatrixType(rightType)) {
        if (leftType === 'float') return rightType;
        if (isVectorType(leftType)) return getVectorFromMatrix(rightType);
    }

    if (getTypeLength(rightType) > getTypeLength(leftType)) {
        return rightType;
    }

    return leftType;
}

function inferExpressionOutputType(node: QuickCreateExpressionNode): TSLType {
    if (node.kind === 'constant') return node.intent.outputType;

    return resolveBinaryOperatorResultType(
        inferExpressionOutputType(node.left),
        inferExpressionOutputType(node.right)
    );
}

function hasOperatorNode(node: QuickCreateExpressionNode): boolean {
    if (node.kind === 'operator') return true;
    return false;
}

function normalizeExpressionLabel(query: string): string {
    return query.trim().replace(/\s+/g, ' ');
}

class QuickCreateExpressionParser {
    private index = 0;

    constructor(private readonly input: string) { }

    parse(): QuickCreateExpressionNode | null {
        const expression = this.parseAdditive();
        if (!expression) return null;

        this.skipSpaces();
        if (this.index !== this.input.length) return null;
        if (!hasOperatorNode(expression)) return null;

        return expression;
    }

    private parseAdditive(): QuickCreateExpressionNode | null {
        let node = this.parseMultiplicative();
        if (!node) return null;

        while (true) {
            this.skipSpaces();
            const operator = this.input[this.index];
            if (operator !== '+' && operator !== '-') break;

            this.index += 1;
            const right = this.parseMultiplicative();
            if (!right) return null;

            node = {
                kind: 'operator',
                operator,
                nodeType: OPERATOR_NODE_TYPES[operator],
                left: node,
                right,
            };
        }

        return node;
    }

    private parseMultiplicative(): QuickCreateExpressionNode | null {
        let node = this.parsePrimary();
        if (!node) return null;

        while (true) {
            this.skipSpaces();
            const operator = this.input[this.index];
            if (operator !== '*' && operator !== '/') break;

            this.index += 1;
            const right = this.parsePrimary();
            if (!right) return null;

            node = {
                kind: 'operator',
                operator,
                nodeType: OPERATOR_NODE_TYPES[operator],
                left: node,
                right,
            };
        }

        return node;
    }

    private parsePrimary(): QuickCreateExpressionNode | null {
        this.skipSpaces();
        if (this.index >= this.input.length) return null;

        if (this.input[this.index] === '(') {
            this.index += 1;
            const node = this.parseAdditive();
            if (!node) return null;

            this.skipSpaces();
            if (this.input[this.index] !== ')') return null;
            this.index += 1;
            return node;
        }

        return this.parseNumberLiteral()
            ?? this.parseHexColorLiteral()
            ?? this.parseIdentifierLiteral();
    }

    private parseNumberLiteral(): QuickCreateExpressionNode | null {
        const start = this.index;
        let sign = '';

        if (this.input[this.index] === '+' || this.input[this.index] === '-') {
            sign = this.input[this.index];
            this.index += 1;
            this.skipSpaces();
        }

        const match = NUMBER_LITERAL_RE.exec(this.input.slice(this.index));
        if (!match) {
            this.index = start;
            return null;
        }

        this.index += match[0].length;
        return this.createConstantNode(`${sign}${match[0]}`, start);
    }

    private parseHexColorLiteral(): QuickCreateExpressionNode | null {
        const start = this.index;
        const match = HEX_COLOR_RE.exec(this.input.slice(this.index));
        if (!match) return null;

        this.index += match[0].length;
        return this.createConstantNode(match[0], start);
    }

    private parseIdentifierLiteral(): QuickCreateExpressionNode | null {
        const start = this.index;
        const match = IDENTIFIER_RE.exec(this.input.slice(this.index));
        if (!match) return null;

        this.index += match[0].length;
        const afterIdentifier = this.index;

        this.skipSpaces();
        if (this.input[this.index] === '(') {
            const closingIndex = this.findMatchingParen(this.index);
            if (closingIndex === -1) {
                this.index = start;
                return null;
            }

            this.index = closingIndex + 1;
            return this.createConstantNode(this.input.slice(start, this.index), start);
        }

        this.index = afterIdentifier;
        return this.createConstantNode(this.input.slice(start, afterIdentifier), start);
    }

    private findMatchingParen(openIndex: number): number {
        let depth = 0;
        for (let i = openIndex; i < this.input.length; i += 1) {
            const char = this.input[i];
            if (char === '(') depth += 1;
            if (char === ')') {
                depth -= 1;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    private createConstantNode(raw: string, start: number): QuickCreateExpressionNode | null {
        const intent = parseQuickCreateConstant(raw);
        if (!intent) {
            this.index = start;
            return null;
        }

        return {
            kind: 'constant',
            intent,
        };
    }

    private skipSpaces() {
        while (this.input[this.index] === ' ' || this.input[this.index] === '\t') {
            this.index += 1;
        }
    }
}

function createNode(
    id: string,
    nodeType: NodeType,
    values: Record<string, TSLValueType>,
    connected: Record<string, boolean>
): AppNode {
    return {
        id,
        type: nodeType,
        position: { x: 0, y: 0 },
        selected: false,
        data: {
            type: nodeType,
            values,
            connected,
        },
    };
}

function sanitizeIdPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function parseQuickCreateExpression(query: string): QuickCreateExpressionIntent | null {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const ast = new QuickCreateExpressionParser(trimmed).parse();
    if (!ast) return null;

    return {
        ast,
        expression: normalizeExpressionLabel(trimmed),
        label: `Create Expression ${normalizeExpressionLabel(trimmed)}`,
        outputHandleId: 'out',
        outputType: inferExpressionOutputType(ast),
    };
}

export function getQuickCreateExpressionSuggestions(query: string): QuickCreateExpressionIntent[] {
    const intent = parseQuickCreateExpression(query);
    return intent ? [intent] : [];
}

export function buildQuickCreateExpressionGraph(
    intent: QuickCreateExpressionIntent,
    options: BuildQuickCreateExpressionGraphOptions
): QuickCreateExpressionGraph {
    const idPrefix = options.idPrefix ?? `quick-expression-${Date.now()}-${graphIdCounter++}`;
    let nodeIndex = 0;
    let leafIndex = 0;
    const pendingNodes: Array<{ node: AppNode; depth: number; relativeY: number }> = [];
    const edges: Edge[] = [];

    const nextNodeId = (nodeType: NodeType) => `${idPrefix}-${sanitizeIdPart(nodeType)}-${nodeIndex++}`;

    const buildNode = (
        node: QuickCreateExpressionNode,
        depth: number
    ): { id: string; relativeY: number; outputHandleId: 'out' } => {
        if (node.kind === 'constant') {
            const id = nextNodeId(node.intent.nodeType);
            const relativeY = leafIndex * VERTICAL_GAP;
            leafIndex += 1;

            pendingNodes.push({
                node: createNode(id, node.intent.nodeType, { ...node.intent.values }, {}),
                depth,
                relativeY,
            });

            return { id, relativeY, outputHandleId: node.intent.outputHandleId as 'out' };
        }

        const left = buildNode(node.left, depth + 1);
        const right = buildNode(node.right, depth + 1);
        const id = nextNodeId(node.nodeType);
        const relativeY = (left.relativeY + right.relativeY) / 2;

        pendingNodes.push({
            node: createNode(id, node.nodeType, {}, { a: true, b: true }),
            depth,
            relativeY,
        });

        edges.push(
            {
                id: `edge-${left.id}-${left.outputHandleId}-${id}-a`,
                source: left.id,
                sourceHandle: left.outputHandleId,
                target: id,
                targetHandle: 'a',
            },
            {
                id: `edge-${right.id}-${right.outputHandleId}-${id}-b`,
                source: right.id,
                sourceHandle: right.outputHandleId,
                target: id,
                targetHandle: 'b',
            }
        );

        return { id, relativeY, outputHandleId: 'out' };
    };

    const output = buildNode(intent.ast, 0);
    const yOffset = options.basePosition.y - output.relativeY;

    const nodes = pendingNodes.map(({ node, depth, relativeY }) => {
        const absolutePosition = {
            x: options.basePosition.x - depth * HORIZONTAL_GAP,
            y: relativeY + yOffset,
        };
        const position = options.parent
            ? {
                x: absolutePosition.x - options.parent.absolutePosition.x,
                y: absolutePosition.y - options.parent.absolutePosition.y,
            }
            : absolutePosition;

        return {
            ...node,
            parentId: options.parent?.id,
            extent: options.parent ? 'parent' as const : undefined,
            position,
            selected: true,
        };
    });

    return {
        nodes,
        edges,
        outputNodeId: output.id,
        outputHandleId: output.outputHandleId,
        outputType: intent.outputType,
    };
}
