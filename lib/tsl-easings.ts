/**
 * Credits / Attribution
 *
 * This file is a local runtime-compatible mirror of easing functions from:
 * https://github.com/akella/tsl-easings
 *
 * Original package: `tsl-easings`
 * Author: Yuri Artiukh (akella)
 * Equations: Robert Penner easing functions
 * License: MIT (see node_modules/tsl-easings/LICENSE.md)
 *
 * Why this exists:
 * We still generate graph imports from `tsl-easings`, but keep these local
 * implementations for editor/runtime evaluation compatibility.
 */
import { Fn, cos, float, mix, pow, select, sin, sqrt, step } from 'three/tsl';

const powUnchecked = pow as unknown as (...values: unknown[]) => never;

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeLinear = Fn(([t]) => {
    return t;
});

// @ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInQuad = Fn(([t]) => {
    return t.mul(t);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutQuad = Fn(([t]) => {
    return t.mul(float(2).sub(t));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutQuad = Fn(([t]) => {
    const a = pow(t, 2).mul(2);
    const b = pow(t, 2).mul(-2).add(t.mul(4)).sub(1);
    return mix(a, b, step(0.5, t));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInCubic = Fn(([t]) => {
    return pow(t, 3);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutCubic = Fn(([t]) => {
    return pow(t.sub(1), 3).add(1);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutCubic = Fn(([t]) => {
    const a = float(4).mul(pow(t, 3));
    const b = float(0.5).mul(pow(t.mul(2).sub(2), 3)).add(1);
    return mix(a, b, step(0.5, t));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInQuart = Fn(([t]) => {
    return pow(t, 4);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutQuart = Fn(([t]) => {
    return pow(t.sub(1), 3).mul(t.oneMinus()).add(1);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutQuart = Fn(([t]) => {
    const a = float(8).mul(pow(t, 4));
    const b = float(-8).mul(pow(t.sub(1), 4)).add(1);
    return mix(a, b, step(0.5, t));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInQuint = Fn(([t]) => {
    return pow(t, 5);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutQuint = Fn(([t]) => {
    return pow(t.oneMinus(), 5).oneMinus();
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutQuint = Fn(([t]) => {
    const a = pow(t, 5).mul(16);
    const b = pow(t.mul(-2).add(2), 5).mul(0.5).oneMinus();
    return mix(a, b, step(0.5, t));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInSine = Fn(([t]) => {
    return sin(t.sub(1).mul(Math.PI * 0.5)).add(1);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutSine = Fn(([t]) => {
    return sin(t.mul(Math.PI * 0.5));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutSine = Fn(([t]) => {
    return cos(t.mul(Math.PI)).sub(1).mul(-0.5);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInExpo = Fn(([t]) => {
    return select(t.equal(0), 0, pow(2, t.mul(10).sub(10)));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutExpo = Fn(([t]) => {
    return select(t.equal(1), 1, pow(2, t.mul(-10)).add(1));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutExpo = Fn(([t]) => {
    const a = pow(2, t.mul(20).sub(10)).mul(0.5);
    const b = pow(2, t.mul(-20).add(10)).mul(-0.5).add(1);
    const out = mix(b, a, step(t, 0.5));
    out.assign(select(t.equal(0), 0, out));
    out.assign(select(t.equal(1), 1, out));
    return out;
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInCircular = Fn(([t]) => {
    return sqrt(t.mul(t).oneMinus()).oneMinus();
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutCircular = Fn(([t]) => {
    return sqrt(t.mul(float(2).sub(t)));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutCircular = Fn(([t]) => {
    const a = sqrt(float(1).sub(powUnchecked(float(2).mul(t), 2))).oneMinus().mul(0.5);
    const b = sqrt(float(1).sub(powUnchecked(float(-2).mul(t).add(2), 2))).add(1).mul(0.5);
    return select(t.lessThan(0.5), a, b);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInBack = Fn(([t]) => {
    const c1 = float(1.70158);
    const c3 = c1.add(1);
    return c3.mul(t).mul(t).mul(t).sub(c1.mul(t).mul(t));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutBack = Fn(([t]) => {
    const c1 = float(1.70158);
    const c3 = c1.add(1);
    return c1.mul(pow(t.sub(1), 2)).add(1).add(c3.mul(pow(t.sub(1), 3)));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutBack = Fn(([t]) => {
    const c1 = float(1.70158);
    const c2 = c1.mul(1.525);

    const a = pow(t.mul(2), 2).mul(c2.add(1).mul(t).mul(2).sub(c2)).div(2);
    const b = pow(t.mul(2).sub(2), 2).mul(c2.add(1).mul(t.mul(2).sub(2)).add(c2)).add(2).div(2);

    return select(t.lessThan(0.5), a, b);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInElastic = Fn(([t]) => {
    const c4 = float((2 * Math.PI) / 3);
    return sin(t.mul(10).sub(10.75).mul(c4)).mul(pow(2, t.mul(10).sub(10))).mul(-1);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutElastic = Fn(([t]) => {
    return sin(t.add(1).mul((-13 * Math.PI) / 2)).mul(pow(2, t.mul(-10))).add(1);
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutElastic = Fn(([t]) => {
    const c5 = float((2 * Math.PI) / 4.5);
    const a = pow(2, t.mul(20).sub(10)).mul(sin(t.mul(20).sub(11.125).mul(c5))).div(2);
    const b = pow(2, t.mul(-20).add(10)).mul(sin(t.mul(20).sub(11.125).mul(c5))).div(2).add(1);
    const out = mix(b, a, step(t, 0.5));

    out.assign(select(t.equal(0), 0, out));
    out.assign(select(t.equal(1), 1, out));
    return out;
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeOutBounce = Fn(([t]) => {
    const n1 = float(7.5625);
    const d1 = float(2.75);

    const a = t.mul(t).mul(n1);
    const b = n1.mul(pow(t.sub(float(1.5).div(d1)), 2)).add(0.75);
    const c = n1.mul(pow(t.sub(float(2.25).div(d1)), 2)).add(0.9375);
    const d = n1.mul(pow(t.sub(float(2.625).div(d1)), 2)).add(0.984375);

    const out = d;
    out.assign(mix(out, c, step(t, float(2.5).div(d1))));
    out.assign(mix(out, b, step(t, float(2).div(d1))));
    out.assign(mix(out, a, step(t, float(1).div(d1))));

    return out;
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInBounce = Fn(([t]) => {
    // @ts-expect-error: TSL Fn call signatures are not typed with runtime parameters
    return float(1).sub(easeOutBounce(t.oneMinus()));
});

//@ts-expect-error: TSL node signatures are more permissive than available TS types
export const easeInOutBounce = Fn(([t]) => {
    // @ts-expect-error: TSL Fn call signatures are not typed with runtime parameters
    const a = easeOutBounce(t.mul(-2).add(1)).oneMinus().div(2);
    // @ts-expect-error: TSL Fn call signatures are not typed with runtime parameters
    const b = easeOutBounce(t.mul(2).sub(1)).add(1).div(2);
    return select(t.lessThan(0.5), a, b);
});
