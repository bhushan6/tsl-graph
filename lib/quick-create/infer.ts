import type { TSLType } from '../types';
import type { QuickCreateExpressionNode } from './ast';

export function getTypeLength(type: TSLType): number {
    if (type === 'color') return 3;
    if (type === 'float' || type === 'int' || type === 'uint' || type === 'bool') return 1;
    const vectorMatch = /^[biu]?vec([2-4])$/.exec(type);
    if (vectorMatch) return Number(vectorMatch[1]);
    if (type === 'mat2') return 4;
    if (type === 'mat3') return 9;
    if (type === 'mat4') return 16;
    return 0;
}

export function isMatrixType(type: TSLType): boolean {
    return type === 'mat2' || type === 'mat3' || type === 'mat4';
}

export function isVectorType(type: TSLType): boolean {
    return /^[biu]?vec[2-4]$/.test(type);
}

function getVectorFromMatrix(type: TSLType): TSLType {
    if (type === 'mat2') return 'vec2';
    if (type === 'mat3') return 'vec3';
    if (type === 'mat4') return 'vec4';
    return 'any';
}

export function resolveBinaryOperatorResultType(leftType: TSLType, rightType: TSLType): TSLType {
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

const SWIZZLE_COMPONENT_INDEX: Record<string, number> = {
    x: 0, y: 1, z: 2, w: 3,
    r: 0, g: 1, b: 2, a: 3,
};

export const SWIZZLE_CHAR_RE = /^[xyzwrgba]{1,4}$/;

export function normalizeSwizzleChar(char: string): 'x' | 'y' | 'z' | 'w' {
    const index = SWIZZLE_COMPONENT_INDEX[char] ?? 0;
    return (['x', 'y', 'z', 'w'] as const)[index];
}

function swizzleResultType(length: number): TSLType {
    if (length === 1) return 'float';
    return `vec${length}` as TSLType;
}

function isSwizzleValidForType(swizzle: string, objectType: TSLType): boolean {
    if (objectType === 'any') return true;
    if (isMatrixType(objectType)) return false;
    const length = getTypeLength(objectType);
    if (length === 0) return false;
    return [...swizzle].every((char) => SWIZZLE_COMPONENT_INDEX[char] < length);
}

/**
 * Infer the output type of an expression AST. Returns null when the
 * expression is structurally invalid (e.g. swizzling out of range), which
 * callers treat as a parse failure.
 */
export function inferQuickCreateExpressionType(node: QuickCreateExpressionNode): TSLType | null {
    switch (node.kind) {
        case 'constant':
            return node.intent.outputType;
        case 'ident':
            return node.outputType;
        case 'source':
            return node.dataType;
        case 'operator': {
            const left = inferQuickCreateExpressionType(node.left);
            const right = inferQuickCreateExpressionType(node.right);
            if (!left || !right) return null;
            if (node.resultKind === 'bool') return 'bool';
            return resolveBinaryOperatorResultType(left, right);
        }
        case 'unary': {
            const operand = inferQuickCreateExpressionType(node.operand);
            if (!operand) return null;
            return node.operator === '!' ? 'bool' : operand;
        }
        case 'ternary': {
            const cond = inferQuickCreateExpressionType(node.cond);
            const ifTrue = inferQuickCreateExpressionType(node.ifTrue);
            const ifFalse = inferQuickCreateExpressionType(node.ifFalse);
            if (!cond || !ifTrue || !ifFalse) return null;
            return resolveBinaryOperatorResultType(ifTrue, ifFalse);
        }
        case 'call': {
            const argTypes: TSLType[] = [];
            for (const arg of node.args) {
                const argType = inferQuickCreateExpressionType(arg);
                if (!argType) return null;
                argTypes.push(argType);
            }
            if (node.entry.outputType !== 'any') return node.entry.outputType;
            if (argTypes.length === 0) return 'any';
            return argTypes.reduce((acc, type) => resolveBinaryOperatorResultType(acc, type));
        }
        case 'member': {
            const objectType = inferQuickCreateExpressionType(node.object);
            if (!objectType) return null;
            if (!isSwizzleValidForType(node.swizzle, objectType)) return null;
            return swizzleResultType(node.swizzle.length);
        }
    }
}
