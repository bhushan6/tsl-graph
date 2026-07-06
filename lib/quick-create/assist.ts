import { QUICK_CREATE_BINARY_OPERATORS, getQuickCreateCatalog } from './catalog';
import { tokenizeQuickCreateExpression, type QuickCreateToken } from './tokenizer';

const MAX_REPAIR_ATTEMPTS = 4;

// Punctuation that can never legally end an expression; stripped from the
// tail while repairing mid-keystroke input.
const DANGLING_END_PUNCT = new Set([
    ...Object.keys(QUICK_CREATE_BINARY_OPERATORS),
    '!', '?', ':', ',', '.',
]);

function isDanglingToken(token: QuickCreateToken): boolean {
    return token.type === 'punct' && DANGLING_END_PUNCT.has(token.value);
}

function getMissingCloserCount(tokens: QuickCreateToken[], end: number): number {
    let depth = 0;
    for (let i = 0; i < end; i += 1) {
        if (tokens[i].value === '(') depth += 1;
        if (tokens[i].value === ')') depth = Math.max(0, depth - 1);
    }
    return depth;
}

/**
 * Candidate repairs for an incomplete expression, best-first: close unbalanced
 * parens, then progressively strip trailing tokens (dangling operators, dots,
 * commas, and finally atoms) and re-close. "sin(time" → "sin(time)";
 * "mix(red," → "mix(red)"; "time * " → "time".
 *
 * The exact input is never included — callers try that first themselves.
 */
export function getQuickCreateRepairCandidates(query: string): string[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const tokens = tokenizeQuickCreateExpression(trimmed);
    if (!tokens || tokens.length === 0) return [];

    const candidates: string[] = [];
    const seen = new Set<string>([trimmed]);
    let end = tokens.length;

    for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS && end > 0; attempt += 1) {
        while (end > 0 && isDanglingToken(tokens[end - 1])) {
            end -= 1;
        }
        if (end === 0) break;

        const base = trimmed.slice(0, tokens[end - 1].end);
        const candidate = base + ')'.repeat(getMissingCloserCount(tokens, end));
        if (!seen.has(candidate)) {
            seen.add(candidate);
            candidates.push(candidate);
        }

        end -= 1;
    }

    return candidates;
}

export interface QuickCreateNameCompletion {
    /** Canonical catalog name, e.g. 'smoothstep' or 'positionLocal' */
    name: string;
    kind: 'function' | 'identifier';
    /** The search text after applying the completion */
    completedQuery: string;
}

/**
 * Completions for a partial trailing identifier in expression context, e.g.
 * "time * smoo" → "time * smoothstep(". Bare words are left to the regular
 * node search, so completions require preceding expression content.
 */
export function getQuickCreateNameCompletions(query: string, limit = 4): QuickCreateNameCompletion[] {
    // A trailing space means the word is finished.
    if (!query.trim() || /\s$/.test(query)) return [];

    const trimmed = query.trim();
    const tokens = tokenizeQuickCreateExpression(trimmed);
    if (!tokens || tokens.length < 2) return [];

    const last = tokens[tokens.length - 1];
    if (last.type !== 'ident' || last.end !== trimmed.length) return [];

    // Identifiers only continue an expression after punctuation like
    // operators, '(', ',' or '.' — never directly after ')' or another atom.
    const previous = tokens[tokens.length - 2];
    if (previous.type !== 'punct' || previous.value === ')') return [];
    const isMemberContext = previous.value === '.';

    const prefix = last.value.toLowerCase();
    if (prefix.length < 2) return [];

    const { functions, identifiers } = getQuickCreateCatalog();
    const head = trimmed.slice(0, last.start);
    const completions: QuickCreateNameCompletion[] = [];

    for (const [key, entry] of functions) {
        if (!key.startsWith(prefix)) continue;
        // Skip alias keys so 'ler…' doesn't surface as 'mix'
        if (key !== entry.name.toLowerCase()) continue;
        completions.push({
            name: entry.name,
            kind: 'function',
            completedQuery: `${head}${entry.name}(`,
        });
    }

    if (!isMemberContext) {
        for (const [key, entry] of identifiers) {
            if (!key.startsWith(prefix)) continue;
            completions.push({
                name: entry.name,
                kind: 'identifier',
                completedQuery: `${head}${entry.name}`,
            });
        }
    }

    completions.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    return completions.slice(0, limit);
}
