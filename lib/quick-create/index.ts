import { parseQuickCreateConstant, type QuickCreateConstantIntent } from '../quick-create-constants';
import type { QuickCreateExpressionIntent, QuickCreateExpressionNode } from './ast';
import { inferQuickCreateExpressionType } from './infer';
import { parseQuickCreateExpressionAst, type QuickCreateParseContext } from './parser';

export type {
    BuildQuickCreateExpressionGraphOptions,
    QuickCreateBinaryOperator,
    QuickCreateExpressionGraph,
    QuickCreateExpressionIntent,
    QuickCreateExpressionNode,
    QuickCreateUnaryOperator,
} from './ast';
export { buildQuickCreateExpressionGraph } from './build-graph';
export {
    getQuickCreateCatalog,
    getQuickCreateFunctionEntry,
    getQuickCreateIdentifierEntry,
    type QuickCreateFunctionEntry,
    type QuickCreateIdentifierEntry,
} from './catalog';
export { inferQuickCreateExpressionType } from './infer';
export type { QuickCreateParseContext } from './parser';

function normalizeExpressionLabel(query: string): string {
    return query.trim().replace(/\s+/g, ' ');
}

/**
 * Single-node inputs are owned by other picker paths: bare constants by the
 * constant suggestions, bare identifiers by the regular node search, and a
 * lone `$` would just recreate the dragged edge.
 */
function isSingleNodeInput(ast: QuickCreateExpressionNode): boolean {
    return ast.kind === 'constant' || ast.kind === 'ident' || ast.kind === 'source';
}

export function parseQuickCreateExpression(
    query: string,
    context?: QuickCreateParseContext
): QuickCreateExpressionIntent | null {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const ast = parseQuickCreateExpressionAst(trimmed, context);
    if (!ast) return null;
    if (isSingleNodeInput(ast)) return null;

    const outputType = inferQuickCreateExpressionType(ast);
    if (!outputType) return null;

    const expression = normalizeExpressionLabel(trimmed);
    const typeSuffix = outputType === 'any' ? '' : ` → ${outputType}`;

    return {
        ast,
        expression,
        label: `Create Expression ${expression}${typeSuffix}`,
        outputHandleId: 'out',
        outputType,
    };
}

export function getQuickCreateExpressionSuggestions(
    query: string,
    context?: QuickCreateParseContext
): QuickCreateExpressionIntent[] {
    const intent = parseQuickCreateExpression(query, context);
    return intent ? [intent] : [];
}

/** Whether the expression references the dragged edge source via `$` */
export function expressionUsesSource(ast: QuickCreateExpressionNode): boolean {
    switch (ast.kind) {
        case 'source': return true;
        case 'constant':
        case 'ident': return false;
        case 'operator': return expressionUsesSource(ast.left) || expressionUsesSource(ast.right);
        case 'unary': return expressionUsesSource(ast.operand);
        case 'ternary':
            return expressionUsesSource(ast.cond)
                || expressionUsesSource(ast.ifTrue)
                || expressionUsesSource(ast.ifFalse);
        case 'call': return ast.args.some(expressionUsesSource);
        case 'member': return expressionUsesSource(ast.object);
    }
}

function evaluateNumericAst(ast: QuickCreateExpressionNode): number | null {
    switch (ast.kind) {
        case 'constant': {
            const { nodeType, values } = ast.intent;
            if (nodeType !== 'const/float' && nodeType !== 'const/int') return null;
            return typeof values.value === 'number' ? values.value : null;
        }
        case 'unary': {
            if (ast.operator !== '-') return null;
            const operand = evaluateNumericAst(ast.operand);
            return operand === null ? null : -operand;
        }
        case 'operator': {
            const left = evaluateNumericAst(ast.left);
            const right = evaluateNumericAst(ast.right);
            if (left === null || right === null) return null;
            switch (ast.operator) {
                case '+': return left + right;
                case '-': return left - right;
                case '*': return left * right;
                case '/': return left / right;
                case '%': return left % right;
                case '**':
                case '^': return left ** right;
                default: return null;
            }
        }
        default:
            return null;
    }
}

/**
 * For purely numeric expressions, offer the pre-computed constant as an
 * alternative to building the operator graph, e.g. "3 - 2" → Float 1.
 */
export function getQuickCreateEvaluatedConstantSuggestion(query: string): QuickCreateConstantIntent | null {
    const intent = parseQuickCreateExpression(query);
    if (!intent) return null;

    const value = evaluateNumericAst(intent.ast);
    if (value === null || !Number.isFinite(value)) return null;

    const rounded = Math.round(value * 1e6) / 1e6;
    const constant = parseQuickCreateConstant(String(rounded));
    if (!constant) return null;

    return {
        ...constant,
        label: `${constant.label} (evaluated)`,
    };
}
