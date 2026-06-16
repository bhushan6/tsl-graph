import { Fn, float, vec2, vec3, vec4, mat4, mat2, normalize, sin, cos, pow, dot, mix, step, clamp, length, max, min, color, atan, PI } from 'three/tsl';

type TSLLooseNode = {
    x: TSLLooseNode;
    y: TSLLooseNode;
    z: TSLLooseNode;
    mul: (...values: unknown[]) => TSLLooseNode;
    add: (...values: unknown[]) => TSLLooseNode;
    sub: (...values: unknown[]) => TSLLooseNode;
};

const mat4Unchecked = mat4 as unknown as (...values: unknown[]) => { mul: (value: unknown) => { xyz: unknown } };

//@ts-expect-error: this is valid but TSL types seems off
export const rotation3d = Fn(([pos, axis, angle]) => {
    const axisNorm = normalize(axis) as unknown as TSLLooseNode;
    const s = sin(angle);
    const c = cos(angle);
    const oc = float(1).sub(c) as unknown as TSLLooseNode;

    const matrix4 = mat4Unchecked(
        oc.mul(axisNorm.x).mul(axisNorm.x).add(c), oc.mul(axisNorm.x).mul(axisNorm.y).sub(axisNorm.z.mul(s)), oc.mul(axisNorm.z).mul(axisNorm.x).add(axisNorm.y.mul(s)), 0.0,
        oc.mul(axisNorm.x).mul(axisNorm.y).add(axisNorm.z.mul(s)), oc.mul(axisNorm.y).mul(axisNorm.y).add(c), oc.mul(axisNorm.y).mul(axisNorm.z).sub(axisNorm.x.mul(s)), 0.0,
        oc.mul(axisNorm.z).mul(axisNorm.x).sub(axisNorm.y.mul(s)), oc.mul(axisNorm.y).mul(axisNorm.z).add(axisNorm.x.mul(s)), oc.mul(axisNorm.z).mul(axisNorm.z).add(c), 0.0,
        0.0, 0.0, 0.0, 1.0
    );
    return matrix4.mul(vec4(pos, 1.0)).xyz;
});

//@ts-expect-error: this is valid but TSL types seems off
export const rotate2D = Fn(([pos, angle]) => {
    const s = sin(angle);
    const c = cos(angle);
    const m = mat2(c, s, s.mul(-1), c);
    return m.mul(pos);
});

//@ts-expect-error: this is valid but TSL types seems off
export const uvTransform = Fn(([uv, scale, offset]) => {
    return uv.mul(scale).add(offset);
});

//@ts-expect-error: this is valid but TSL types seems off
export const sdfCircle2D = Fn(([uv, center, radius]) => {
    const p = uv.sub(center);
    return length(p).sub(radius);
});

//@ts-expect-error: this is valid but TSL types seems off
export const sdfBox2D = Fn(([uv, center, size]) => {
    const p = uv.sub(center);
    const halfSize = size.mul(0.5);
    const d = p.abs().sub(halfSize);
    const outside = length(max(d, vec2(0, 0)));
    const inside = min(max(d.x, d.y), 0.0);
    return outside.add(inside);
});

//@ts-expect-error: this is valid but TSL types seems off
export const sdfRoundedBox2D = Fn(([uv, center, size, radius]) => {
    const p = uv.sub(center);
    const halfSize = size.mul(0.5);
    const q = p.abs().sub(halfSize.sub(vec2(radius, radius)));
    const outside = length(max(q, vec2(0, 0)));
    const inside = min(max(q.x, q.y), 0.0);
    return outside.add(inside).sub(radius);
});

//@ts-expect-error: this is valid but TSL types seems off
export const sdfCapsule2D = Fn(([uv, pointA, pointB, radius]) => {
    const p = uv.sub(pointA);
    const ba = pointB.sub(pointA);
    const baLengthSq = max(dot(ba, ba), 0.000001);
    const h = clamp(dot(p, ba).div(baLengthSq), 0.0, 1.0);
    return length(p.sub(ba.mul(h))).sub(radius);
});

//@ts-expect-error: this is valid but TSL types seems off
export const sdfCross2D = Fn(([uv, center, armLength, thickness]) => {
    const p = uv.sub(center);
    const halfArm = armLength.mul(0.5);
    const halfThickness = thickness.mul(0.5);

    const verticalQ = p.abs().sub(vec2(halfThickness, halfArm));
    const verticalOutside = length(max(verticalQ, vec2(0, 0)));
    const verticalInside = min(max(verticalQ.x, verticalQ.y), 0.0);
    const vertical = verticalOutside.add(verticalInside);

    const horizontalQ = p.abs().sub(vec2(halfArm, halfThickness));
    const horizontalOutside = length(max(horizontalQ, vec2(0, 0)));
    const horizontalInside = min(max(horizontalQ.x, horizontalQ.y), 0.0);
    const horizontal = horizontalOutside.add(horizontalInside);

    return min(vertical, horizontal);
});

//@ts-expect-error: this is valid but TSL types seems off
export const linearGradient = Fn(([t, mode, stops]) => {
    const fallback = color('#ffffff');
    if (!Array.isArray(stops) || stops.length === 0) return fallback;

    const first = stops[0] as { color?: unknown };
    let currentColor: unknown = first?.color ?? fallback;

    for (let i = 1; i < stops.length; i++) {
        const prev = stops[i - 1] as { color: unknown; pos: number };
        const curr = stops[i] as { color: unknown; pos: number };

        const prevPos = Number(prev.pos);
        const currPos = Number(curr.pos);
        const range = Math.max(0.00001, currPos - prevPos);
        const posNode = clamp(t.sub(prevPos).div(range), 0.0, 1.0);
        const blendFactor = mix(posNode, step(0.01, posNode), mode);
        currentColor = mix(currentColor as never, curr.color as never, blendFactor);
    }

    return currentColor;
});

// manually implementing fresnel to control everything
//@ts-expect-error: this is valid but TSL types seems off
export const fresnelFull = Fn(([bias, scale, power, normal, viewDir]) => {
    // 1.0 - dot(N, V)
    // using abs() on dot to handle backfaces if desired, but usually saturate is safer
    // TSL has saturate() ? or use clamp(0,1)
    return bias.add(scale.mul(pow(float(1.0).sub(dot(normal, viewDir).clamp(0, 1)), power)));
});

const LUMINANCE_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

//@ts-expect-error: this is valid but TSL types seems off
export const blendColorDodge = Fn(([base, blend]) => {
    return base.div(float(1).sub(blend).max(0.001)).min(vec3(1));
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendOverlay = Fn(([base, blend]) => {
    const low = base.mul(2).mul(blend);
    const high = float(1).sub(float(2).mul(float(1).sub(base)).mul(float(1).sub(blend)));
    return mix(low, high, step(0.5, base));
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendSoftLight = Fn(([base, blend]) => {
    return float(1).sub(blend.mul(2)).mul(base).mul(base).add(blend.mul(2).mul(base));
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendHardLight = Fn(([base, blend]) => {
    //@ts-expect-error: this is valid but TSL types seems off
    return blendOverlay(blend, base);
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendScreen = Fn(([base, blend]) => {
    return float(1).sub(float(1).sub(base).mul(float(1).sub(blend)));
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendExclusion = Fn(([base, blend]) => {
    return base.add(blend).sub(base.mul(blend).mul(2));
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendMultiply = Fn(([base, blend]) => {
    return base.mul(blend);
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendPlusLighter = Fn(([base, blend]) => {
    return base.add(blend).min(vec3(1));
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendLuminosity = Fn(([base, blend]) => {
    const baseLum = dot(base, LUMINANCE_WEIGHTS);
    const blendLum = dot(blend, LUMINANCE_WEIGHTS);
    return base.add(blendLum.sub(baseLum));
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendDarken = Fn(([base, blend]) => {
    return base.min(blend);
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendLighten = Fn(([base, blend]) => {
    return base.max(blend);
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendHue = Fn(([base, blend]) => {
    return mix(base, blend, 0.5);
});

//@ts-expect-error: this is valid but TSL types seems off
export const blendColorBurn = Fn(([base, blend]) => {
    return float(1).sub(float(1).sub(base).div(blend.max(0.001)).min(vec3(1)));
});

//@ts-expect-error: this is valid but TSL types seems off
export const adjustBrightness = Fn(([color, brightness]) => {
    return color.mul(brightness);
});

//@ts-expect-error: this is valid but TSL types seems off
export const adjustContrast = Fn(([color, contrast]) => {
    return color.sub(0.5).mul(contrast).add(0.5);
});

//@ts-expect-error: this is valid but TSL types seems off
export const adjustSaturate = Fn(([color, saturation]) => {
    return mix(vec3(dot(color, LUMINANCE_WEIGHTS)), color, saturation);
});

// Convert cartesian UV to polar coordinates (radius, angle) normalized to 0..1
//@ts-expect-error: this is valid but TSL types seems off
export const polarUV = Fn(([uv, center]) => {
    const d = uv.sub(center);
    const radius = length(d).mul(2);
    const angle = atan(d.y, d.x).div(PI.mul(2)).add(0.5);
    return vec2(radius, angle);
});

// h is expected in degrees [0, 360], s/l in [0, 1]
//@ts-expect-error: this is valid but TSL types seems off
export const hslToRgb = Fn(([h, s, l]) => {
    const hue = h.div(60);
    const rgb = hue.add(vec3(0, 4, 2)).mod(6).sub(3).abs().sub(1).clamp(0, 1);
    const chromaScale = float(1).sub(l.mul(2).sub(1).abs());
    return l.add(s.mul(rgb.sub(0.5)).mul(chromaScale));
});
