import { Fn, float, vec4, mat4, mat2, normalize, sin, cos, pow, dot } from 'three/tsl';

//@ts-expect-error: this is valid but TSL types seems off
export const rotation3d = Fn(([pos, axis, angle]) => {
    const axisNorm = normalize(axis);
    const s = sin(angle);
    const c = cos(angle);
    const oc = float(1).sub(c);

    const matrix4 = mat4(
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
    // @ts-expect-error: mat2 types are missing in TSL definition
    const m = mat2(c, s, s.mul(-1), c);
    return m.mul(pos);
});

//@ts-expect-error: this is valid but TSL types seems off
export const uvTransform = Fn(([uv, scale, offset]) => {
    return uv.mul(scale).add(offset);
});

// manually implementing fresnel to control everything
//@ts-expect-error: this is valid but TSL types seems off
export const fresnelFull = Fn(([bias, scale, power, normal, viewDir]) => {
    // 1.0 - dot(N, V)
    // using abs() on dot to handle backfaces if desired, but usually saturate is safer
    // TSL has saturate() ? or use clamp(0,1)
    return bias.add(scale.mul(pow(float(1.0).sub(dot(normal, viewDir).clamp(0, 1)), power)));
});

