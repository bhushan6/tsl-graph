import * as acorn from 'acorn';

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
}

const RESERVED_KEYWORDS = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
    'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
    'typeof', 'var', 'void', 'while', 'with', 'yield',
    'let', 'static', 'enum', 'await', 'implements', 'interface', 'package', 'private', 'protected', 'public'
]);

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
export function parseCodeNodeCode(code: string): ParsedCodeNode {
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
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(arg)) {
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
