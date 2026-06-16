import type { ImportGroup } from '@/lib/compiler';

export const TSL_UTILS_IMPORT_SOURCE = '@/lib/tsl-utils';
export const TSL_EASINGS_IMPORT_SOURCE = 'tsl-easings';

interface InlineTslHelperDefinition {
    code: string;
    deps?: string[];
}

interface InlineTslModuleDefinition {
    label: string;
    sharedImports: string[];
    helpers: Record<string, InlineTslHelperDefinition>;
}

interface InlineTslResolution {
    helperCode: string | null;
    helperNames: string[];
}

export interface InlineCustomTslImportsResult {
    imports: ImportGroup[];
    helperCode: string | null;
    inlinedHelpers: string[];
}

export type InlineTslUtilsImportsResult = InlineCustomTslImportsResult;

const INLINE_TSL_MODULES: Record<string, InlineTslModuleDefinition> = {
    [TSL_UTILS_IMPORT_SOURCE]: {
        label: 'Inline TSL Utils',
        sharedImports: [
            'Fn',
            'atan',
            'clamp',
            'color',
            'cos',
            'dot',
            'float',
            'length',
            'mat2',
            'mat4',
            'max',
            'min',
            'mix',
            'normalize',
            'pow',
            'sin',
            'step',
            'vec2',
            'vec3',
            'vec4',
        ],
        helpers: {
            rotation3d: {
                code: `const rotation3d = Fn(([pos, axis, angle]) => {
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
});`,
            },
            rotate2D: {
                code: `const rotate2D = Fn(([pos, angle]) => {
    const s = sin(angle);
    const c = cos(angle);
    const m = mat2(c, s, s.mul(-1), c);
    return m.mul(pos);
});`,
            },
            uvTransform: {
                code: `const uvTransform = Fn(([uv, scale, offset]) => {
    return uv.mul(scale).add(offset);
});`,
            },
            sdfCircle2D: {
                code: `const sdfCircle2D = Fn(([uv, center, radius]) => {
    const p = uv.sub(center);
    return length(p).sub(radius);
});`,
            },
            sdfBox2D: {
                code: `const sdfBox2D = Fn(([uv, center, size]) => {
    const p = uv.sub(center);
    const halfSize = size.mul(0.5);
    const d = p.abs().sub(halfSize);
    const outside = length(max(d, vec2(0, 0)));
    const inside = min(max(d.x, d.y), 0.0);
    return outside.add(inside);
});`,
            },
            sdfRoundedBox2D: {
                code: `const sdfRoundedBox2D = Fn(([uv, center, size, radius]) => {
    const p = uv.sub(center);
    const halfSize = size.mul(0.5);
    const q = p.abs().sub(halfSize.sub(vec2(radius, radius)));
    const outside = length(max(q, vec2(0, 0)));
    const inside = min(max(q.x, q.y), 0.0);
    return outside.add(inside).sub(radius);
});`,
            },
            sdfCapsule2D: {
                code: `const sdfCapsule2D = Fn(([uv, pointA, pointB, radius]) => {
    const p = uv.sub(pointA);
    const ba = pointB.sub(pointA);
    const baLengthSq = max(dot(ba, ba), 0.000001);
    const h = clamp(dot(p, ba).div(baLengthSq), 0.0, 1.0);
    return length(p.sub(ba.mul(h))).sub(radius);
});`,
            },
            sdfCross2D: {
                code: `const sdfCross2D = Fn(([uv, center, armLength, thickness]) => {
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
});`,
            },
            linearGradient: {
                code: `const linearGradient = Fn(([t, mode, stops]) => {
    const fallback = color('#ffffff');
    if (!Array.isArray(stops) || stops.length === 0) return fallback;

    const first = stops[0];
    let currentColor = first?.color ?? fallback;

    for (let i = 1; i < stops.length; i++) {
        const prev = stops[i - 1];
        const curr = stops[i];

        const prevPos = Number(prev.pos);
        const currPos = Number(curr.pos);
        const range = Math.max(0.00001, currPos - prevPos);
        const posNode = clamp(t.sub(prevPos).div(range), 0.0, 1.0);
        const blendFactor = mix(posNode, step(0.01, posNode), mode);
        currentColor = mix(currentColor, curr.color, blendFactor);
    }

    return currentColor;
});`,
            },
            fresnelFull: {
                code: `const fresnelFull = Fn(([bias, scale, power, normal, viewDir]) => {
    return bias.add(scale.mul(pow(float(1.0).sub(dot(normal, viewDir).clamp(0, 1)), power)));
});`,
            },
            LUMINANCE_WEIGHTS: {
                code: 'const LUMINANCE_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);',
            },
            blendColorDodge: {
                code: `const blendColorDodge = Fn(([base, blend]) => {
    return base.div(float(1).sub(blend).max(0.001)).min(vec3(1));
});`,
            },
            blendOverlay: {
                code: `const blendOverlay = Fn(([base, blend]) => {
    const low = base.mul(2).mul(blend);
    const high = float(1).sub(float(2).mul(float(1).sub(base)).mul(float(1).sub(blend)));
    return mix(low, high, step(0.5, base));
});`,
            },
            blendSoftLight: {
                code: `const blendSoftLight = Fn(([base, blend]) => {
    return float(1).sub(blend.mul(2)).mul(base).mul(base).add(blend.mul(2).mul(base));
});`,
            },
            blendHardLight: {
                deps: ['blendOverlay'],
                code: `const blendHardLight = Fn(([base, blend]) => {
    return blendOverlay(blend, base);
});`,
            },
            blendScreen: {
                code: `const blendScreen = Fn(([base, blend]) => {
    return float(1).sub(float(1).sub(base).mul(float(1).sub(blend)));
});`,
            },
            blendExclusion: {
                code: `const blendExclusion = Fn(([base, blend]) => {
    return base.add(blend).sub(base.mul(blend).mul(2));
});`,
            },
            blendMultiply: {
                code: `const blendMultiply = Fn(([base, blend]) => {
    return base.mul(blend);
});`,
            },
            blendPlusLighter: {
                code: `const blendPlusLighter = Fn(([base, blend]) => {
    return base.add(blend).min(vec3(1));
});`,
            },
            blendLuminosity: {
                deps: ['LUMINANCE_WEIGHTS'],
                code: `const blendLuminosity = Fn(([base, blend]) => {
    const baseLum = dot(base, LUMINANCE_WEIGHTS);
    const blendLum = dot(blend, LUMINANCE_WEIGHTS);
    return base.add(blendLum.sub(baseLum));
});`,
            },
            blendDarken: {
                code: `const blendDarken = Fn(([base, blend]) => {
    return base.min(blend);
});`,
            },
            blendLighten: {
                code: `const blendLighten = Fn(([base, blend]) => {
    return base.max(blend);
});`,
            },
            blendHue: {
                code: `const blendHue = Fn(([base, blend]) => {
    return mix(base, blend, 0.5);
});`,
            },
            blendColorBurn: {
                code: `const blendColorBurn = Fn(([base, blend]) => {
    return float(1).sub(float(1).sub(base).div(blend.max(0.001)).min(vec3(1)));
});`,
            },
            adjustBrightness: {
                code: `const adjustBrightness = Fn(([color, brightness]) => {
    return color.mul(brightness);
});`,
            },
            adjustContrast: {
                code: `const adjustContrast = Fn(([color, contrast]) => {
    return color.sub(0.5).mul(contrast).add(0.5);
});`,
            },
            adjustSaturate: {
                deps: ['LUMINANCE_WEIGHTS'],
                code: `const adjustSaturate = Fn(([color, saturation]) => {
    return mix(vec3(dot(color, LUMINANCE_WEIGHTS)), color, saturation);
});`,
            },
            polarUV: {
                code: `const polarUV = Fn(([uv, center]) => {
    const d = uv.sub(center);
    const radius = length(d).mul(2);
    const angle = atan(d.y, d.x).div(Math.PI * 2).add(0.5);
    return vec2(radius, angle);
});`,
            },
            hslToRgb: {
                code: `const hslToRgb = Fn(([h, s, l]) => {
    const hue = h.div(60);
    const rgb = hue.add(vec3(0, 4, 2)).mod(6).sub(3).abs().sub(1).clamp(0, 1);
    const chromaScale = float(1).sub(l.mul(2).sub(1).abs());
    return l.add(s.mul(rgb.sub(0.5)).mul(chromaScale));
});`,
            },
        },
    },
    [TSL_EASINGS_IMPORT_SOURCE]: {
        label: 'Easing helpers adapted from tsl-easings by Yuri Artiukh (akella)',
        sharedImports: [
            'Fn',
            'cos',
            'float',
            'mix',
            'pow',
            'select',
            'sin',
            'sqrt',
            'step',
        ],
        helpers: {
            easeLinear: {
                code: `const easeLinear = Fn(([t]) => {
    return t;
});`,
            },
            easeInQuad: {
                code: `const easeInQuad = Fn(([t]) => {
    return t.mul(t);
});`,
            },
            easeOutQuad: {
                code: `const easeOutQuad = Fn(([t]) => {
    return t.mul(float(2).sub(t));
});`,
            },
            easeInOutQuad: {
                code: `const easeInOutQuad = Fn(([t]) => {
    const a = pow(t, 2).mul(2);
    const b = pow(t, 2).mul(-2).add(t.mul(4)).sub(1);
    return mix(a, b, step(0.5, t));
});`,
            },
            easeInCubic: {
                code: `const easeInCubic = Fn(([t]) => {
    return pow(t, 3);
});`,
            },
            easeOutCubic: {
                code: `const easeOutCubic = Fn(([t]) => {
    return pow(t.sub(1), 3).add(1);
});`,
            },
            easeInOutCubic: {
                code: `const easeInOutCubic = Fn(([t]) => {
    const a = float(4).mul(pow(t, 3));
    const b = float(0.5).mul(pow(t.mul(2).sub(2), 3)).add(1);
    return mix(a, b, step(0.5, t));
});`,
            },
            easeInQuart: {
                code: `const easeInQuart = Fn(([t]) => {
    return pow(t, 4);
});`,
            },
            easeOutQuart: {
                code: `const easeOutQuart = Fn(([t]) => {
    return pow(t.sub(1), 3).mul(t.oneMinus()).add(1);
});`,
            },
            easeInOutQuart: {
                code: `const easeInOutQuart = Fn(([t]) => {
    const a = float(8).mul(pow(t, 4));
    const b = float(-8).mul(pow(t.sub(1), 4)).add(1);
    return mix(a, b, step(0.5, t));
});`,
            },
            easeInQuint: {
                code: `const easeInQuint = Fn(([t]) => {
    return pow(t, 5);
});`,
            },
            easeOutQuint: {
                code: `const easeOutQuint = Fn(([t]) => {
    return pow(t.oneMinus(), 5).oneMinus();
});`,
            },
            easeInOutQuint: {
                code: `const easeInOutQuint = Fn(([t]) => {
    const a = pow(t, 5).mul(16);
    const b = pow(t.mul(-2).add(2), 5).mul(0.5).oneMinus();
    return mix(a, b, step(0.5, t));
});`,
            },
            easeInSine: {
                code: `const easeInSine = Fn(([t]) => {
    return sin(t.sub(1).mul(Math.PI * 0.5)).add(1);
});`,
            },
            easeOutSine: {
                code: `const easeOutSine = Fn(([t]) => {
    return sin(t.mul(Math.PI * 0.5));
});`,
            },
            easeInOutSine: {
                code: `const easeInOutSine = Fn(([t]) => {
    return cos(t.mul(Math.PI)).sub(1).mul(-0.5);
});`,
            },
            easeInExpo: {
                code: `const easeInExpo = Fn(([t]) => {
    return select(t.equal(0), 0, pow(2, t.mul(10).sub(10)));
});`,
            },
            easeOutExpo: {
                code: `const easeOutExpo = Fn(([t]) => {
    return select(t.equal(1), 1, pow(2, t.mul(-10)).add(1));
});`,
            },
            easeInOutExpo: {
                code: `const easeInOutExpo = Fn(([t]) => {
    const a = pow(2, t.mul(20).sub(10)).mul(0.5);
    const b = pow(2, t.mul(-20).add(10)).mul(-0.5).add(1);
    const out = mix(b, a, step(t, 0.5));
    out.assign(select(t.equal(0), 0, out));
    out.assign(select(t.equal(1), 1, out));
    return out;
});`,
            },
            easeInCircular: {
                code: `const easeInCircular = Fn(([t]) => {
    return sqrt(t.mul(t).oneMinus()).oneMinus();
});`,
            },
            easeOutCircular: {
                code: `const easeOutCircular = Fn(([t]) => {
    return sqrt(t.mul(float(2).sub(t)));
});`,
            },
            easeInOutCircular: {
                code: `const easeInOutCircular = Fn(([t]) => {
    const a = sqrt(float(1).sub(pow(float(2).mul(t), 2))).oneMinus().mul(0.5);
    const b = sqrt(float(1).sub(pow(float(-2).mul(t).add(2), 2))).add(1).mul(0.5);
    return select(t.lessThan(0.5), a, b);
});`,
            },
            easeInBack: {
                code: `const easeInBack = Fn(([t]) => {
    const c1 = float(1.70158);
    const c3 = c1.add(1);
    return c3.mul(t).mul(t).mul(t).sub(c1.mul(t).mul(t));
});`,
            },
            easeOutBack: {
                code: `const easeOutBack = Fn(([t]) => {
    const c1 = float(1.70158);
    const c3 = c1.add(1);
    return c1.mul(pow(t.sub(1), 2)).add(1).add(c3.mul(pow(t.sub(1), 3)));
});`,
            },
            easeInOutBack: {
                code: `const easeInOutBack = Fn(([t]) => {
    const c1 = float(1.70158);
    const c2 = c1.mul(1.525);

    const a = pow(t.mul(2), 2).mul(c2.add(1).mul(t).mul(2).sub(c2)).div(2);
    const b = pow(t.mul(2).sub(2), 2).mul(c2.add(1).mul(t.mul(2).sub(2)).add(c2)).add(2).div(2);

    return select(t.lessThan(0.5), a, b);
});`,
            },
            easeInElastic: {
                code: `const easeInElastic = Fn(([t]) => {
    const c4 = float((2 * Math.PI) / 3);
    return sin(t.mul(10).sub(10.75).mul(c4)).mul(pow(2, t.mul(10).sub(10))).mul(-1);
});`,
            },
            easeOutElastic: {
                code: `const easeOutElastic = Fn(([t]) => {
    return sin(t.add(1).mul((-13 * Math.PI) / 2)).mul(pow(2, t.mul(-10))).add(1);
});`,
            },
            easeInOutElastic: {
                code: `const easeInOutElastic = Fn(([t]) => {
    const c5 = float((2 * Math.PI) / 4.5);
    const a = pow(2, t.mul(20).sub(10)).mul(sin(t.mul(20).sub(11.125).mul(c5))).div(2);
    const b = pow(2, t.mul(-20).add(10)).mul(sin(t.mul(20).sub(11.125).mul(c5))).div(2).add(1);
    const out = mix(b, a, step(t, 0.5));

    out.assign(select(t.equal(0), 0, out));
    out.assign(select(t.equal(1), 1, out));
    return out;
});`,
            },
            easeOutBounce: {
                code: `const easeOutBounce = Fn(([t]) => {
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
});`,
            },
            easeInBounce: {
                deps: ['easeOutBounce'],
                code: `const easeInBounce = Fn(([t]) => {
    return float(1).sub(easeOutBounce(t.oneMinus()));
});`,
            },
            easeInOutBounce: {
                deps: ['easeOutBounce'],
                code: `const easeInOutBounce = Fn(([t]) => {
    const a = easeOutBounce(t.mul(-2).add(1)).oneMinus().div(2);
    const b = easeOutBounce(t.mul(2).sub(1)).add(1).div(2);
    return select(t.lessThan(0.5), a, b);
});`,
            },
        },
    },
};

const uniqueSorted = (values: Iterable<string>): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const mergeImportGroups = (groups: ImportGroup[]): ImportGroup[] => {
    const grouped = new Map<string, Set<string>>();

    groups.forEach((group) => {
        const current = grouped.get(group.from) ?? new Set<string>();
        group.imports.forEach((item) => current.add(item));
        grouped.set(group.from, current);
    });

    return Array.from(grouped.entries())
        .map(([from, imports]) => ({ from, imports: uniqueSorted(imports) }))
        .filter((group) => group.imports.length > 0)
        .sort((a, b) => a.from.localeCompare(b.from));
};

const resolveInlineHelpers = (
    moduleDef: InlineTslModuleDefinition,
    helpers: string[]
): InlineTslResolution => {
    const visited = new Set<string>();
    const ordered: string[] = [];

    const visit = (name: string) => {
        if (visited.has(name)) return;
        const def = moduleDef.helpers[name];
        if (!def) return;

        visited.add(name);
        def.deps?.forEach((dep) => visit(dep));
        ordered.push(name);
    };

    helpers.forEach((name) => visit(name));

    if (ordered.length === 0) {
        return {
            helperCode: null,
            helperNames: [],
        };
    }

    return {
        helperCode: `// ${moduleDef.label}\n${ordered
            .map((name) => moduleDef.helpers[name].code.trim())
            .join('\n\n')}`,
        helperNames: ordered,
    };
};

export const inlineCustomTslImports = (imports: ImportGroup[]): InlineCustomTslImportsResult => {
    const additionalThreeImports = new Set<string>();
    const helperBlocks: string[] = [];
    const inlinedHelpers: string[] = [];
    const remainingImports: ImportGroup[] = [];

    for (const group of imports) {
        const moduleDef = INLINE_TSL_MODULES[group.from];
        if (!moduleDef) {
            remainingImports.push(group);
            continue;
        }

        const supportedHelpers = group.imports.filter((name) => Boolean(moduleDef.helpers[name]));
        const unsupportedHelpers = group.imports.filter((name) => !moduleDef.helpers[name]);
        const resolved = resolveInlineHelpers(moduleDef, supportedHelpers);

        if (unsupportedHelpers.length > 0) {
            remainingImports.push({ from: group.from, imports: uniqueSorted(unsupportedHelpers) });
        }

        if (resolved.helperCode) {
            helperBlocks.push(resolved.helperCode);
            resolved.helperNames.forEach((name) => inlinedHelpers.push(name));
            moduleDef.sharedImports.forEach((name) => additionalThreeImports.add(name));
        }
    }

    if (additionalThreeImports.size > 0) {
        remainingImports.push({
            from: 'three/tsl',
            imports: uniqueSorted(additionalThreeImports),
        });
    }

    return {
        imports: mergeImportGroups(remainingImports),
        helperCode: helperBlocks.length > 0 ? helperBlocks.join('\n\n') : null,
        inlinedHelpers,
    };
};

export const inlineTslUtilsImports = inlineCustomTslImports;
