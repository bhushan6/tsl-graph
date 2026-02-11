import * as acorn from 'acorn';
import type { CodeNodeLanguage, TSLType } from './types';

/**
 * Parser for TSL Fn code to extract arguments and validate structure.
 * 
 * Expected format:
 * Fn(([arg1, arg2]) => {
 *     // code
 *     return result;
 * })
 */

export interface ParsedCodeNode {
    /** Extracted argument names */
    arguments: string[];
    /** Whether the code is valid */
    isValid: boolean;
    /** Error message if invalid */
    error?: string;
    /** Inferred argument types (WGSL only) */
    argTypes?: Record<string, TSLType>;
    /** Inferred return type (WGSL only) */
    returnType?: TSLType;
}

const RESERVED_KEYWORDS = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
    'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
    'typeof', 'var', 'void', 'while', 'with', 'yield',
    'let', 'static', 'enum', 'await', 'implements', 'interface', 'package', 'private', 'protected', 'public'
]);

const IDENTIFIER_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function stripWgslComments(code: string): string {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

function mapWgslTypeToTsl(rawType: string): TSLType {
    const normalized = rawType.replace(/\s+/g, '').toLowerCase();

    // Scalars
    if (normalized === 'f32') return 'float';
    if (normalized === 'i32') return 'int';
    if (normalized === 'u32') return 'uint';
    if (normalized === 'bool') return 'bool';

    // Vectors (shorthand)
    const vecShorthand = normalized.match(/^vec([234])([fiub])$/);
    if (vecShorthand) {
        const size = vecShorthand[1];
        const kind = vecShorthand[2];
        if (kind === 'f') return `vec${size}` as TSLType;
        if (kind === 'i') return `ivec${size}` as TSLType;
        if (kind === 'u') return `uvec${size}` as TSLType;
        if (kind === 'b') return `bvec${size}` as TSLType;
    }

    // Vectors (generic)
    const vecGeneric = normalized.match(/^vec([234])<([^>]+)>$/);
    if (vecGeneric) {
        const size = vecGeneric[1];
        const inner = vecGeneric[2];
        if (inner === 'f32') return `vec${size}` as TSLType;
        if (inner === 'i32') return `ivec${size}` as TSLType;
        if (inner === 'u32') return `uvec${size}` as TSLType;
        if (inner === 'bool') return `bvec${size}` as TSLType;
    }

    // Matrices
    const matShorthand = normalized.match(/^mat([234])x\1f$/);
    if (matShorthand) {
        return `mat${matShorthand[1]}` as TSLType;
    }
    const matGeneric = normalized.match(/^mat([234])x\1<f32>$/);
    if (matGeneric) {
        return `mat${matGeneric[1]}` as TSLType;
    }

    return 'any';
}

function parseWgslSignature(code: string): { args: Array<{ name: string; type: string }>; returnType: string } | null {
    const stripped = stripWgslComments(code);
    const match = stripped.match(/fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\)\s*->\s*([^\s{]+)\s*\{/);
    if (!match) return null;

    const argsRaw = match[2].trim();
    const returnType = match[3].trim();
    const args: Array<{ name: string; type: string }> = [];

    if (argsRaw.length > 0) {
        const parts = argsRaw.split(',');
        for (const part of parts) {
            let param = part.trim();
            if (!param) continue;
            // Strip parameter attributes (e.g., @location(0))
            param = param.replace(/@\w+(\([^)]*\))?\s*/g, '').trim();
            const colonIndex = param.indexOf(':');
            if (colonIndex === -1) {
                return null;
            }
            const name = param.slice(0, colonIndex).trim();
            const type = param.slice(colonIndex + 1).trim();
            if (!name || !type) {
                return null;
            }
            args.push({ name, type });
        }
    }

    return { args, returnType };
}

/**
 * Parse TSL Fn code to extract function arguments.
 * 
 * Validates:
 * - Code contains Fn wrapper
 * - Arguments are in array destructuring format
 * - Code contains a return statement
 * - No reserved keywords used as arguments
 * - Valid JavaScript syntax (via acorn)
 */
export function parseCodeNodeCode(code: string, language: CodeNodeLanguage = 'tsl'): ParsedCodeNode {
    if (language === 'wgsl') {
        const trimmed = code.trim();
        const signature = parseWgslSignature(trimmed);

        if (!signature) {
            return {
                arguments: [],
                isValid: false,
                error: 'WGSL code must include a function signature: fn name(args) -> returnType { ... }',
            };
        }

        const argTypes: Record<string, TSLType> = {};
        const args: string[] = [];

        for (const arg of signature.args) {
            if (!IDENTIFIER_REGEX.test(arg.name)) {
                return {
                    arguments: args,
                    isValid: false,
                    error: `Invalid argument name '${arg.name}'. Must be a valid JavaScript identifier.`,
                };
            }
            if (RESERVED_KEYWORDS.has(arg.name)) {
                return {
                    arguments: args,
                    isValid: false,
                    error: `Reserved keyword '${arg.name}' cannot be used as an argument name.`,
                };
            }
            args.push(arg.name);
            argTypes[arg.name] = mapWgslTypeToTsl(arg.type);
        }

        if (!stripWgslComments(trimmed).includes('return')) {
            return {
                arguments: args,
                isValid: false,
                error: 'WGSL code must contain a return statement.',
            };
        }

        return {
            arguments: args,
            isValid: true,
            argTypes,
            returnType: mapWgslTypeToTsl(signature.returnType),
        };
    }

    const trimmed = code.trim();

    // Check for Fn wrapper
    if (!trimmed.startsWith('Fn(')) {
        return {
            arguments: [],
            isValid: false,
            error: 'Code must start with Fn(. Expected format: Fn(([args]) => { ... })',
        };
    }

    // Syntax Check using Acorn
    try {
        acorn.parse(trimmed, { ecmaVersion: 2020 });
    } catch (e: unknown) {
        return {
            arguments: [],
            isValid: false,
            error: `Syntax Error: ${e instanceof Error ? e.message : String(e)}`,
        };
    }

    let args: string[] = [];

    // Check for empty arrow function: Fn(() =>
    if (/^Fn\s*\(\s*\(\s*\)\s*=>/.test(trimmed)) {
        // This is a valid 0-argument function
        args = [];
    } else {
        // Try to extract the argument array pattern
        // Match: Fn(([arg1, arg2, ...]) => or Fn(( [ arg1 , arg2 ] ) =>
        const argsMatch = trimmed.match(/^Fn\s*\(\s*\(\s*\[\s*([\w\s,]*)\s*\]\s*\)\s*=>/);

        if (!argsMatch) {
            return {
                arguments: [],
                isValid: false,
                error: 'Invalid argument format. Expected: Fn(([arg1, arg2]) => { ... }) or Fn(() => { ... })',
            };
        }

        // Parse arguments
        const argsString = argsMatch[1].trim();
        args = argsString
            ? argsString.split(',').map(arg => arg.trim()).filter(Boolean)
            : [];
    }

    // Validate arguments against reserved keywords
    for (const arg of args) {
        if (RESERVED_KEYWORDS.has(arg)) {
            return {
                arguments: args,
                isValid: false,
                error: `Reserved keyword '${arg}' cannot be used as an argument name.`,
            };
        }

        // Also check for valid identifier format technically (regex check above was loose)
        if (!IDENTIFIER_REGEX.test(arg)) {
            return {
                arguments: args,
                isValid: false,
                error: `Invalid argument name '${arg}'. Must be a valid JavaScript identifier.`,
            };
        }
    }

    // Check for return statement (simple check for now, acorn AST check would be better but this suffices for simple "contains return")
    // Note: Acorn validates syntax, so we know it's valid JS. We just want to ensure expectation of a return.
    if (!trimmed.includes('return ')) {
        return {
            arguments: args,
            isValid: false,
            error: 'Code must contain a return statement.',
        };
    }

    // Check for closing (Acorn handles this mostly, but ensure top level ends correctly)
    // Actually Acorn parsing `Fn(...)` ensures it matches braces.
    // The specific requirement "Code must end with ) or );" is a bit loose style check, let's keep it to be consistent with previous logic
    if (!trimmed.endsWith(')') && !trimmed.endsWith(');')) {
        return {
            arguments: args,
            isValid: false,
            error: 'Code must end with ) or );',
        };
    }

    return {
        arguments: args,
        isValid: true,
    };
}

/**
 * Generate a sanitized function name from a display name.
 */
export function generateFunctionName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^[0-9]/, '_$&')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}
