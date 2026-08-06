import type { BaseNodeDef } from './definitions';

const TSL_WIKI_DESCRIPTIONS: Record<string, string> = {
    // Math constants
    EPSILON: 'Small value used to handle floating-point precision errors.',
    INFINITY: 'Represents infinity.',
    PI: 'The mathematical constant pi.',
    TWO_PI: 'Two times pi.',
    HALF_PI: 'Half of pi.',

    // Math functions
    abs: 'Returns the absolute value of x.',
    acos: 'Returns the arccosine of x.',
    all: 'Returns true if all components of x are true.',
    any: 'Returns true if any component of x is true.',
    asin: 'Returns the arcsine of x.',
    atan: 'Returns the arctangent of y/x.',
    cbrt: 'Returns the cube root of x.',
    ceil: 'Returns the smallest integer not less than x.',
    clamp: 'Clamps x between min and max.',
    cos: 'Returns the cosine of x.',
    cross: 'Returns the cross product of two vectors.',
    degrees: 'Converts radians to degrees.',
    distance: 'Returns the distance between two points.',
    dot: 'Returns the dot product of two vectors.',
    exp: 'Returns e raised to the power of x.',
    exp2: 'Returns 2 raised to the power of x.',
    floor: 'Returns the greatest integer not greater than x.',
    fract: 'Returns the fractional part of x.',
    inverseSqrt: 'Returns 1 divided by the square root of x.',
    length: 'Returns the length of a vector.',
    log: 'Returns the natural logarithm of x.',
    log2: 'Returns the base-2 logarithm of x.',
    max: 'Returns the greater of x and y.',
    min: 'Returns the lesser of x and y.',
    mix: 'Linearly interpolates between x and y by a.',
    mod: 'Returns x modulo y.',
    normalize: 'Normalizes a vector.',
    pow: 'Returns x raised to the power of y.',
    pow2: 'Returns x squared.',
    pow3: 'Returns x cubed.',
    pow4: 'Returns x to the fourth power.',
    radians: 'Converts degrees to radians.',
    reflect: 'Returns the reflection direction.',
    refract: 'Returns the refraction direction.',
    round: 'Rounds x to the nearest integer.',
    sign: 'Returns the sign of x.',
    sin: 'Returns the sine of x.',
    smoothstep: 'Smooth Hermite interpolation between edge0 and edge1.',
    sqrt: 'Returns the square root of x.',
    step: 'Returns 0 if x < edge, else 1.',
    tan: 'Returns the tangent of x.',
    trunc: 'Truncates x toward zero.',
    fwidth: 'Returns the sum of absolute derivatives in x and y.',
    dFdx: 'Returns the derivative of p with respect to x.',
    dFdy: 'Returns the derivative of p with respect to y.',
    faceforward: 'Orients N to face the same direction as Nref relative to I.',
    saturate: 'Clamps x to the 0..1 range.',
    equal: 'Returns true where x equals y.',
    greaterThan: 'Returns true where x is greater than y.',
    greaterThanEqual: 'Returns true where x is greater than or equal to y.',
    lessThan: 'Returns true where x is less than y.',
    lessThanEqual: 'Returns true where x is less than or equal to y.',
    difference: 'Returns the absolute difference between two values.',
    oneMinus: 'Returns 1 minus x.',
    negate: 'Returns the negated value of x.',
    reciprocal: 'Returns 1 divided by x.',
    select: 'Returns trueValue when cond is true; otherwise falseValue.',

    // Texture
    texture: 'Samples a 2D texture at the given UV coordinates.',
    textureLoad: 'Loads a single texel using integer coordinates.',
    textureStore: 'Stores a value into a texture at an integer coordinate.',
    textureSize: 'Returns the dimensions of a texture.',
    textureBicubic: 'Samples a texture using bicubic interpolation.',
    cubeTexture: 'Samples a cube texture using a direction vector.',
    texture3D: 'Samples a 3D texture at a given coordinate.',
    triplanarTexture: 'Samples a texture using triplanar projection.',
    parallaxUV: 'Offsets UVs based on view direction for parallax mapping.',

    // Attributes
    uv: 'Returns the UV attribute for the selected index (default 0).',
    instanceIndex: 'Returns the index of the current instance.',
    instanceCount: 'Returns the total number of instances.',

    // Position / Normal / Tangent
    positionLocal: 'Returns the position in local space.',
    positionWorld: 'Returns the position in world space.',
    positionView: 'Returns the position in view space.',
    positionViewDirection: 'Returns the view direction based on position.',
    normalLocal: 'Returns the normal in local space.',
    normalWorld: 'Returns the normal in world space.',
    normalView: 'Returns the normal in view space.',
    tangentLocal: 'Returns the tangent in local space.',

    // Model
    modelViewMatrix: 'Returns the model-view matrix.',
    modelNormalMatrix: 'Returns the model normal matrix.',
    modelWorldMatrix: 'Returns the model-to-world matrix.',
    modelPosition: 'Returns the model position in world space.',
    modelDirection: 'Returns the model direction vector.',
    modelScale: 'Returns the model scale.',
    modelViewPosition: 'Returns the model position in view space.',
    cameraPosition: 'Returns the camera position in world space.',
    cameraViewMatrix: 'Returns the camera view matrix.',

    // Screen / Viewport
    screenUV: 'Returns the screen-space UV coordinates.',
    viewportUV: 'Returns UV coordinates normalized to the current viewport.',
    screenCoordinate: 'Returns the screen-space coordinate in pixels.',
    screenSize: 'Returns the screen resolution.',
    viewportSharedTexture: 'Samples the already-rendered viewport color.',
    viewportDepthTexture: 'Returns the viewport depth texture.',
    viewportLinearDepth: 'Returns linear depth for the current fragment.',

    // UV / Interpolation
    uvTransform: 'Transforms UVs using scale and offset.',
    spherizeUV: 'Applies a spherical warping effect to UV coordinates.',
    rotateUV: 'Rotates UV coordinates around a center point by an angle.',
    remap: 'Maps a value from one range to another.',

    // Transforms
    rotate: 'Rotates a 2D or 3D vector.',

    // Random
    range: 'Returns a deterministic random value in a range.',

    // Timer
    time: 'Returns the current time in seconds.',

    // Post-processing
    afterImage: 'Blends the current frame with previous frames to create trailing.',
    anamorphic: 'Applies an anamorphic bloom-style streak effect.',
    bloom: 'Adds a bloom glow to bright areas.',
    boxBlur: 'Applies a box blur filter.',
    chromaticAberration: 'Offsets RGB channels to simulate chromatic aberration.',
    dof: 'Applies a depth-of-field blur based on focus.',
    dotScreen: 'Applies a dot screen halftone effect.',
    film: 'Adds film grain and scanline noise.',
    fxaa: 'Applies fast approximate anti-aliasing.',
    gaussianBlur: 'Applies a Gaussian blur filter.',
    grayscale: 'Converts color to grayscale.',
    hash: 'Generates a deterministic value from zero up to, but not including, one for a seed.',
    hashBlur: 'Applies a fast hash-based blur.',
    rgbShift: 'Shifts RGB channels for a glitch effect.',
    sepia: 'Applies a sepia color tone.',
    smaa: 'Applies SMAA anti-aliasing.',
    sobel: 'Detects edges using the Sobel operator.',
    transition: 'Transitions between two inputs using a mix texture.',

    // Color adjustments
    adjustBrightness: 'Adjusts the brightness of a color.',
    adjustContrast: 'Adjusts the contrast of a color.',
    adjustSaturate: 'Adjusts the saturation of a color.',
    hue: 'Shifts the hue of a color.',
    luminance: 'Returns the perceived luminance of a color.',
    saturation: 'Adjusts saturation of a color.',
    vibrance: 'Adjusts color vibrance.',
    posterize: 'Reduces color levels to create a posterized look.',

    // Blend modes (where documented)
    blendColorBurn: 'Darkens by increasing contrast between base and blend.',
    blendColorDodge: 'Brightens by decreasing contrast between base and blend.',
    blendOverlay: 'Combines multiply and screen depending on base.',
    blendScreen: 'Brightens by inverting, multiplying, and inverting again.',
    blendColor: 'Applies the blend color while preserving base luminance.',
    blendSoftLight: 'Applies a soft light blend to combine base and blend.',
    blendHardLight: 'Applies a hard light blend to combine base and blend.',
    blendMultiply: 'Darkens by multiplying base and blend.',
    blendExclusion: 'Blends with an exclusion effect (low-contrast difference).',
    blendPlusLighter: 'Adds base and blend for a lighter result.',
    blendLuminosity: 'Uses blend luminance with base color.',
    blendDarken: 'Chooses the darker of base and blend.',
    blendLighten: 'Chooses the lighter of base and blend.',
    blendHue: 'Uses blend hue with base luminance and saturation.',
};

const NODE_TYPE_DESCRIPTIONS: Record<string, string> = {
    'math/add': 'Adds A and B.',
    'math/sub': 'Subtracts B from A.',
    'math/mul': 'Multiplies A and B.',
    'math/div': 'Divides A by B.',
    'math/multiOp': 'Chains multiple operations into a single node.',
    'math/split': 'Splits a value into components.',
    'math/remapClamp': 'Remaps a value from one range to another and clamps the result.',

    'utils/remapClamp': 'Remaps a value from one range to another and clamps the result.',
    'utils/rotate2D': 'Rotates a 2D vector by an angle.',
    'utils/rotate': 'Rotates a 2D or 3D vector.',
    'utils/rotation3d': 'Rotates a 3D vector around an axis by an angle.',
    'utils/transformDirection': 'Transforms a direction vector by a matrix.',
    'utils/fresnel': 'Computes a Fresnel term from normal and view direction.',
    'utils/spherizeUV': 'Applies a spherical warping effect to UV coordinates.',
    'utils/rotateUV': 'Rotates UV coordinates around a center point by an angle.',
    'utils/polarUV': 'Converts cartesian UV coordinates to polar coordinates (radius, angle).',
    'utils/hslToRgb': 'Converts HSL values to RGB.',
    'utils/checker': 'Generates a checker pattern from UV coordinates.',
    'utils/linearGradient': 'Generates a linear color gradient using ordered color stops.',
    'utils/sdfCircle2D': 'Returns signed distance to a 2D circle.',
    'utils/sdfBox2D': 'Returns signed distance to a 2D axis-aligned box.',
    'utils/sdfRoundedBox2D': 'Returns signed distance to a 2D rounded box.',
    'utils/sdfCapsule2D': 'Returns signed distance to a 2D capsule defined by two points.',
    'utils/sdfCross2D': 'Returns signed distance to a 2D cross shape.',

    'advanced/varying': 'Computes the node in the vertex stage and interpolates it to the fragment stage.',
    'advanced/var': 'Creates a temporary variable for reuse in shader code.',
    'advanced/linearDepth': 'Returns linear depth for the current fragment.',
    'advanced/linearDepthFrom': 'Converts depth to linear depth.',
    'advanced/perspectiveDepthToViewZ': 'Converts perspective depth to view-space Z.',
    'advanced/viewZToOrthographicDepth': 'Converts view-space Z to orthographic depth.',
    'advanced/output': 'Outputs a vec4 fragment color.',
    'advanced/frontFacing': 'True for front-facing fragments.',
    'advanced/viewportLinearDepth': 'Returns linear depth from the viewport.',
    'advanced/hash': 'Generates a deterministic pseudo-random float in the range [0, 1) from a seed.',
    'advanced/hashBlur': 'Applies a fast hash-based blur to a texture input.',

    'geo/camera': 'Returns camera near and far plane values.',
    'geo/cameraPosition': 'Returns the camera position in world space.',
    'geo/cameraViewMatrix': 'Returns the camera view matrix.',
    'geo/screenUV': 'Returns screen-space UV coordinates.',
    'geo/viewportUV': 'Returns UV coordinates normalized to the current viewport.',
    'geo/screenCoordinate': 'Returns screen-space coordinates in pixels.',
    'geo/resolution': 'Returns the screen resolution.',
    'geo/viewportSize': 'Returns the viewport resolution in pixels.',
    'geo/viewportCoordinate': 'Returns the fragment coordinate relative to the viewport, in pixels.',
    'geo/time': 'Returns the current time in seconds.',

    'global/ref': 'Reads a global value.',
    'local/set': 'Captures an upstream value as a reusable local portal source.',
    'local/get': 'Reads from a Set Local portal source.',

    'const/uniform': 'Creates a dynamic uniform value.',

    'logic/and': 'Boolean AND of A and B.',
    'logic/or': 'Boolean OR of A and B.',
    'logic/xor': 'Boolean XOR of A and B.',
    'logic/not': 'Boolean NOT of input.',
    'logic/discard': 'Discards the fragment when the condition is true.',

    'assign/assign': 'Assigns value to target.',
    'assign/addAssign': 'Adds value to target and assigns.',
    'assign/subAssign': 'Subtracts value from target and assigns.',
    'assign/mulAssign': 'Multiplies target by value and assigns.',
    'assign/divAssign': 'Divides target by value and assigns.',
    'assign/modAssign': 'Assigns target modulo value.',
    'assign/minAssign': 'Assigns the minimum of target and value.',
    'assign/maxAssign': 'Assigns the maximum of target and value.',
    'assign/bitAndAssign': 'Bitwise AND assignment.',
    'assign/bitOrAssign': 'Bitwise OR assignment.',
    'assign/bitXorAssign': 'Bitwise XOR assignment.',
    'assign/shiftLeftAssign': 'Bitwise left shift assignment.',
    'assign/shiftRightAssign': 'Bitwise right shift assignment.',

    'loop': 'Loop group container.',
    'loop/count': 'Defines the loop count.',
    'loop/start': 'Defines the loop start value.',
    'loop/end': 'Defines the loop end value.',
    'loop/index': 'Outputs the current loop index.',
    'loop/count2': 'Defines the nested loop count.',
    'loop/index2': 'Outputs the nested loop index.',
    'loop/accumulator': 'Accumulates values across loop iterations.',
    'loop/condition': 'Provides the loop condition.',
    'loop/output': 'Outputs the loop result.',
};

function fallbackDescription(def: BaseNodeDef): string {
    if (def.category === 'Material') return `Material output node for ${def.label}.`;
    if (def.category === 'Post') return `Post-processing node: ${def.label}.`;
    if (def.category === 'Loop') return `Loop node: ${def.label}.`;
    if (def.type.startsWith('const/')) return `Creates a constant ${def.label} value.`;
    return `TSL node wrapping the ${def.tsl} function.`;
}

function resolveDescription(def: BaseNodeDef): string {
    if (def.description) return def.description;
    const byType = NODE_TYPE_DESCRIPTIONS[def.type];
    if (byType) return byType;
    const byTsl = TSL_WIKI_DESCRIPTIONS[def.tsl];
    if (byTsl) return byTsl;
    return fallbackDescription(def);
}

export function withNodeDescriptions<T extends BaseNodeDef>(defs: readonly T[]): T[] {
    return defs.map((def) => ({ ...def, description: resolveDescription(def) })) as T[];
}
