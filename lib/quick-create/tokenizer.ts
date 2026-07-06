export type QuickCreateTokenType = 'number' | 'hex' | 'ident' | 'punct';

export interface QuickCreateToken {
    type: QuickCreateTokenType;
    value: string;
    start: number;
    end: number;
}

const MULTI_CHAR_PUNCT = ['**', '<=', '>=', '==', '&&', '||'] as const;
const SINGLE_CHAR_PUNCT = new Set(['+', '-', '*', '/', '%', '^', '(', ')', ',', '.', '?', ':', '<', '>', '!', '$']);

const NUMBER_RE = /^(?:\d+(?:\.\d*)?|\.\d+)/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}/;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*/;

/**
 * Tokenize a quick-create expression. Returns null when the input contains
 * characters the expression grammar can never accept, so callers can bail
 * out to the regular node search without partial results.
 */
export function tokenizeQuickCreateExpression(input: string): QuickCreateToken[] | null {
    const tokens: QuickCreateToken[] = [];
    let index = 0;

    while (index < input.length) {
        const char = input[index];

        if (char === ' ' || char === '\t') {
            index += 1;
            continue;
        }

        const rest = input.slice(index);

        // A '.' starting a number (".5") must win over member access.
        const numberMatch = NUMBER_RE.exec(rest);
        if (numberMatch) {
            tokens.push({ type: 'number', value: numberMatch[0], start: index, end: index + numberMatch[0].length });
            index += numberMatch[0].length;
            continue;
        }

        const hexMatch = HEX_COLOR_RE.exec(rest);
        if (hexMatch) {
            tokens.push({ type: 'hex', value: hexMatch[0], start: index, end: index + hexMatch[0].length });
            index += hexMatch[0].length;
            continue;
        }

        const identMatch = IDENTIFIER_RE.exec(rest);
        if (identMatch) {
            tokens.push({ type: 'ident', value: identMatch[0], start: index, end: index + identMatch[0].length });
            index += identMatch[0].length;
            continue;
        }

        const multi = MULTI_CHAR_PUNCT.find((punct) => rest.startsWith(punct));
        if (multi) {
            tokens.push({ type: 'punct', value: multi, start: index, end: index + multi.length });
            index += multi.length;
            continue;
        }

        if (SINGLE_CHAR_PUNCT.has(char)) {
            tokens.push({ type: 'punct', value: char, start: index, end: index + 1 });
            index += 1;
            continue;
        }

        return null;
    }

    return tokens;
}
