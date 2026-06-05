import { describe, expect, it } from 'vitest';
import { getPostOutputActiveControls, getPostOutputSettings, normalizePostOutputSettings } from './post-output-settings';
import type { Node } from '@xyflow/react';
import type { TSLNodeData } from './types';

describe('post output settings', () => {
    it('uses defaults when controls are inactive', () => {
        expect(normalizePostOutputSettings({
            toneMapping: 'ACESFilmicToneMapping',
            exposure: 2,
            outputColorSpace: 'LinearSRGBColorSpace',
        })).toEqual({
            toneMapping: 'NoToneMapping',
            exposure: 1,
            outputColorSpace: 'SRGBColorSpace',
        });
    });

    it('uses only active post output controls', () => {
        expect(normalizePostOutputSettings({
            toneMapping: 'ACESFilmicToneMapping',
            exposure: 2,
            outputColorSpace: 'LinearSRGBColorSpace',
        }, ['toneMapping', 'exposure'])).toEqual({
            toneMapping: 'ACESFilmicToneMapping',
            exposure: 2,
            outputColorSpace: 'SRGBColorSpace',
        });
    });

    it('uses linear tone mapping when exposure is active by itself', () => {
        expect(normalizePostOutputSettings({
            exposure: 10,
        }, ['exposure'])).toEqual({
            toneMapping: 'LinearToneMapping',
            exposure: 10,
            outputColorSpace: 'SRGBColorSpace',
        });
    });

    it('reads active settings from post output node', () => {
        const nodes = [{
            id: 'post-output',
            type: 'post/output',
            position: { x: 0, y: 0 },
            data: {
                type: 'post/output',
                values: {
                    toneMapping: 'ReinhardToneMapping',
                    exposure: 1.5,
                    outputColorSpace: 'LinearSRGBColorSpace',
                },
                connected: {},
                activeInputs: ['toneMapping', 'outputColorSpace'],
            },
        }] as Node<TSLNodeData>[];

        expect(getPostOutputSettings(nodes)).toEqual({
            toneMapping: 'ReinhardToneMapping',
            exposure: 1,
            outputColorSpace: 'LinearSRGBColorSpace',
        });
        expect(getPostOutputActiveControls(nodes)).toEqual({
            toneMapping: true,
            exposure: false,
            outputColorSpace: true,
        });
    });
});
