import type { Edge } from '@xyflow/react';
import type { QuickCreateConstantIntent } from '../quick-create-constants';
import type { AppNode, NodeType, TSLType } from '../types';
import type { QuickCreateFunctionEntry } from './catalog';

export type QuickCreateBinaryOperator =
    | '+' | '-' | '*' | '/' | '%' | '**' | '^'
    | '<' | '>' | '<=' | '>=' | '=='
    | '&&' | '||';

export type QuickCreateUnaryOperator = '-' | '!';

export type QuickCreateExpressionNode =
    | {
        kind: 'constant';
        intent: QuickCreateConstantIntent;
    }
    | {
        kind: 'operator';
        operator: QuickCreateBinaryOperator;
        nodeType: NodeType;
        leftHandleId: string;
        rightHandleId: string;
        resultKind: 'promote' | 'bool';
        foldable: boolean;
        left: QuickCreateExpressionNode;
        right: QuickCreateExpressionNode;
    }
    | {
        kind: 'call';
        entry: QuickCreateFunctionEntry;
        args: QuickCreateExpressionNode[];
    }
    | {
        kind: 'ident';
        name: string;
        nodeType: NodeType;
        outputHandleId: string;
        outputType: TSLType;
    }
    | {
        kind: 'unary';
        operator: QuickCreateUnaryOperator;
        nodeType: NodeType;
        inputHandleId: string;
        operand: QuickCreateExpressionNode;
    }
    | {
        kind: 'ternary';
        cond: QuickCreateExpressionNode;
        ifTrue: QuickCreateExpressionNode;
        ifFalse: QuickCreateExpressionNode;
    }
    | {
        kind: 'member';
        /** Raw swizzle characters as typed (xyzw/rgba mix allowed) */
        swizzle: string;
        object: QuickCreateExpressionNode;
    }
    | {
        kind: 'source';
        dataType: TSLType;
    };

export interface QuickCreateExpressionIntent {
    ast: QuickCreateExpressionNode;
    expression: string;
    label: string;
    outputHandleId: string;
    outputType: TSLType;
}

export interface QuickCreateExpressionGraph {
    nodes: AppNode[];
    edges: Edge[];
    outputNodeId: string;
    outputHandleId: string;
    outputType: TSLType;
}

export interface BuildQuickCreateExpressionGraphOptions {
    basePosition: { x: number; y: number };
    idPrefix?: string;
    parent?: {
        id: string;
        absolutePosition: { x: number; y: number };
    };
    /** Dragged-edge origin that `$` references resolve to */
    source?: {
        nodeId: string;
        handleId: string;
    };
}
