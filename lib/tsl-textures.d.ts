// Minimal typings for the tsl-textures package (no types shipped upstream).
// Each texture takes a params object (merged with its defaults) and returns a
// TSL node; some expose member variants (fn.normal, fn.opacity).
declare module 'tsl-textures' {
    export interface TslTextureFn {
        (params?: Record<string, unknown>): unknown;
        defaults: Record<string, unknown>;
        normal?: (params?: Record<string, unknown>) => unknown;
        opacity?: (params?: Record<string, unknown>) => unknown;
        roughness?: (params?: Record<string, unknown>) => unknown;
    }

    export const marble: TslTextureFn;
    export const polkaDots: TslTextureFn;
    export const caustics: TslTextureFn;
    export const roughClay: TslTextureFn;
    export const clouds: TslTextureFn;
    export const brain: TslTextureFn;
    export const camouflage: TslTextureFn;
    export const caveArt: TslTextureFn;
    export const circleDecor: TslTextureFn;
    export const circles: TslTextureFn;
    export const concrete: TslTextureFn;
    export const cork: TslTextureFn;
    export const crumpledFabric: TslTextureFn;
    export const dalmatianSpots: TslTextureFn;
    export const darthMaul: TslTextureFn;
    export const dysonSphere: TslTextureFn;
    export const entangled: TslTextureFn;
    export const fordite: TslTextureFn;
    export const gasGiant: TslTextureFn;
    export const grid: TslTextureFn;
    export const halftone: TslTextureFn;
    export const isolayers: TslTextureFn;
    export const isolines: TslTextureFn;
    export const karstRock: TslTextureFn;
    export const neonLights: TslTextureFn;
    export const perlinNoise: TslTextureFn;
    export const photosphere: TslTextureFn;
    export const planet: TslTextureFn;
    export const processedWood: TslTextureFn;
    export const protozoa: TslTextureFn;
    export const reticularVeins: TslTextureFn;
    export const romanPaving: TslTextureFn;
    export const runnyEggs: TslTextureFn;
    export const rust: TslTextureFn;
    export const satin: TslTextureFn;
    export const scepterHead: TslTextureFn;
    export const scream: TslTextureFn;
    export const stars: TslTextureFn;
    export const staticNoise: TslTextureFn;
    export const tigerFur: TslTextureFn;
    export const turbulentSmoke: TslTextureFn;
    export const voronoiCells: TslTextureFn;
    export const waterDrops: TslTextureFn;
    export const watermelon: TslTextureFn;
    export const waves: TslTextureFn;
    export const wood: TslTextureFn;
    export const zebraLines: TslTextureFn;
    export const bricks: TslTextureFn;
}
