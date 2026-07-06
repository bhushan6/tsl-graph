import { parseQuickCreateConstant } from '../quick-create-constants';
import type { TSLType } from '../types';
import type { QuickCreateBinaryOperator, QuickCreateExpressionNode } from './ast';
import {
    QUICK_CREATE_BINARY_OPERATORS,
    getQuickCreateFunctionEntry,
    getQuickCreateIdentifierEntry,
} from './catalog';
import { SWIZZLE_CHAR_RE } from './infer';
import { tokenizeQuickCreateExpression, type QuickCreateToken } from './tokenizer';

export interface QuickCreateParseContext {
    /** When set, `$` is a valid leaf referring to the dragged edge source */
    source?: {
        dataType: TSLType;
    };
}

export function parseQuickCreateExpressionAst(
    input: string,
    context?: QuickCreateParseContext
): QuickCreateExpressionNode | null {
    const tokens = tokenizeQuickCreateExpression(input);
    if (!tokens || tokens.length === 0) return null;

    const parser = new ExpressionParser(input, tokens, context);
    const node = parser.parseExpression();
    if (!node || !parser.atEnd()) return null;
    return node;
}

class ExpressionParser {
    private pos = 0;

    constructor(
        private readonly input: string,
        private readonly tokens: QuickCreateToken[],
        private readonly context?: QuickCreateParseContext
    ) { }

    atEnd(): boolean {
        return this.pos >= this.tokens.length;
    }

    private peek(offset = 0): QuickCreateToken | undefined {
        return this.tokens[this.pos + offset];
    }

    private isPunct(value: string, offset = 0): boolean {
        const token = this.peek(offset);
        return token?.type === 'punct' && token.value === value;
    }

    private consume(): QuickCreateToken | undefined {
        return this.tokens[this.pos++];
    }

    parseExpression(): QuickCreateExpressionNode | null {
        const cond = this.parseBinary(0);
        if (!cond) return null;

        if (!this.isPunct('?')) return cond;
        this.consume();

        const ifTrue = this.parseExpression();
        if (!ifTrue) return null;
        if (!this.isPunct(':')) return null;
        this.consume();
        const ifFalse = this.parseExpression();
        if (!ifFalse) return null;

        return { kind: 'ternary', cond, ifTrue, ifFalse };
    }

    private parseBinary(minPrecedence: number): QuickCreateExpressionNode | null {
        let left = this.parseUnary();
        if (!left) return null;

        while (true) {
            const token = this.peek();
            if (token?.type !== 'punct') break;
            const info = QUICK_CREATE_BINARY_OPERATORS[token.value];
            if (!info || info.precedence < minPrecedence) break;

            this.consume();
            const right = this.parseBinary(
                info.rightAssociative ? info.precedence : info.precedence + 1
            );
            if (!right) return null;

            left = {
                kind: 'operator',
                operator: token.value as QuickCreateBinaryOperator,
                nodeType: info.nodeType,
                leftHandleId: info.leftHandleId,
                rightHandleId: info.rightHandleId,
                resultKind: info.resultKind,
                foldable: info.foldable,
                left,
                right,
            };
        }

        return left;
    }

    private parseUnary(): QuickCreateExpressionNode | null {
        if (this.isPunct('+')) {
            this.consume();
            return this.parseUnary();
        }

        if (this.isPunct('-')) {
            this.consume();
            const operand = this.parseUnary();
            if (!operand) return null;

            // Fold sign into scalar literals so `-2` stays a single constant.
            if (
                operand.kind === 'constant'
                && (operand.intent.nodeType === 'const/float' || operand.intent.nodeType === 'const/int')
                && typeof operand.intent.values.value === 'number'
            ) {
                const negated = parseQuickCreateConstant(String(-operand.intent.values.value));
                if (!negated) return null;
                return { kind: 'constant', intent: negated };
            }

            return {
                kind: 'unary',
                operator: '-',
                nodeType: 'math/negate',
                inputHandleId: 'x',
                operand,
            };
        }

        if (this.isPunct('!')) {
            this.consume();
            const operand = this.parseUnary();
            if (!operand) return null;
            return {
                kind: 'unary',
                operator: '!',
                nodeType: 'logic/not',
                inputHandleId: 'a',
                operand,
            };
        }

        return this.parsePostfix();
    }

    private parsePostfix(): QuickCreateExpressionNode | null {
        let node = this.parsePrimary();
        if (!node) return null;

        while (this.isPunct('.')) {
            this.consume();
            const nameToken = this.consume();
            if (nameToken?.type !== 'ident') return null;

            if (this.isPunct('(')) {
                // Method call: receiver becomes the first positional argument.
                const entry = getQuickCreateFunctionEntry(nameToken.value);
                if (!entry) return null;
                const args = this.parseArgs();
                if (!args) return null;
                if (args.length + 1 > entry.inputHandles.length) return null;
                node = { kind: 'call', entry, args: [node, ...args] };
                continue;
            }

            if (!SWIZZLE_CHAR_RE.test(nameToken.value)) return null;
            node = { kind: 'member', swizzle: nameToken.value, object: node };
        }

        return node;
    }

    private parseArgs(): QuickCreateExpressionNode[] | null {
        if (!this.isPunct('(')) return null;
        this.consume();

        if (this.isPunct(')')) {
            this.consume();
            return [];
        }

        const args: QuickCreateExpressionNode[] = [];
        while (true) {
            const arg = this.parseExpression();
            if (!arg) return null;
            args.push(arg);

            if (this.isPunct(',')) {
                this.consume();
                continue;
            }
            if (this.isPunct(')')) {
                this.consume();
                return args;
            }
            return null;
        }
    }

    private parsePrimary(): QuickCreateExpressionNode | null {
        const token = this.peek();
        if (!token) return null;

        if (token.type === 'number' || token.type === 'hex') {
            this.consume();
            const intent = parseQuickCreateConstant(token.value);
            if (!intent) return null;
            return { kind: 'constant', intent };
        }

        if (token.type === 'punct' && token.value === '$') {
            if (!this.context?.source) return null;
            this.consume();
            return { kind: 'source', dataType: this.context.source.dataType };
        }

        if (token.type === 'punct' && token.value === '(') {
            this.consume();
            const node = this.parseExpression();
            if (!node) return null;
            if (!this.isPunct(')')) return null;
            this.consume();
            return node;
        }

        if (token.type !== 'ident') return null;

        if (this.isPunct('(', 1)) {
            return this.parseIdentifierCall(token);
        }

        this.consume();

        const identifierEntry = getQuickCreateIdentifierEntry(token.value);
        if (identifierEntry) {
            return {
                kind: 'ident',
                name: identifierEntry.name,
                nodeType: identifierEntry.nodeType,
                outputHandleId: identifierEntry.outputHandleId,
                outputType: identifierEntry.outputType,
            };
        }

        // CSS color names ('blue', 'crimson', …) resolve last so catalog
        // names always win; call syntax never reaches here.
        const colorIntent = parseQuickCreateConstant(token.value);
        if (colorIntent) return { kind: 'constant', intent: colorIntent };

        return null;
    }

    private parseIdentifierCall(nameToken: QuickCreateToken): QuickCreateExpressionNode | null {
        const openParen = this.peek(1);
        if (!openParen) return null;

        // All-literal constructor calls (vec3(0, 1, 0), float(2), color(1, 0, 0))
        // stay single constant nodes, exactly like the standalone constant path.
        const closeIndex = this.findMatchingParen(openParen.start);
        if (closeIndex === -1) return null;

        const raw = this.input.slice(nameToken.start, closeIndex + 1);
        const constantIntent = parseQuickCreateConstant(raw);
        if (constantIntent) {
            while (this.pos < this.tokens.length && this.tokens[this.pos].start <= closeIndex) {
                this.pos += 1;
            }
            return { kind: 'constant', intent: constantIntent };
        }

        const functionEntry = getQuickCreateFunctionEntry(nameToken.value);
        if (functionEntry) {
            this.consume();
            const args = this.parseArgs();
            if (!args) return null;
            if (args.length > functionEntry.inputHandles.length) return null;
            return { kind: 'call', entry: functionEntry, args };
        }

        // Callable pure nodes: uv(), linearDepth() …
        const identifierEntry = getQuickCreateIdentifierEntry(nameToken.value);
        if (identifierEntry) {
            this.consume();
            const args = this.parseArgs();
            if (!args || args.length > 0) return null;
            return {
                kind: 'ident',
                name: identifierEntry.name,
                nodeType: identifierEntry.nodeType,
                outputHandleId: identifierEntry.outputHandleId,
                outputType: identifierEntry.outputType,
            };
        }

        return null;
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
}
