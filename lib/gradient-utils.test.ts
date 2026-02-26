import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GRADIENT_STOPS,
    MAX_GRADIENT_STOPS,
    MIN_GRADIENT_STOPS,
    generateGradientString,
    normalizeGradientStops,
    normalizeHexColor,
} from './gradient-utils';

describe('gradient-utils', () => {
    it('returns default stops when input is invalid', () => {
        const stops = normalizeGradientStops(undefined);
        expect(stops).toEqual(DEFAULT_GRADIENT_STOPS);
    });

    it('clamps and sorts stops', () => {
        const stops = normalizeGradientStops([
            { color: '#00ff00', pos: 1.2 },
            { color: '#ff0000', pos: -0.5 },
            { color: '#0000ff', pos: 0.5 },
        ]);

        expect(stops.map((stop) => ({ color: stop.color, pos: stop.pos }))).toEqual([
            { color: '#ff0000', pos: 0 },
            { color: '#0000ff', pos: 0.5 },
            { color: '#00ff00', pos: 1 },
        ]);
        expect(stops.every((stop) => typeof stop.id === 'string' && stop.id.length > 0)).toBe(true);
    });

    it('enforces min and max stop bounds', () => {
        const onlyOne = normalizeGradientStops([{ color: '#abcdef', pos: 0.4 }]);
        expect(onlyOne.length).toBe(MIN_GRADIENT_STOPS);

        const tooManyRaw = Array.from({ length: MAX_GRADIENT_STOPS + 5 }, (_, index) => ({
            color: '#123456',
            pos: index / 10,
        }));
        const capped = normalizeGradientStops(tooManyRaw);
        expect(capped.length).toBe(MAX_GRADIENT_STOPS);
    });

    it('normalizes shorthand hex values', () => {
        expect(normalizeHexColor('#0af')).toBe('#00aaff');
        expect(normalizeHexColor('#00AAFF')).toBe('#00aaff');
    });

    it('matches TSL flat mode transition points in preview gradient', () => {
        const css = generateGradientString(
            'linear',
            90,
            [
                { color: '#7f3fb4', pos: 0.22 },
                { color: '#fcb045', pos: 0.83 },
            ],
            1
        );

        // Flat mode in TSL flips near the previous stop (prev + range * 0.01), not at curr stop.
        expect(css).toContain('#7f3fb4 22.61%');
        expect(css).toContain('#fcb045 22.61%');
        expect(css).not.toContain('#7f3fb4 83%');
    });
});
