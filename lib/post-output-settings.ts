import type { Node } from '@xyflow/react';
import type { TSLNodeData } from './types';

export const POST_TONE_MAPPING_OPTIONS = [
    'NoToneMapping',
    'LinearToneMapping',
    'ReinhardToneMapping',
    'CineonToneMapping',
    'ACESFilmicToneMapping',
] as const;

export const POST_OUTPUT_COLOR_SPACE_OPTIONS = [
    'SRGBColorSpace',
    'LinearSRGBColorSpace',
] as const;

export const POST_OUTPUT_COLOR_CONTROL_INPUTS = [
    'toneMapping',
    'exposure',
    'outputColorSpace',
] as const;

export type PostToneMapping = typeof POST_TONE_MAPPING_OPTIONS[number];
export type PostOutputColorSpace = typeof POST_OUTPUT_COLOR_SPACE_OPTIONS[number];

export interface PostOutputSettings {
    toneMapping: PostToneMapping;
    exposure: number;
    outputColorSpace: PostOutputColorSpace;
}

export type PostOutputColorControl = typeof POST_OUTPUT_COLOR_CONTROL_INPUTS[number];

export type PostOutputActiveControls = Record<PostOutputColorControl, boolean>;

export const DEFAULT_POST_OUTPUT_SETTINGS: PostOutputSettings = {
    toneMapping: 'NoToneMapping',
    exposure: 1,
    outputColorSpace: 'SRGBColorSpace',
};

export const DEFAULT_POST_OUTPUT_ACTIVE_CONTROLS: PostOutputActiveControls = {
    toneMapping: false,
    exposure: false,
    outputColorSpace: false,
};

const isPostToneMapping = (value: unknown): value is PostToneMapping =>
    typeof value === 'string' && (POST_TONE_MAPPING_OPTIONS as readonly string[]).includes(value);

const isPostOutputColorSpace = (value: unknown): value is PostOutputColorSpace =>
    typeof value === 'string' && (POST_OUTPUT_COLOR_SPACE_OPTIONS as readonly string[]).includes(value);

export function normalizePostOutputSettings(
    values?: Record<string, unknown>,
    activeInputs?: readonly string[]
): PostOutputSettings {
    const active = new Set(activeInputs ?? []);
    const exposureActive = active.has('exposure');
    const toneMappingValue = active.has('toneMapping') ? values?.toneMapping : undefined;
    const exposureValue = active.has('exposure') ? values?.exposure : undefined;
    const outputColorSpaceValue = active.has('outputColorSpace') ? values?.outputColorSpace : undefined;
    const exposure = Number(exposureValue ?? DEFAULT_POST_OUTPUT_SETTINGS.exposure);

    return {
        toneMapping: isPostToneMapping(toneMappingValue)
            ? toneMappingValue
            : exposureActive
                ? 'LinearToneMapping'
            : DEFAULT_POST_OUTPUT_SETTINGS.toneMapping,
        exposure: Number.isFinite(exposure) ? exposure : DEFAULT_POST_OUTPUT_SETTINGS.exposure,
        outputColorSpace: isPostOutputColorSpace(outputColorSpaceValue)
            ? outputColorSpaceValue
            : DEFAULT_POST_OUTPUT_SETTINGS.outputColorSpace,
    };
}

export function getPostOutputSettings(nodes: Node<TSLNodeData>[]): PostOutputSettings {
    const outputNode = nodes.find((node) => node.id === 'post-output' || node.data.type === 'post/output');
    return normalizePostOutputSettings(outputNode?.data.values, outputNode?.data.activeInputs);
}

export function getPostOutputActiveControls(nodes: Node<TSLNodeData>[]): PostOutputActiveControls {
    const outputNode = nodes.find((node) => node.id === 'post-output' || node.data.type === 'post/output');
    const active = new Set(outputNode?.data.activeInputs ?? []);

    return {
        toneMapping: active.has('toneMapping'),
        exposure: active.has('exposure'),
        outputColorSpace: active.has('outputColorSpace'),
    };
}
