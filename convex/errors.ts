// Error codes and messages for Convex mutations
// These can be used for i18n, logging, and client-side error handling

export const ErrorCodes = {
    // Authentication errors (1xx)
    NOT_AUTHENTICATED: 100,
    NOT_AUTHORIZED: 101,

    // Resource errors (2xx)
    NOT_FOUND: 200,
    ALREADY_EXISTS: 201,

    // Validation errors (3xx)
    INVALID_INPUT: 300,
    NAME_REQUIRED: 301,
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// Error messages mapped by code
export const ErrorMessages: Record<ErrorCode, string> = {
    [ErrorCodes.NOT_AUTHENTICATED]: "Not authenticated",
    [ErrorCodes.NOT_AUTHORIZED]: "Not authorized to perform this action",
    [ErrorCodes.NOT_FOUND]: "Resource not found",
    [ErrorCodes.ALREADY_EXISTS]: "Resource already exists",
    [ErrorCodes.INVALID_INPUT]: "Invalid input",
    [ErrorCodes.NAME_REQUIRED]: "Name is required",
};

// Helper to create error data object
export function createErrorData(code: ErrorCode, customMessage?: string) {
    return {
        code,
        message: customMessage || ErrorMessages[code],
    };
}

// Template-specific error messages
export const TemplateErrors = {
    subgraphNameExists: (name: string) => createErrorData(
        ErrorCodes.ALREADY_EXISTS,
        `A subgraph template named "${name}" already exists`
    ),
    codeNodeNameExists: (name: string) => createErrorData(
        ErrorCodes.ALREADY_EXISTS,
        `A code node template named "${name}" already exists`
    ),
    templateNotFound: () => createErrorData(ErrorCodes.NOT_FOUND, "Template not found"),
    notAuthenticated: () => createErrorData(ErrorCodes.NOT_AUTHENTICATED),
    notAuthorized: () => createErrorData(ErrorCodes.NOT_AUTHORIZED),
};
