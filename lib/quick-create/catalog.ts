import { registry } from '../registry';
import type { NodeDef, NodeType, Port, TSLType } from '../types';

export interface QuickCreateFunctionEntry {
    /** Canonical TSL name, e.g. 'mix' */
    name: string;
    nodeType: NodeType;
    /** Visible input handles in positional-argument order */
    inputHandles: string[];
    inputPorts: Record<string, Port>;
    outputHandleId: string;
    outputType: TSLType;
}

export interface QuickCreateIdentifierEntry {
    name: string;
    nodeType: NodeType;
    outputHandleId: string;
    outputType: TSLType;
}

export interface QuickCreateBinaryOperatorInfo {
    nodeType: NodeType;
    leftHandleId: string;
    rightHandleId: string;
    precedence: number;
    rightAssociative?: boolean;
    /** 'promote' follows GLSL type promotion; 'bool' always yields bool */
    resultKind: 'promote' | 'bool';
    /** Whether scalar literal operands may be folded into node values */
    foldable: boolean;
}

/**
 * Binary operators are hardcoded (not registry-derived) so the parser works
 * deterministically even before initializeNodes() has run.
 */
export const QUICK_CREATE_BINARY_OPERATORS: Record<string, QuickCreateBinaryOperatorInfo> = {
    '||': { nodeType: 'logic/or', leftHandleId: 'a', rightHandleId: 'b', precedence: 2, resultKind: 'bool', foldable: false },
    '&&': { nodeType: 'logic/and', leftHandleId: 'a', rightHandleId: 'b', precedence: 3, resultKind: 'bool', foldable: false },
    '==': { nodeType: 'math/equals', leftHandleId: 'a', rightHandleId: 'b', precedence: 4, resultKind: 'bool', foldable: true },
    '<': { nodeType: 'logic/lessThan', leftHandleId: 'a', rightHandleId: 'b', precedence: 5, resultKind: 'bool', foldable: true },
    '>': { nodeType: 'logic/greaterThan', leftHandleId: 'a', rightHandleId: 'b', precedence: 5, resultKind: 'bool', foldable: true },
    '<=': { nodeType: 'logic/lessThanEqual', leftHandleId: 'a', rightHandleId: 'b', precedence: 5, resultKind: 'bool', foldable: true },
    '>=': { nodeType: 'logic/greaterThanEqual', leftHandleId: 'a', rightHandleId: 'b', precedence: 5, resultKind: 'bool', foldable: true },
    '+': { nodeType: 'math/add', leftHandleId: 'a', rightHandleId: 'b', precedence: 6, resultKind: 'promote', foldable: true },
    '-': { nodeType: 'math/sub', leftHandleId: 'a', rightHandleId: 'b', precedence: 6, resultKind: 'promote', foldable: true },
    '*': { nodeType: 'math/mul', leftHandleId: 'a', rightHandleId: 'b', precedence: 7, resultKind: 'promote', foldable: true },
    '/': { nodeType: 'math/div', leftHandleId: 'a', rightHandleId: 'b', precedence: 7, resultKind: 'promote', foldable: true },
    '%': { nodeType: 'math/mod', leftHandleId: 'x', rightHandleId: 'y', precedence: 7, resultKind: 'promote', foldable: true },
    '**': { nodeType: 'math/pow', leftHandleId: 'x', rightHandleId: 'y', precedence: 8, rightAssociative: true, resultKind: 'promote', foldable: true },
    '^': { nodeType: 'math/pow', leftHandleId: 'x', rightHandleId: 'y', precedence: 8, rightAssociative: true, resultKind: 'promote', foldable: true },
};

const FUNCTION_CATEGORY_ALLOWLIST = new Set(['Math', 'Logic', 'Noise', 'Easing', 'SDF', 'Utils']);
const IDENTIFIER_CATEGORY_ALLOWLIST = new Set(['Geometry', 'Math', 'Model', 'Advanced']);

// Constants nodes are callable so mixed-literal/expression constructors work,
// e.g. vec3(time, 0, 0) or float(time) as a cast.
const FUNCTION_TYPE_EXTRAS = new Set<string>([
    'const/float',
    'const/int',
    'const/vec2',
    'const/vec3',
    'const/vec4',
]);

const EXCLUDED_TYPES = new Set<string>([
    'math/multiOp', // dynamic operation list, not positionally callable
    'math/split', // reached through swizzle syntax instead
    'logic/discard', // side effect, needs graph context
    'advanced/output', // material output accessor, meaningless standalone
    'utils/comment',
]);

// Assign nodes mutate an existing connection target; they never make sense
// as freshly created expression graphs.
const EXCLUDED_TYPE_PREFIXES = ['assign/'];

const FUNCTION_ALIASES: Record<string, string> = {
    lerp: 'mix',
    frac: 'fract',
    atan2: 'atan',
};

interface QuickCreateCatalog {
    functions: Map<string, QuickCreateFunctionEntry>;
    identifiers: Map<string, QuickCreateIdentifierEntry>;
}

let cachedCatalog: QuickCreateCatalog | null = null;
let cachedRegistrySize = -1;

function getVisibleInputHandles(def: NodeDef): string[] {
    if (!def.inputs) return [];
    return Object.entries(def.inputs)
        .filter(([, port]) => !port.propertyOnly && !port.hidden)
        .map(([key]) => key);
}

function buildCatalog(): QuickCreateCatalog {
    const functions = new Map<string, QuickCreateFunctionEntry>();
    const identifiers = new Map<string, QuickCreateIdentifierEntry>();

    for (const def of registry.all()) {
        if (EXCLUDED_TYPES.has(def.type)) continue;
        if (EXCLUDED_TYPE_PREFIXES.some((prefix) => def.type.startsWith(prefix))) continue;

        const outPort = def.outputs?.out;
        if (!outPort) continue;

        const name = def.tsl;
        if (!name) continue;
        const key = name.toLowerCase();

        if (def.pure) {
            if (!IDENTIFIER_CATEGORY_ALLOWLIST.has(def.category)) continue;
            if (!identifiers.has(key)) {
                identifiers.set(key, {
                    name,
                    nodeType: def.type,
                    outputHandleId: 'out',
                    outputType: outPort.type,
                });
            }
            continue;
        }

        if (!FUNCTION_CATEGORY_ALLOWLIST.has(def.category) && !FUNCTION_TYPE_EXTRAS.has(def.type)) continue;

        const inputHandles = getVisibleInputHandles(def);
        if (inputHandles.length === 0) continue;

        if (!functions.has(key)) {
            functions.set(key, {
                name,
                nodeType: def.type,
                inputHandles,
                inputPorts: def.inputs ?? {},
                outputHandleId: 'out',
                outputType: outPort.type,
            });
        }
    }

    for (const [alias, target] of Object.entries(FUNCTION_ALIASES)) {
        const entry = functions.get(target.toLowerCase());
        if (entry && !functions.has(alias)) {
            functions.set(alias, entry);
        }
    }

    return { functions, identifiers };
}

export function getQuickCreateCatalog(): QuickCreateCatalog {
    const registrySize = registry.all().length;
    if (!cachedCatalog || cachedRegistrySize !== registrySize) {
        cachedCatalog = buildCatalog();
        cachedRegistrySize = registrySize;
    }
    return cachedCatalog;
}

export function getQuickCreateFunctionEntry(name: string): QuickCreateFunctionEntry | null {
    return getQuickCreateCatalog().functions.get(name.toLowerCase()) ?? null;
}

export function getQuickCreateIdentifierEntry(name: string): QuickCreateIdentifierEntry | null {
    return getQuickCreateCatalog().identifiers.get(name.toLowerCase()) ?? null;
}
