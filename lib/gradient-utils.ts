import type { GradientStopValue } from './nodes/definitions';

export interface GradientStopWithId extends GradientStopValue {
    id: string;
}

export const MIN_GRADIENT_STOPS = 2;
export const MAX_GRADIENT_STOPS = 8;
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_GRADIENT_STOPS: GradientStopValue[] = [
    { id: 'stop_0', color: '#2A7B9B', pos: 0.0 },
    { id: 'stop_1', color: '#57C785', pos: 0.5 },
    { id: 'stop_2', color: '#EDDD53', pos: 1.0 },
];

export function generateGradientStopId(): string {
    return `stop_${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

export function normalizeHexColor(value: unknown, fallback = '#ffffff'): string {
    if (typeof value !== 'string') return fallback;
    const input = value.trim();
    if (!HEX_COLOR_RE.test(input)) return fallback;
    if (input.length === 4) {
        const r = input[1];
        const g = input[2];
        const b = input[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return input.toLowerCase();
}

export function isGradientStopArray(value: unknown): value is GradientStopValue[] {
    return Array.isArray(value) && value.every((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const maybe = entry as Record<string, unknown>;
        return typeof maybe.color === 'string' && typeof maybe.pos === 'number';
    });
}

export function normalizeGradientStops(raw: unknown): GradientStopValue[] {
    const source = Array.isArray(raw) ? raw : [];
    const normalized = source
        .map((entry, index): GradientStopValue | null => {
            if (!entry || typeof entry !== 'object') return null;
            const stop = entry as Record<string, unknown>;
            const pos = Number(stop.pos);
            if (!Number.isFinite(pos)) return null;
            return {
                id: typeof stop.id === 'string' && stop.id.trim().length > 0
                    ? stop.id
                    : `stop_${index}`,
                color: normalizeHexColor(stop.color, '#ffffff'),
                pos: clamp01(pos),
            } satisfies GradientStopValue;
        })
        .filter((entry): entry is GradientStopValue => entry !== null);

    if (normalized.length === 0) {
        return DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop }));
    }

    const limited = normalized.slice(0, MAX_GRADIENT_STOPS);

    while (limited.length < MIN_GRADIENT_STOPS) {
        const fallback = DEFAULT_GRADIENT_STOPS[limited.length] ?? DEFAULT_GRADIENT_STOPS[DEFAULT_GRADIENT_STOPS.length - 1];
        limited.push({ ...fallback });
    }

    limited.sort((a, b) => a.pos - b.pos);

    return limited;
}

export function ensureGradientStopIds(stops: GradientStopValue[]): GradientStopWithId[] {
    return stops.map((stop, index) => ({
        ...stop,
        id: typeof stop.id === 'string' && stop.id.trim().length > 0
            ? stop.id
            : `stop_${index}`,
    }));
}

function formatPercent(value: number): string {
    return `${Number((clamp01(value) * 100).toFixed(3))}%`;
}

export function generateGradientString(
    type: 'linear' | 'radial',
    angle: number,
    stops: Array<Pick<GradientStopValue, 'color' | 'pos'>>,
    mode: number = 0
): string {
    const normalized = normalizeGradientStops(stops);
    const isFlat = Number(mode) === 1;

    const stopsString = isFlat
        ? (() => {
            if (normalized.length === 0) return '#ffffff 0%, #ffffff 100%';
            const hardStops: string[] = [`${normalized[0].color} 0%`];
            for (let i = 1; i < normalized.length; i++) {
                const prev = normalized[i - 1];
                const curr = normalized[i];
                const range = Math.max(0.00001, curr.pos - prev.pos);
                const transitionPos = prev.pos + (range * 0.01);
                const boundary = formatPercent(transitionPos);
                hardStops.push(`${prev.color} ${boundary}`);
                hardStops.push(`${curr.color} ${boundary}`);
            }
            hardStops.push(`${normalized[normalized.length - 1].color} 100%`);
            return hardStops.join(', ');
        })()
        : normalized
            .map((stop) => `${stop.color} ${(stop.pos * 100).toFixed(0)}%`)
            .join(', ');

    if (type === 'radial') {
        return `radial-gradient(circle at center, ${stopsString})`;
    }

    return `linear-gradient(${angle}deg, ${stopsString})`;
}
