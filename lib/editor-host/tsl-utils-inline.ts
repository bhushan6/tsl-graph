import type { ImportGroup } from '@/lib/compiler';

export const TSL_UTILS_IMPORT_SOURCE = '@/lib/tsl-utils';

interface InlineTslHelperDefinition {
    code: string;
    deps?: string[];
}

interface InlineTslResolution {
    helperCode: string | null;
    helperNames: string[];
}

export interface InlineTslUtilsImportsResult {
    imports: ImportGroup[];
    helperCode: string | null;
    inlinedHelpers: string[];
}

const TSL_UTILS_SHARED_IMPORTS = [
    'Fn',
    'float',
    'vec2',
    'vec3',
    'vec4',
    'mat4',
    'mat2',
    'normalize',
    'sin',
    'cos',
    'pow',
    'dot',
    'mix',
    'step',
    'clamp',
    'length',
    'max',
    'min',
    'color',
];

const INLINE_TSL_HELPERS: Record<string, InlineTslHelperDefinition> = {
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
});`
    },
    rotate2D: {
        code: `const rotate2D = Fn(([pos, angle]) => {
    const s = sin(angle);
    const c = cos(angle);
    const m = mat2(c, s, s.mul(-1), c);
    return m.mul(pos);
});`
    },
    uvTransform: {
        code: `const uvTransform = Fn(([uv, scale, offset]) => {
    return uv.mul(scale).add(offset);
});`
    },
    sdfCircle2D: {
        code: `const sdfCircle2D = Fn(([uv, center, radius]) => {
    const p = uv.sub(center);
    return length(p).sub(radius);
});`
    },
    sdfBox2D: {
        code: `const sdfBox2D = Fn(([uv, center, size]) => {
    const p = uv.sub(center);
    const halfSize = size.mul(0.5);
    const d = p.abs().sub(halfSize);
    const outside = length(max(d, vec2(0, 0)));
    const inside = min(max(d.x, d.y), 0.0);
    return outside.add(inside);
});`
    },
    sdfRoundedBox2D: {
        code: `const sdfRoundedBox2D = Fn(([uv, center, size, radius]) => {
    const p = uv.sub(center);
    const halfSize = size.mul(0.5);
    const q = p.abs().sub(halfSize.sub(vec2(radius, radius)));
    const outside = length(max(q, vec2(0, 0)));
    const inside = min(max(q.x, q.y), 0.0);
    return outside.add(inside).sub(radius);
});`
    },
    sdfCapsule2D: {
        code: `const sdfCapsule2D = Fn(([uv, pointA, pointB, radius]) => {
    const p = uv.sub(pointA);
    const ba = pointB.sub(pointA);
    const baLengthSq = max(dot(ba, ba), 0.000001);
    const h = clamp(dot(p, ba).div(baLengthSq), 0.0, 1.0);
    return length(p.sub(ba.mul(h))).sub(radius);
});`
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
});`
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
});`
    },
    fresnelFull: {
        code: `const fresnelFull = Fn(([bias, scale, power, normal, viewDir]) => {
    return bias.add(scale.mul(pow(float(1.0).sub(dot(normal, viewDir).clamp(0, 1)), power)));
});`
    },
    LUMINANCE_WEIGHTS: {
        code: 'const LUMINANCE_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);'
    },
    blendColorDodge: {
        code: `const blendColorDodge = Fn(([base, blend]) => {
    return base.div(float(1).sub(blend).max(0.001)).min(vec3(1));
});`
    },
    blendOverlay: {
        code: `const blendOverlay = Fn(([base, blend]) => {
    const low = base.mul(2).mul(blend);
    const high = float(1).sub(float(2).mul(float(1).sub(base)).mul(float(1).sub(blend)));
    return mix(low, high, step(0.5, base));
});`
    },
    blendSoftLight: {
        code: `const blendSoftLight = Fn(([base, blend]) => {
    return float(1).sub(blend.mul(2)).mul(base).mul(base).add(blend.mul(2).mul(base));
});`
    },
    blendHardLight: {
        deps: ['blendOverlay'],
        code: `const blendHardLight = Fn(([base, blend]) => {
    return blendOverlay(blend, base);
});`
    },
    blendScreen: {
        code: `const blendScreen = Fn(([base, blend]) => {
    return float(1).sub(float(1).sub(base).mul(float(1).sub(blend)));
});`
    },
    blendExclusion: {
        code: `const blendExclusion = Fn(([base, blend]) => {
    return base.add(blend).sub(base.mul(blend).mul(2));
});`
    },
    blendMultiply: {
        code: `const blendMultiply = Fn(([base, blend]) => {
    return base.mul(blend);
});`
    },
    blendPlusLighter: {
        code: `const blendPlusLighter = Fn(([base, blend]) => {
    return base.add(blend).min(vec3(1));
});`
    },
    blendLuminosity: {
        deps: ['LUMINANCE_WEIGHTS'],
        code: `const blendLuminosity = Fn(([base, blend]) => {
    const baseLum = dot(base, LUMINANCE_WEIGHTS);
    const blendLum = dot(blend, LUMINANCE_WEIGHTS);
    return base.add(blendLum.sub(baseLum));
});`
    },
    blendDarken: {
        code: `const blendDarken = Fn(([base, blend]) => {
    return base.min(blend);
});`
    },
    blendLighten: {
        code: `const blendLighten = Fn(([base, blend]) => {
    return base.max(blend);
});`
    },
    blendHue: {
        code: `const blendHue = Fn(([base, blend]) => {
    return mix(base, blend, 0.5);
});`
    },
    blendColorBurn: {
        code: `const blendColorBurn = Fn(([base, blend]) => {
    return float(1).sub(float(1).sub(base).div(blend.max(0.001)).min(vec3(1)));
});`
    },
    adjustBrightness: {
        code: `const adjustBrightness = Fn(([color, brightness]) => {
    return color.mul(brightness);
});`
    },
    adjustContrast: {
        code: `const adjustContrast = Fn(([color, contrast]) => {
    return color.sub(0.5).mul(contrast).add(0.5);
});`
    },
    adjustSaturate: {
        deps: ['LUMINANCE_WEIGHTS'],
        code: `const adjustSaturate = Fn(([color, saturation]) => {
    return mix(vec3(dot(color, LUMINANCE_WEIGHTS)), color, saturation);
});`
    },
    hslToRgb: {
        code: `const hslToRgb = Fn(([h, s, l]) => {
    const hue = h.div(60);
    const rgb = hue.add(vec3(0, 4, 2)).mod(6).sub(3).abs().sub(1).clamp(0, 1);
    const chromaScale = float(1).sub(l.mul(2).sub(1).abs());
    return l.add(s.mul(rgb.sub(0.5)).mul(chromaScale));
});`
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

const resolveInlineHelpers = (helpers: string[]): InlineTslResolution => {
    const visited = new Set<string>();
    const ordered: string[] = [];

    const visit = (name: string) => {
        if (visited.has(name)) return;
        const def = INLINE_TSL_HELPERS[name];
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
        helperCode: ordered
            .map((name) => INLINE_TSL_HELPERS[name].code.trim())
            .join('\n\n'),
        helperNames: ordered,
    };
};

export const inlineTslUtilsImports = (imports: ImportGroup[]): InlineTslUtilsImportsResult => {
    const helperGroup = imports.find((group) => group.from === TSL_UTILS_IMPORT_SOURCE);
    if (!helperGroup) {
        return {
            imports,
            helperCode: null,
            inlinedHelpers: [],
        };
    }

    const supportedHelpers = helperGroup.imports.filter((name) => Boolean(INLINE_TSL_HELPERS[name]));
    const unsupportedHelpers = helperGroup.imports.filter((name) => !INLINE_TSL_HELPERS[name]);
    const resolved = resolveInlineHelpers(supportedHelpers);

    const remainingImports = imports.filter((group) => group.from !== TSL_UTILS_IMPORT_SOURCE);

    if (unsupportedHelpers.length > 0) {
        remainingImports.push({ from: TSL_UTILS_IMPORT_SOURCE, imports: uniqueSorted(unsupportedHelpers) });
    }

    if (resolved.helperNames.length > 0) {
        remainingImports.push({
            from: 'three/tsl',
            imports: TSL_UTILS_SHARED_IMPORTS,
        });
    }

    return {
        imports: mergeImportGroups(remainingImports),
        helperCode: resolved.helperCode,
        inlinedHelpers: resolved.helperNames,
    };
};
