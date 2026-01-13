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

/**
 * Parse TSL Fn code to extract function arguments.
 * 
 * Validates:
 * - Code contains Fn wrapper
 * - Arguments are in array destructuring format
 * - Code contains a return statement
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

    // Try to extract the argument array pattern
    // Match: Fn(([arg1, arg2, ...]) => or Fn(( [ arg1 , arg2 ] ) =>
    const argsMatch = trimmed.match(/Fn\s*\(\s*\(\s*\[\s*([\w\s,]*)\s*\]\s*\)\s*=>/);

    if (!argsMatch) {
        return {
            arguments: [],
            isValid: false,
            error: 'Invalid argument format. Expected: Fn(([arg1, arg2]) => { ... })',
        };
    }

    // Parse arguments
    const argsString = argsMatch[1].trim();
    const args = argsString
        ? argsString.split(',').map(arg => arg.trim()).filter(Boolean)
        : [];

    // Check for return statement
    if (!trimmed.includes('return ')) {
        return {
            arguments: args,
            isValid: false,
            error: 'Code must contain a return statement.',
        };
    }

    // Check for closing
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
