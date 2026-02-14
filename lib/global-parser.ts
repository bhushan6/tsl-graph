import * as acorn from 'acorn';
import type { GlobalContextKind, TSLType, TSLValueType } from '@/lib/types';

export type ParsedGlobalEntry = {
    name: string;
    kind: GlobalContextKind;
    type: TSLType;
    defaultValue: TSLValueType;
};

type ParseResult = {
    entries: ParsedGlobalEntry[];
    errors: string[];
};

const SUPPORTED_TYPES: Set<TSLType> = new Set([
    'float',
    'int',
    'bool',
    'vec2',
    'vec3',
    'vec4',
    'color',
]);

function parseNumericValue(node: any): number | null {
    if (!node) return null;
    if (node.type === 'Literal' && typeof node.value === 'number') {
        return node.value;
    }
    if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
        const value = parseNumericValue(node.argument);
        if (value === null) return null;
        return node.operator === '-' ? -value : value;
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
        const name = node.callee.name;
        if (name === 'float' || name === 'int' || name === 'uint') {
            const argValue = parseNumericValue(node.arguments?.[0]);
            if (argValue === null) return null;
            return name === 'int' || name === 'uint' ? Math.round(argValue) : argValue;
        }
    }
    return null;
}

function parseBoolValue(node: any): boolean | null {
    if (!node) return null;
    if (node.type === 'Literal' && typeof node.value === 'boolean') {
        return node.value;
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'bool') {
        const arg = node.arguments?.[0];
        if (!arg) return false;
        const numeric = parseNumericValue(arg);
        if (numeric !== null) return numeric !== 0;
        if (arg.type === 'Literal' && typeof arg.value === 'boolean') return arg.value;
    }
    return null;
}

function parseVectorArgs(size: number, args: any[]): number[] | null {
    if (!args || args.length === 0) {
        if (size === 4) return [0, 0, 0, 1];
        return Array.from({ length: size }, () => 0);
    }

    const values = args.map(parseNumericValue);
    if (values.some((v) => v === null)) return null;

    const numericValues = values as number[];
    if (numericValues.length === 1) {
        const scalar = numericValues[0];
        if (size === 4) return [scalar, scalar, scalar, 1];
        return Array.from({ length: size }, () => scalar);
    }

    if (numericValues.length >= size) {
        if (size === 4 && numericValues.length === 3) {
            return [numericValues[0], numericValues[1], numericValues[2], 1];
        }
        return numericValues.slice(0, size);
    }

    // pad missing values
    const padded = numericValues.slice();
    while (padded.length < size) {
        padded.push(size === 4 && padded.length === 3 ? 1 : 0);
    }
    return padded;
}

function parseColorValue(node: any): string | null {
    if (!node) return null;
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'color') {
        const arg = node.arguments?.[0];
        if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
            return arg.value;
        }
    }
    return null;
}

function parseValueExpression(node: any): { type: TSLType; value: TSLValueType } | null {
    if (!node) return null;

    if (node.type === 'Literal') {
        if (typeof node.value === 'number') {
            return { type: 'float', value: node.value };
        }
        if (typeof node.value === 'boolean') {
            return { type: 'bool', value: node.value };
        }
        return null;
    }

    if (node.type === 'UnaryExpression') {
        const numeric = parseNumericValue(node);
        if (numeric !== null) {
            return { type: 'float', value: numeric };
        }
    }

    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
        const callee = node.callee.name;
        const args = node.arguments ?? [];

        switch (callee) {
            case 'float': {
                const value = parseNumericValue(args[0]) ?? 0;
                return { type: 'float', value };
            }
            case 'int': {
                const value = parseNumericValue(args[0]) ?? 0;
                return { type: 'int', value: Math.round(value) };
            }
            case 'bool': {
                const value = parseBoolValue(node);
                return { type: 'bool', value: value ?? false };
            }
            case 'vec2': {
                const vector = parseVectorArgs(2, args);
                if (!vector) return null;
                return { type: 'vec2', value: vector };
            }
            case 'vec3': {
                const vector = parseVectorArgs(3, args);
                if (!vector) return null;
                return { type: 'vec3', value: vector };
            }
            case 'vec4': {
                const vector = parseVectorArgs(4, args);
                if (!vector) return null;
                return { type: 'vec4', value: vector };
            }
            case 'color': {
                const colorValue = parseColorValue(node);
                if (!colorValue) return null;
                return { type: 'color', value: colorValue };
            }
            default:
                break;
        }
    }

    return null;
}

function parseGlobalInit(name: string, init: any, errors: string[]): ParsedGlobalEntry | null {
    if (!init) {
        errors.push(`Global "${name}" has no initializer.`);
        return null;
    }

    if (init.type === 'CallExpression' && init.callee?.type === 'Identifier') {
        const callee = init.callee.name;
        if (callee === 'uniform' || callee === 'varying') {
            const arg = init.arguments?.[0];
            const parsed = parseValueExpression(arg);
            const type = parsed?.type ?? 'float';
            const value = parsed?.value ?? 0;
            if (!SUPPORTED_TYPES.has(type)) {
                errors.push(`Global "${name}" uses unsupported ${callee} type "${type}".`);
                return null;
            }
            return {
                name,
                kind: callee === 'uniform' ? 'uniform' : 'varying',
                type,
                defaultValue: value,
            };
        }
    }

    const parsed = parseValueExpression(init);
    if (!parsed) {
        errors.push(`Global "${name}" has unsupported initializer.`);
        return null;
    }
    if (!SUPPORTED_TYPES.has(parsed.type)) {
        errors.push(`Global "${name}" uses unsupported const type "${parsed.type}".`);
        return null;
    }

    return {
        name,
        kind: 'const',
        type: parsed.type,
        defaultValue: parsed.value,
    };
}

export function parseGlobalDeclarations(code: string): ParseResult {
    const entries: ParsedGlobalEntry[] = [];
    const errors: string[] = [];

    if (!code || !code.trim()) {
        return { entries, errors: ['Snippet is empty.'] };
    }

    let ast: any;
    try {
        ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' });
    } catch (e: unknown) {
        errors.push(`Syntax Error: ${e instanceof Error ? e.message : String(e)}`);
        return { entries, errors };
    }

    for (const node of ast.body ?? []) {
        if (node.type !== 'VariableDeclaration') continue;
        for (const decl of node.declarations ?? []) {
            if (decl.id?.type !== 'Identifier') continue;
            const name = decl.id.name;
            const parsed = parseGlobalInit(name, decl.init, errors);
            if (parsed) entries.push(parsed);
        }
    }

    if (entries.length === 0 && errors.length === 0) {
        errors.push('No global declarations found.');
    }

    return { entries, errors };
}
