import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

/**
 * TSL autocompletion source for CodeMirror.
 *
 * Provides completions for TSL (Three.js Shading Language) functions,
 * constants, geometry accessors, and common patterns used in code nodes.
 */

interface TSLCompletion {
    label: string;
    type: 'function' | 'constant' | 'keyword' | 'variable' | 'method';
    detail?: string;
    info?: string;
    boost?: number;  // higher = ranked first
}

const tslFunctions: TSLCompletion[] = [
    // -- Type constructors (high boost — used very often) --
    { label: 'float', type: 'function', detail: 'float(value)', info: 'Create a float node', boost: 10 },
    { label: 'int', type: 'function', detail: 'int(value)', info: 'Create an int node', boost: 10 },
    { label: 'vec2', type: 'function', detail: 'vec2(x, y)', info: 'Create a vec2 node', boost: 10 },
    { label: 'vec3', type: 'function', detail: 'vec3(x, y, z)', info: 'Create a vec3 node', boost: 10 },
    { label: 'vec4', type: 'function', detail: 'vec4(x, y, z, w)', info: 'Create a vec4 node', boost: 10 },
    { label: 'color', type: 'function', detail: 'color(r, g, b)', info: 'Create a color node', boost: 10 },
    { label: 'uniform', type: 'function', detail: 'uniform(value)', info: 'Create a uniform node', boost: 8 },

    // -- Arithmetic --
    { label: 'add', type: 'function', detail: 'add(a, b) / a.add(b)', info: 'Add two values' },
    { label: 'sub', type: 'function', detail: 'sub(a, b) / a.sub(b)', info: 'Subtract two values' },
    { label: 'mul', type: 'function', detail: 'mul(a, b) / a.mul(b)', info: 'Multiply two values' },
    { label: 'div', type: 'function', detail: 'div(a, b) / a.div(b)', info: 'Divide two values' },
    { label: 'mod', type: 'function', detail: 'mod(a, b) / a.mod(b)', info: 'Modulo operation' },
    { label: 'negate', type: 'function', detail: 'negate(x) / x.negate()', info: 'Negate a value' },
    { label: 'oneMinus', type: 'function', detail: 'oneMinus(x) / x.oneMinus()', info: 'Returns 1 - x' },
    { label: 'reciprocal', type: 'function', detail: 'reciprocal(x) / x.reciprocal()', info: 'Returns 1 / x' },

    // -- Trigonometry --
    { label: 'sin', type: 'function', detail: 'sin(x)', info: 'Sine' },
    { label: 'cos', type: 'function', detail: 'cos(x)', info: 'Cosine' },
    { label: 'tan', type: 'function', detail: 'tan(x)', info: 'Tangent' },
    { label: 'asin', type: 'function', detail: 'asin(x)', info: 'Arc sine' },
    { label: 'acos', type: 'function', detail: 'acos(x)', info: 'Arc cosine' },
    { label: 'atan', type: 'function', detail: 'atan(y, x)', info: 'Arc tangent' },
    { label: 'degrees', type: 'function', detail: 'degrees(rad)', info: 'Radians to degrees' },
    { label: 'radians', type: 'function', detail: 'radians(deg)', info: 'Degrees to radians' },

    // -- Exponential / Power --
    { label: 'pow', type: 'function', detail: 'pow(base, exp)', info: 'Power' },
    { label: 'pow2', type: 'function', detail: 'pow2(x) / x.pow2()', info: 'Square (x²)' },
    { label: 'pow3', type: 'function', detail: 'pow3(x) / x.pow3()', info: 'Cube (x³)' },
    { label: 'pow4', type: 'function', detail: 'pow4(x) / x.pow4()', info: 'Fourth power (x⁴)' },
    { label: 'sqrt', type: 'function', detail: 'sqrt(x)', info: 'Square root' },
    { label: 'cbrt', type: 'function', detail: 'cbrt(x)', info: 'Cube root' },
    { label: 'inverseSqrt', type: 'function', detail: 'inverseSqrt(x)', info: 'Inverse square root' },
    { label: 'exp', type: 'function', detail: 'exp(x)', info: 'e^x' },
    { label: 'exp2', type: 'function', detail: 'exp2(x)', info: '2^x' },
    { label: 'log', type: 'function', detail: 'log(x)', info: 'Natural logarithm' },
    { label: 'log2', type: 'function', detail: 'log2(x)', info: 'Base-2 logarithm' },

    // -- Rounding / Clamping --
    { label: 'abs', type: 'function', detail: 'abs(x)', info: 'Absolute value' },
    { label: 'sign', type: 'function', detail: 'sign(x)', info: 'Sign of value' },
    { label: 'floor', type: 'function', detail: 'floor(x)', info: 'Floor' },
    { label: 'ceil', type: 'function', detail: 'ceil(x)', info: 'Ceiling' },
    { label: 'round', type: 'function', detail: 'round(x)', info: 'Round to nearest' },
    { label: 'trunc', type: 'function', detail: 'trunc(x)', info: 'Truncate' },
    { label: 'fract', type: 'function', detail: 'fract(x)', info: 'Fractional part' },
    { label: 'saturate', type: 'function', detail: 'saturate(x) / x.saturate()', info: 'Clamp to [0, 1]' },
    { label: 'clamp', type: 'function', detail: 'clamp(x, min, max)', info: 'Clamp value to range' },

    // -- Interpolation / Mapping --
    { label: 'mix', type: 'function', detail: 'mix(a, b, t)', info: 'Linear interpolation', boost: 5 },
    { label: 'step', type: 'function', detail: 'step(edge, x)', info: 'Step function' },
    { label: 'smoothstep', type: 'function', detail: 'smoothstep(edge0, edge1, x)', info: 'Smooth step', boost: 5 },
    { label: 'remap', type: 'function', detail: 'remap(x, inLow, inHigh, outLow, outHigh)', info: 'Remap value range' },
    { label: 'remapClamp', type: 'function', detail: 'remapClamp(x, inLow, inHigh, outLow, outHigh)', info: 'Remap and clamp' },
    { label: 'min', type: 'function', detail: 'min(a, b)', info: 'Minimum of two values' },
    { label: 'max', type: 'function', detail: 'max(a, b)', info: 'Maximum of two values' },

    // -- Vector operations --
    { label: 'normalize', type: 'function', detail: 'normalize(vec)', info: 'Normalize vector' },
    { label: 'length', type: 'function', detail: 'length(vec) / v.length()', info: 'Length of vector' },
    { label: 'distance', type: 'function', detail: 'distance(a, b)', info: 'Distance between vectors' },
    { label: 'dot', type: 'function', detail: 'dot(a, b)', info: 'Dot product' },
    { label: 'cross', type: 'function', detail: 'cross(a, b)', info: 'Cross product' },
    { label: 'reflect', type: 'function', detail: 'reflect(I, N)', info: 'Reflect vector' },
    { label: 'refract', type: 'function', detail: 'refract(I, N, eta)', info: 'Refract vector' },
    { label: 'faceforward', type: 'function', detail: 'faceforward(N, I, Nref)', info: 'Face forward' },
    { label: 'transformDirection', type: 'function', detail: 'transformDirection(dir, mat)', info: 'Transform direction by matrix' },

    // -- Derivatives --
    { label: 'dFdx', type: 'function', detail: 'dFdx(x)', info: 'Partial derivative in X' },
    { label: 'dFdy', type: 'function', detail: 'dFdy(x)', info: 'Partial derivative in Y' },
    { label: 'fwidth', type: 'function', detail: 'fwidth(x)', info: 'abs(dFdx) + abs(dFdy)' },

    // -- Logic / Comparison --
    { label: 'select', type: 'function', detail: 'select(cond, ifTrue, ifFalse)', info: 'Conditional select', boost: 5 },
    { label: 'equals', type: 'function', detail: 'equals(a, b) / a.equals(b)', info: 'Equality test' },
    { label: 'lessThan', type: 'function', detail: 'lessThan(a, b) / a.lessThan(b)', info: 'Less than' },
    { label: 'lessThanEqual', type: 'function', detail: 'lessThanEqual(a, b) / a.lessThanEqual(b)', info: 'Less than or equal' },
    { label: 'greaterThan', type: 'function', detail: 'greaterThan(a, b) / a.greaterThan(b)', info: 'Greater than' },
    { label: 'greaterThanEqual', type: 'function', detail: 'greaterThanEqual(a, b) / a.greaterThanEqual(b)', info: 'Greater than or equal' },
    { label: 'and', type: 'function', detail: 'and(a, b) / a.and(b)', info: 'Logical AND' },
    { label: 'or', type: 'function', detail: 'or(a, b) / a.or(b)', info: 'Logical OR' },
    { label: 'not', type: 'function', detail: 'not(value)', info: 'Logical NOT' },
    { label: 'xor', type: 'function', detail: 'xor(a, b) / a.xor(b)', info: 'Logical XOR' },
    { label: 'all', type: 'function', detail: 'all(bvec)', info: 'True if all components true' },
    { label: 'any', type: 'function', detail: 'any(bvec)', info: 'True if any component true' },

    // -- Geometry accessors --
    { label: 'positionLocal', type: 'variable', detail: 'vec3', info: 'Local position', boost: 3 },
    { label: 'positionWorld', type: 'variable', detail: 'vec3', info: 'World position', boost: 3 },
    { label: 'positionView', type: 'variable', detail: 'vec3', info: 'View position' },
    { label: 'positionViewDirection', type: 'variable', detail: 'vec3', info: 'View direction' },
    { label: 'normalLocal', type: 'variable', detail: 'vec3', info: 'Local normal', boost: 3 },
    { label: 'normalWorld', type: 'variable', detail: 'vec3', info: 'World normal', boost: 3 },
    { label: 'normalView', type: 'variable', detail: 'vec3', info: 'View-space normal' },
    { label: 'tangentLocal', type: 'variable', detail: 'vec4', info: 'Local tangent' },
    { label: 'uv', type: 'function', detail: 'uv()', info: 'Texture coordinates', boost: 8 },
    { label: 'screenUV', type: 'variable', detail: 'vec2', info: 'Screen UVs' },
    { label: 'screenCoordinate', type: 'variable', detail: 'vec2', info: 'Screen coordinates (pixels)' },
    { label: 'screenSize', type: 'variable', detail: 'vec2', info: 'Screen resolution' },
    { label: 'frontFacing', type: 'variable', detail: 'bool', info: 'Is front face' },
    { label: 'instanceIndex', type: 'variable', detail: 'uint', info: 'Instance index' },
    { label: 'instanceCount', type: 'variable', detail: 'int', info: 'Instance count' },
    { label: 'cameraPosition', type: 'variable', detail: 'vec3', info: 'Camera position (world)' },
    { label: 'cameraViewMatrix', type: 'variable', detail: 'mat4', info: 'Camera view matrix' },
    { label: 'time', type: 'variable', detail: 'float', info: 'Elapsed time', boost: 5 },

    // -- Model matrices --
    { label: 'modelWorldMatrix', type: 'variable', detail: 'mat4', info: 'Model to world matrix' },
    { label: 'modelViewMatrix', type: 'variable', detail: 'mat4', info: 'Model to view matrix' },
    { label: 'modelNormalMatrix', type: 'variable', detail: 'mat3', info: 'Normal matrix' },
    { label: 'modelPosition', type: 'variable', detail: 'vec3', info: 'Model position' },
    { label: 'modelScale', type: 'variable', detail: 'vec3', info: 'Model scale' },
    { label: 'modelDirection', type: 'variable', detail: 'vec3', info: 'Model direction' },
    { label: 'modelViewPosition', type: 'variable', detail: 'vec3', info: 'Model view position' },

    // -- Textures --
    { label: 'texture', type: 'function', detail: 'texture(sampler, uv)', info: 'Sample a texture', boost: 5 },
    { label: 'triplanarTexture', type: 'function', detail: 'triplanarTexture(tex, ...)', info: 'Triplanar texture mapping' },
    { label: 'parallaxUV', type: 'function', detail: 'parallaxUV(uv, scale)', info: 'Parallax UV offset' },
    { label: 'viewportDepthTexture', type: 'function', detail: 'viewportDepthTexture(uv)', info: 'Viewport depth' },
    { label: 'viewportSharedTexture', type: 'function', detail: 'viewportSharedTexture(uv)', info: 'Viewport shared texture' },
    { label: 'viewportLinearDepth', type: 'variable', detail: 'float', info: 'Viewport linear depth (current fragment)' },
    { label: 'linearDepth', type: 'function', detail: 'linearDepth(depth?)', info: 'Convert to linear depth' },

    // -- Color utilities --
    { label: 'luminance', type: 'function', detail: 'luminance(color)', info: 'Get luminance of color' },
    { label: 'saturation', type: 'function', detail: 'saturation(color, adj)', info: 'Adjust saturation' },
    { label: 'vibrance', type: 'function', detail: 'vibrance(color, adj)', info: 'Adjust vibrance' },
    { label: 'hue', type: 'function', detail: 'hue(color, adj)', info: 'Shift hue' },
    { label: 'posterize', type: 'function', detail: 'posterize(color, steps)', info: 'Posterize color' },

    // -- Transforms --
    { label: 'rotation3d', type: 'function', detail: 'rotation3d(pos, axis, angle)', info: '3D rotation' },
    { label: 'rotate2D', type: 'function', detail: 'rotate2D(pos, angle)', info: '2D rotation' },
    { label: 'rotate', type: 'function', detail: 'rotate(pos, rotation)', info: 'Rotate a 2D/3D vector' },
    { label: 'uvTransform', type: 'function', detail: 'uvTransform(uv, scale, offset)', info: 'Transform UVs' },
    { label: 'spherizeUV', type: 'function', detail: 'spherizeUV(uv, strength, center)', info: 'Spherical UV warping' },
    { label: 'fresnelFull', type: 'function', detail: 'fresnelFull(bias, scale, power, normal, viewDir)', info: 'Fresnel effect' },

    // -- Noise --
    { label: 'mx_noise_float', type: 'function', detail: 'mx_noise_float(pos, ...)', info: 'MaterialX noise (float)', boost: 3 },
    { label: 'mx_noise_vec3', type: 'function', detail: 'mx_noise_vec3(pos, ...)', info: 'MaterialX noise (vec3)' },
    { label: 'mx_noise_vec4', type: 'function', detail: 'mx_noise_vec4(pos, ...)', info: 'MaterialX noise (vec4)' },
    { label: 'mx_cell_noise_float', type: 'function', detail: 'mx_cell_noise_float(pos)', info: 'MaterialX cell noise' },
    { label: 'mx_worley_noise_float', type: 'function', detail: 'mx_worley_noise_float(pos, ...)', info: 'Worley noise (float)' },
    { label: 'mx_worley_noise_vec2', type: 'function', detail: 'mx_worley_noise_vec2(pos, ...)', info: 'Worley noise (vec2)' },
    { label: 'mx_worley_noise_vec3', type: 'function', detail: 'mx_worley_noise_vec3(pos, ...)', info: 'Worley noise (vec3)' },
    { label: 'mx_fractal_noise_float', type: 'function', detail: 'mx_fractal_noise_float(pos, ...)', info: 'Fractal noise (float)', boost: 3 },
    { label: 'mx_fractal_noise_vec2', type: 'function', detail: 'mx_fractal_noise_vec2(pos, ...)', info: 'Fractal noise (vec2)' },
    { label: 'mx_fractal_noise_vec3', type: 'function', detail: 'mx_fractal_noise_vec3(pos, ...)', info: 'Fractal noise (vec3)' },
    { label: 'mx_fractal_noise_vec4', type: 'function', detail: 'mx_fractal_noise_vec4(pos, ...)', info: 'Fractal noise (vec4)' },
    { label: 'mx_unifiednoise2d', type: 'function', detail: 'mx_unifiednoise2d(...)', info: 'Unified 2D noise' },
    { label: 'mx_unifiednoise3d', type: 'function', detail: 'mx_unifiednoise3d(...)', info: 'Unified 3D noise' },
    { label: 'triNoise3D', type: 'function', detail: 'triNoise3D(pos, ...)', info: 'Tri noise 3D' },
    { label: 'hashBlur', type: 'function', detail: 'hashBlur(tex, uv, blur)', info: 'Hash blur' },
    { label: 'interleavedGradientNoise', type: 'function', detail: 'interleavedGradientNoise(uv)', info: 'Interleaved gradient noise' },

    // -- Patterns --
    { label: 'checker', type: 'function', detail: 'checker(uv)', info: 'Checkerboard pattern' },

    // -- Other utilities --
    { label: 'range', type: 'function', detail: 'range(min, max)', info: 'Random range per instance' },
    { label: 'difference', type: 'function', detail: 'difference(a, b)', info: 'Absolute difference' },
    { label: 'Discard', type: 'function', detail: 'Discard(cond)', info: 'Discard fragment' },
    { label: 'varying', type: 'function', detail: 'varying(node)', info: 'Create a varying' },
    { label: 'Var', type: 'function', detail: 'Var(node)', info: 'Create a variable' },
    { label: 'split', type: 'function', detail: 'split(vec)', info: 'Split vector to components' },

    // -- Constants --
    { label: 'PI', type: 'constant', detail: '3.14159...', info: 'Pi constant' },
    { label: 'TWO_PI', type: 'constant', detail: '6.28318...', info: 'Two Pi constant' },
    { label: 'HALF_PI', type: 'constant', detail: '1.57079...', info: 'Half Pi constant' },
    { label: 'EPSILON', type: 'constant', detail: '~0.00001', info: 'Epsilon constant' },
    { label: 'INFINITY', type: 'constant', detail: '∞', info: 'Infinity constant' },

    // -- Code node pattern --
    { label: 'Fn', type: 'keyword', detail: 'Fn(([args]) => { ... })', info: 'TSL function wrapper (required for code nodes)', boost: 15 },
];

function tslCompletionSource(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/[\w$]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    return {
        from: word.from,
        options: tslFunctions.map(fn => ({
            label: fn.label,
            type: fn.type,
            detail: fn.detail,
            info: fn.info,
            boost: fn.boost ?? 0,
        })),
    };
}

/**
 * CodeMirror extension that provides TSL autocompletion.
 * Merges TSL completions with default JS completions.
 */
export const tslAutocompletion = autocompletion({
    override: [tslCompletionSource],
    activateOnTyping: true,
});
