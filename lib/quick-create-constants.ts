import type { NodeType, TSLType, TSLValueType } from './types';

export interface QuickCreateConstantIntent {
    nodeType: NodeType;
    values: Record<string, TSLValueType>;
    label: string;
    outputHandleId: string;
    outputType: TSLType;
}

const CSS_COLOR_NAMES: Record<string, string> = {
    aliceblue: '#f0f8ff',
    antiquewhite: '#faebd7',
    aqua: '#00ffff',
    aquamarine: '#7fffd4',
    azure: '#f0ffff',
    beige: '#f5f5dc',
    bisque: '#ffe4c4',
    black: '#000000',
    blanchedalmond: '#ffebcd',
    blue: '#0000ff',
    blueviolet: '#8a2be2',
    brown: '#a52a2a',
    burlywood: '#deb887',
    cadetblue: '#5f9ea0',
    chartreuse: '#7fff00',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    cornflowerblue: '#6495ed',
    cornsilk: '#fff8dc',
    crimson: '#dc143c',
    cyan: '#00ffff',
    darkblue: '#00008b',
    darkcyan: '#008b8b',
    darkgoldenrod: '#b8860b',
    darkgray: '#a9a9a9',
    darkgreen: '#006400',
    darkgrey: '#a9a9a9',
    darkkhaki: '#bdb76b',
    darkmagenta: '#8b008b',
    darkolivegreen: '#556b2f',
    darkorange: '#ff8c00',
    darkorchid: '#9932cc',
    darkred: '#8b0000',
    darksalmon: '#e9967a',
    darkseagreen: '#8fbc8f',
    darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f',
    darkslategrey: '#2f4f4f',
    darkturquoise: '#00ced1',
    darkviolet: '#9400d3',
    deeppink: '#ff1493',
    deepskyblue: '#00bfff',
    dimgray: '#696969',
    dimgrey: '#696969',
    dodgerblue: '#1e90ff',
    firebrick: '#b22222',
    floralwhite: '#fffaf0',
    forestgreen: '#228b22',
    fuchsia: '#ff00ff',
    gainsboro: '#dcdcdc',
    ghostwhite: '#f8f8ff',
    gold: '#ffd700',
    goldenrod: '#daa520',
    gray: '#808080',
    green: '#008000',
    greenyellow: '#adff2f',
    grey: '#808080',
    honeydew: '#f0fff0',
    hotpink: '#ff69b4',
    indianred: '#cd5c5c',
    indigo: '#4b0082',
    ivory: '#fffff0',
    khaki: '#f0e68c',
    lavender: '#e6e6fa',
    lavenderblush: '#fff0f5',
    lawngreen: '#7cfc00',
    lemonchiffon: '#fffacd',
    lightblue: '#add8e6',
    lightcoral: '#f08080',
    lightcyan: '#e0ffff',
    lightgoldenrodyellow: '#fafad2',
    lightgray: '#d3d3d3',
    lightgreen: '#90ee90',
    lightgrey: '#d3d3d3',
    lightpink: '#ffb6c1',
    lightsalmon: '#ffa07a',
    lightseagreen: '#20b2aa',
    lightskyblue: '#87cefa',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#b0c4de',
    lightyellow: '#ffffe0',
    lime: '#00ff00',
    limegreen: '#32cd32',
    linen: '#faf0e6',
    magenta: '#ff00ff',
    maroon: '#800000',
    mediumaquamarine: '#66cdaa',
    mediumblue: '#0000cd',
    mediumorchid: '#ba55d3',
    mediumpurple: '#9370db',
    mediumseagreen: '#3cb371',
    mediumslateblue: '#7b68ee',
    mediumspringgreen: '#00fa9a',
    mediumturquoise: '#48d1cc',
    mediumvioletred: '#c71585',
    midnightblue: '#191970',
    mintcream: '#f5fffa',
    mistyrose: '#ffe4e1',
    moccasin: '#ffe4b5',
    navajowhite: '#ffdead',
    navy: '#000080',
    oldlace: '#fdf5e6',
    olive: '#808000',
    olivedrab: '#6b8e23',
    orange: '#ffa500',
    orangered: '#ff4500',
    orchid: '#da70d6',
    palegoldenrod: '#eee8aa',
    palegreen: '#98fb98',
    paleturquoise: '#afeeee',
    palevioletred: '#db7093',
    papayawhip: '#ffefd5',
    peachpuff: '#ffdab9',
    peru: '#cd853f',
    pink: '#ffc0cb',
    plum: '#dda0dd',
    powderblue: '#b0e0e6',
    purple: '#800080',
    rebeccapurple: '#663399',
    red: '#ff0000',
    rosybrown: '#bc8f8f',
    royalblue: '#4169e1',
    saddlebrown: '#8b4513',
    salmon: '#fa8072',
    sandybrown: '#f4a460',
    seagreen: '#2e8b57',
    seashell: '#fff5ee',
    sienna: '#a0522d',
    silver: '#c0c0c0',
    skyblue: '#87ceeb',
    slateblue: '#6a5acd',
    slategray: '#708090',
    slategrey: '#708090',
    snow: '#fffafa',
    springgreen: '#00ff7f',
    steelblue: '#4682b4',
    tan: '#d2b48c',
    teal: '#008080',
    thistle: '#d8bfd8',
    tomato: '#ff6347',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    wheat: '#f5deb3',
    white: '#ffffff',
    whitesmoke: '#f5f5f5',
    yellow: '#ffff00',
    yellowgreen: '#9acd32',
};

const NUMBER_LITERAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const INTEGER_LITERAL_RE = /^[+-]?\d+$/;
const VECTOR_COMPONENT_KEYS = ['x', 'y', 'z', 'w'] as const;

function parseNumberLiteral(value: string): number | null {
    const trimmed = value.trim();
    if (!NUMBER_LITERAL_RE.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerLiteral(value: string): number | null {
    const trimmed = value.trim();
    if (!INTEGER_LITERAL_RE.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function formatNumber(value: number): string {
    return Object.is(value, -0) ? '0' : String(value);
}

function createScalarIntent(type: 'float' | 'int', value: number): QuickCreateConstantIntent {
    const labelType = type === 'float' ? 'Float' : 'Int';
    return {
        nodeType: `const/${type}` as NodeType,
        values: { value },
        label: `Create ${labelType} ${formatNumber(value)}`,
        outputHandleId: 'out',
        outputType: type,
    };
}

function parseVectorLiteral(query: string): QuickCreateConstantIntent | null {
    const match = /^vec([2-4])\s*\((.*)\)$/i.exec(query);
    if (!match) return null;
    const size = Number(match[1]);

    const rawArgs = match[2].trim();
    const args = rawArgs.length === 0 ? [] : rawArgs.split(',').map((arg) => arg.trim());
    if (args.length > size) return null;

    const numbers: number[] = [];
    for (const arg of args) {
        const value = parseNumberLiteral(arg);
        if (value === null) return null;
        numbers.push(value);
    }

    const components = Array.from({ length: size }, (_, index) => {
        if (numbers.length === 0) return index === 3 ? 1 : 0;
        if (numbers.length === 1) return numbers[0];
        if (index < numbers.length) return numbers[index];
        return index === 3 ? 1 : 0;
    });

    const formatted = components.map(formatNumber).join(', ');
    const values = components.reduce<Record<string, TSLValueType>>((acc, value, index) => {
        acc[VECTOR_COMPONENT_KEYS[index]] = value;
        return acc;
    }, {});
    const vectorType = `vec${size}`;

    return {
        nodeType: `const/${vectorType}` as NodeType,
        values,
        label: `Create Vec${size} (${formatted})`,
        outputHandleId: 'out',
        outputType: vectorType as TSLType,
    };
}

function parseVectorCompletion(query: string): QuickCreateConstantIntent | null {
    const match = /^vec([2-4])\s*\((.*)$/i.exec(query);
    if (!match) return null;
    const size = Number(match[1]);
    const rawArgs = match[2].trim();

    if (rawArgs.includes(')')) return null;
    if (!rawArgs) return parseVectorLiteral(`vec${size}()`);

    const args = rawArgs.split(',').map((arg) => arg.trim());
    if (args.length > size) return null;
    if (args.some((arg) => arg.length === 0)) return null;

    const parsedArgs: string[] = [];
    for (const arg of args) {
        const value = parseNumberLiteral(arg);
        if (value === null) return null;
        parsedArgs.push(formatNumber(value));
    }

    return parseVectorLiteral(`vec${size}(${parsedArgs.join(', ')})`);
}

function parseColorLiteral(query: string): QuickCreateConstantIntent | null {
    const normalized = query.trim().toLowerCase();
    const hex = /^#[0-9a-f]{6}$/.test(normalized)
        ? normalized
        : CSS_COLOR_NAMES[normalized];

    if (!hex) return null;

    return {
        nodeType: 'const/color',
        values: { value: hex },
        label: normalized.startsWith('#')
            ? `Create Color ${hex}`
            : `Create Color ${normalized}`,
        outputHandleId: 'out',
        outputType: 'color',
    };
}

function colorComponentToHex(value: number): string {
    const clamped = Math.max(0, Math.min(1, value));
    return Math.round(clamped * 255).toString(16).padStart(2, '0');
}

function parseColorConstructor(query: string): QuickCreateConstantIntent | null {
    const match = /^color\s*\((.*)\)$/i.exec(query);
    if (!match) return null;

    const rawArgs = match[1].trim();
    if (!rawArgs) return null;
    const args = rawArgs.split(',').map((arg) => arg.trim());

    if (args.length === 1) {
        const literal = parseColorLiteral(args[0]);
        if (literal) return literal;

        const gray = parseNumberLiteral(args[0]);
        if (gray === null) return null;
        const component = colorComponentToHex(gray);
        const hex = `#${component}${component}${component}`;
        return {
            nodeType: 'const/color',
            values: { value: hex },
            label: `Create Color ${hex}`,
            outputHandleId: 'out',
            outputType: 'color',
        };
    }

    if (args.length !== 3) return null;

    const components: string[] = [];
    for (const arg of args) {
        const value = parseNumberLiteral(arg);
        if (value === null) return null;
        components.push(colorComponentToHex(value));
    }

    const hex = `#${components.join('')}`;
    return {
        nodeType: 'const/color',
        values: { value: hex },
        label: `Create Color ${hex}`,
        outputHandleId: 'out',
        outputType: 'color',
    };
}

function parseFloatLiteral(query: string): QuickCreateConstantIntent | null {
    const value = parseNumberLiteral(query);
    if (value === null) return null;

    return createScalarIntent('float', value);
}

function parseScalarConstructor(query: string): QuickCreateConstantIntent | null {
    const match = /^(float|int)\s*\((.*)\)$/i.exec(query);
    if (!match) return null;

    const type = match[1].toLowerCase() as 'float' | 'int';
    const rawArg = match[2].trim();
    const value = type === 'float'
        ? parseNumberLiteral(rawArg)
        : parseIntegerLiteral(rawArg);

    if (value === null) return null;
    return createScalarIntent(type, value);
}

function parseBareScalarLiterals(query: string): QuickCreateConstantIntent[] {
    const floatValue = parseNumberLiteral(query);
    if (floatValue === null) return [];

    const intents = [createScalarIntent('float', floatValue)];
    const intValue = parseIntegerLiteral(query);
    if (intValue !== null) {
        intents.push(createScalarIntent('int', intValue));
    }

    return intents;
}

export function parseQuickCreateConstant(query: string): QuickCreateConstantIntent | null {
    const trimmed = query.trim();
    if (!trimmed) return null;

    return parseVectorLiteral(trimmed)
        ?? parseScalarConstructor(trimmed)
        ?? parseColorConstructor(trimmed)
        ?? parseColorLiteral(trimmed)
        ?? parseFloatLiteral(trimmed);
}

export function getQuickCreateConstantSuggestion(query: string): QuickCreateConstantIntent | null {
    return getQuickCreateConstantSuggestions(query)[0] ?? null;
}

export function getQuickCreateConstantSuggestions(query: string): QuickCreateConstantIntent[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const exact = parseVectorLiteral(trimmed)
        ?? parseScalarConstructor(trimmed)
        ?? parseColorConstructor(trimmed)
        ?? parseColorLiteral(trimmed);
    if (exact) return [exact];

    const vectorCompletion = parseVectorCompletion(trimmed);
    if (vectorCompletion) return [vectorCompletion];

    return parseBareScalarLiterals(trimmed);
}
