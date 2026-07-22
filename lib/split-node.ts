import type { TSLType } from './types';

const SPLIT_COMPONENT_HANDLES = ['x', 'y', 'z', 'w'] as const;

export function getSplitComponentCount(inputType: TSLType | null | undefined): number {
    if (inputType === 'float' || inputType === 'int' || inputType === 'uint' || inputType === 'bool') {
        return 1;
    }

    if (inputType === 'color') return 3;

    const vectorMatch = /^[biu]?vec([2-4])$/.exec(inputType ?? '');
    return vectorMatch ? Number(vectorMatch[1]) : 4;
}

export function getVisibleSplitOutputKeys(
    outputKeys: readonly string[],
    inputType: TSLType | null | undefined,
): string[] {
    const componentCount = getSplitComponentCount(inputType);

    return outputKeys.filter((key) => {
        if (componentCount === 1 && key === 'out') return false;

        const componentIndex = SPLIT_COMPONENT_HANDLES.indexOf(
            key as (typeof SPLIT_COMPONENT_HANDLES)[number],
        );
        return componentIndex === -1 || componentIndex < componentCount;
    });
}
