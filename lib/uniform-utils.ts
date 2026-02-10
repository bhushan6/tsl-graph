import type { AppNode, TSLType, TSLValueType } from '@/lib/types';

export type UniformKind = 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'color';

export const UNIFORM_KINDS: UniformKind[] = [
    'float',
    'int',
    'bool',
    'vec2',
    'vec3',
    'vec4',
    'color',
];

export function getUniformKindFromNode(node: Pick<AppNode, 'data'>): UniformKind {
    const raw = node.data?.values?.uniformType;
    return UNIFORM_KINDS.includes(raw as UniformKind) ? (raw as UniformKind) : 'float';
}

export function getUniformOutputs(kind: UniformKind): Record<string, { label: string; type: TSLType }> {
    switch (kind) {
        case 'vec2':
            return {
                x: { label: 'X', type: 'float' },
                y: { label: 'Y', type: 'float' },
                out: { label: 'XY', type: 'vec2' },
            };
        case 'vec3':
            return {
                x: { label: 'X', type: 'float' },
                y: { label: 'Y', type: 'float' },
                z: { label: 'Z', type: 'float' },
                out: { label: 'XYZ', type: 'vec3' },
            };
        case 'vec4':
            return {
                x: { label: 'X', type: 'float' },
                y: { label: 'Y', type: 'float' },
                z: { label: 'Z', type: 'float' },
                w: { label: 'W', type: 'float' },
                out: { label: 'XYZW', type: 'vec4' },
            };
        case 'color':
            return {
                r: { label: 'R', type: 'float' },
                g: { label: 'G', type: 'float' },
                b: { label: 'B', type: 'float' },
                out: { label: 'RGB', type: 'color' },
            };
        case 'bool':
            return {
                out: { label: 'Out', type: 'bool' },
            };
        case 'int':
            return {
                out: { label: 'Out', type: 'int' },
            };
        case 'float':
        default:
            return {
                out: { label: 'Out', type: 'float' },
            };
    }
}

function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255,
        ];
    }
    return [1, 1, 1];
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        const hex = Math.round(clamped * 255).toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeComponents(value: TSLValueType): number[] {
    if (typeof value === 'boolean') return [value ? 1 : 0];
    if (typeof value === 'string') {
        if (value.startsWith('#')) return hexToRgb(value);
        const parsed = parseFloat(value);
        return [Number.isFinite(parsed) ? parsed : 0];
    }
    if (Array.isArray(value)) return value.map((v) => Number(v) || 0);
    return [Number(value) || 0];
}

export function getUniformDefaultValue(kind: UniformKind): TSLValueType {
    switch (kind) {
        case 'color':
            return '#ffffff';
        case 'bool':
            return false;
        case 'vec2':
            return [0, 0];
        case 'vec3':
            return [0, 0, 0];
        case 'vec4':
            return [0, 0, 0, 1];
        case 'int':
        case 'float':
        default:
            return 0;
    }
}

export function coerceUniformValue(kind: UniformKind, prevValue: TSLValueType | undefined): TSLValueType {
    if (prevValue === undefined || prevValue === null) {
        return getUniformDefaultValue(kind);
    }

    const components = normalizeComponents(prevValue);

    switch (kind) {
        case 'float':
            return components[0] ?? 0;
        case 'int':
            return Math.round(components[0] ?? 0);
        case 'bool':
            return components.some((v) => v !== 0);
        case 'vec2': {
            const [x = 0, y = 0] = components;
            return [x, y];
        }
        case 'vec3': {
            const [x = 0, y = 0, z = 0] = components;
            return [x, y, z];
        }
        case 'vec4': {
            const [x = 0, y = 0, z = 0, w] = components;
            return [x, y, z, w ?? 1];
        }
        case 'color': {
            if (typeof prevValue === 'string' && prevValue.startsWith('#')) {
                return prevValue;
            }
            const [r = 1, g = 1, b = 1] = components;
            return rgbToHex(r, g, b);
        }
        default:
            return prevValue;
    }
}

export function formatUniformValueExpression(kind: UniformKind, rawValue: TSLValueType | undefined): string {
    const value = coerceUniformValue(kind, rawValue);

    switch (kind) {
        case 'float':
            return String(Number(value ?? 0));
        case 'int':
            return String(Math.round(Number(value ?? 0)));
        case 'bool':
            return value ? 'true' : 'false';
        case 'vec2': {
            const [x = 0, y = 0] = Array.isArray(value) ? value : [Number(value ?? 0), 0];
            return `new THREE.Vector2(${Number(x)}, ${Number(y)})`;
        }
        case 'vec3': {
            const [x = 0, y = 0, z = 0] = Array.isArray(value) ? value : [Number(value ?? 0), 0, 0];
            return `new THREE.Vector3(${Number(x)}, ${Number(y)}, ${Number(z)})`;
        }
        case 'vec4': {
            const [x = 0, y = 0, z = 0, w = 1] = Array.isArray(value) ? value : [Number(value ?? 0), 0, 0, 1];
            return `new THREE.Vector4(${Number(x)}, ${Number(y)}, ${Number(z)}, ${Number(w)})`;
        }
        case 'color': {
            const hex = typeof value === 'string' ? value : '#ffffff';
            return `new THREE.Color("${hex}")`;
        }
        default:
            return String(value ?? 0);
    }
}
