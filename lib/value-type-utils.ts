import type { TSLType, TSLValueType } from './types';

export type AnyInputType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'color' | 'bool';

export function inferValueInputType(value: TSLValueType): AnyInputType {
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'string' && value.startsWith('#')) return 'color';
    if (Array.isArray(value)) {
        if (value.length === 2) return 'vec2';
        if (value.length === 3) return 'vec3';
        if (value.length === 4) return 'vec4';
        return 'vec3';
    }
    return 'float';
}

export function inferLiteralTSLType(value: TSLValueType): Extract<TSLType, AnyInputType> {
    return inferValueInputType(value);
}
