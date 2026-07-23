import type { Port, TSLType } from './types';

const VECTOR_COMPONENT_HANDLES = ['x', 'y', 'z', 'w'] as const;
const COLOR_COMPONENT_HANDLES = ['r', 'g', 'b'] as const;

const SWIZZLE_COMPONENT_INDEX: Record<string, number> = {
    x: 0,
    y: 1,
    z: 2,
    w: 3,
    r: 0,
    g: 1,
    b: 2,
    a: 3,
};

interface ComponentOutputShape {
    handles: readonly string[];
    componentType: TSLType;
}

function getComponentOutputShape(outputType: TSLType): ComponentOutputShape | null {
    if (outputType === 'color') {
        return {
            handles: COLOR_COMPONENT_HANDLES,
            componentType: 'float',
        };
    }

    const vectorMatch = /^(b|i|u)?vec([2-4])$/.exec(outputType);
    if (!vectorMatch) return null;

    const componentType: TSLType = vectorMatch[1] === 'b'
        ? 'bool'
        : vectorMatch[1] === 'i'
            ? 'int'
            : vectorMatch[1] === 'u'
                ? 'uint'
                : 'float';

    return {
        handles: VECTOR_COMPONENT_HANDLES.slice(0, Number(vectorMatch[2])),
        componentType,
    };
}

export function getComponentOutputPorts(outputType: TSLType): Record<string, Port> {
    const shape = getComponentOutputShape(outputType);
    if (!shape) return {};

    return Object.fromEntries(
        shape.handles.map((handle) => [
            handle,
            {
                label: handle.toUpperCase(),
                type: shape.componentType,
            },
        ]),
    );
}

export function getComponentOutputType(
    outputType: TSLType,
    handleId: string | null | undefined,
): TSLType | null {
    if (!handleId) return null;

    const shape = getComponentOutputShape(outputType);
    return shape?.handles.includes(handleId) ? shape.componentType : null;
}

export function getComponentOutputHandle(
    outputType: TSLType,
    swizzleCharacter: string,
): string | null {
    const shape = getComponentOutputShape(outputType);
    const componentIndex = SWIZZLE_COMPONENT_INDEX[swizzleCharacter];
    if (!shape || componentIndex === undefined) return null;

    return shape.handles[componentIndex] ?? null;
}
