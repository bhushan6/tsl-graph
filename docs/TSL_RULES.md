# TSL Editor Rules Documentation

Rules derived from the official [Three.js Shading Language Specification](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) and verified through testing with Three.js r182.

---

## Table of Contents

1. [Type System](#1-type-system)
2. [Type Conversion Rules (Verified)](#2-type-conversion-rules-verified)
3. [Swizzling](#3-swizzling)
4. [Operators](#4-operators)
5. [Math Functions](#5-math-functions)
6. [Geometry Attributes](#6-geometry-attributes)
7. [Material Node Properties](#7-material-node-properties)
8. [Visual Editor Connection Rules](#8-visual-editor-connection-rules)

---

## 1. Type System

### 1.1 Constants and Explicit Conversions

Input functions can be used to create constants and do explicit conversions.

| Function | Returns Type |
|----------|--------------|
| `float(node\|number)` | `float` |
| `int(node\|number)` | `int` |
| `uint(node\|number)` | `uint` |
| `bool(node\|value)` | `bool` |
| `color(node\|hex\|r,g,b)` | `color` |
| `vec2(node\|Vector2\|x,y)` | `vec2` |
| `vec3(node\|Vector3\|x,y,z)` | `vec3` |
| `vec4(node\|Vector4\|x,y,z,w)` | `vec4` |
| `mat2(node\|Matrix2\|...)` | `mat2` |
| `mat3(node\|Matrix3\|...)` | `mat3` |
| `mat4(node\|Matrix4\|...)` | `mat4` |
| `ivec2(node\|x,y)` | `ivec2` |
| `ivec3(node\|x,y,z)` | `ivec3` |
| `ivec4(node\|x,y,z,w)` | `ivec4` |
| `uvec2(node\|x,y)` | `uvec2` |
| `uvec3(node\|x,y,z)` | `uvec3` |
| `uvec4(node\|x,y,z,w)` | `uvec4` |
| `bvec2(node\|x,y)` | `bvec2` |
| `bvec3(node\|x,y,z)` | `bvec3` |
| `bvec4(node\|x,y,z,w)` | `bvec4` |

### 1.2 Method Chaining Conversions

| Method | Returns Type |
|--------|--------------|
| `.toFloat()` | `float` |
| `.toInt()` | `int` |
| `.toUint()` | `uint` |
| `.toBool()` | `bool` |
| `.toColor()` | `color` |
| `.toVec2()` | `vec2` |
| `.toVec3()` | `vec3` |
| `.toVec4()` | `vec4` |

---

## 2. Type Conversion Rules (Verified)

> Tested with Three.js r182 WebGPU renderer. All conversions below compile and render successfully.

### 2.1 Automatic Conversions Summary

TSL performs **automatic type conversions** between all numeric types. The following have been verified:

| From | To | Status | Behavior |
|------|----|--------|----------|
| `float` | `vec2` | ✓ Valid | Broadcasts to all components |
| `float` | `vec3` | ✓ Valid | Broadcasts to all components |
| `float` | `vec4` | ✓ Valid | Broadcasts to all components |
| `float` | `color` | ✓ Valid | Broadcasts to RGB |
| `int` | `float` | ✓ Valid | Converts to float |
| `vec2` | `float` | ✓ Valid | Extracts first component |
| `vec2` | `vec3` | ✓ Valid | Expands (pads with 0) |
| `vec2` | `color` | ✓ Valid | Expands to RGB |
| `vec3` | `float` | ✓ Valid | Extracts first component |
| `vec3` | `vec2` | ✓ Valid | Truncates to xy |
| `vec3` | `vec4` | ✓ Valid | Expands (pads with 0 or 1) |
| `vec3` | `color` | ✓ Valid | Direct mapping |
| `vec4` | `float` | ✓ Valid | Extracts first component |
| `vec4` | `vec2` | ✓ Valid | Truncates to xy |
| `vec4` | `vec3` | ✓ Valid | Truncates to xyz |
| `vec4` | `color` | ✓ Valid | Truncates to rgb |
| `color` | `float` | ✓ Valid | Extracts first component (r) |
| `color` | `vec3` | ✓ Valid | Direct mapping |

### 2.2 Mixed-Type Operations

Math operations work with mixed types:

| Operation | Status | Example |
|-----------|--------|---------|
| `float × vec3` | ✓ Valid | `float(2).mul(vec3(1,2,3))` |
| `vec3 × float` | ✓ Valid | `vec3(1,2,3).mul(float(2))` |
| `vec3 + float` | ✓ Valid | `vec3(1,2,3).add(float(1))` |
| `mat4 × vec4` | ✓ Valid | `modelWorldMatrix.mul(vec4(1,0,0,1))` |

### 2.3 Conversion Behavior

| Conversion Type | Behavior |
|-----------------|----------|
| **Scalar → Vector** | Scalar value broadcasts to all components |
| **Vector → Scalar** | First component (x/r) is extracted |
| **Larger → Smaller Vector** | Truncates extra components |
| **Smaller → Larger Vector** | Pads with zeros (or 1 for w component) |
| **Color ↔ Vec3** | Equivalent types, direct mapping |

---

## 3. Swizzling

Verified swizzle operations:

| Notation | Result | Status |
|----------|--------|--------|
| `vec3.x` | `float` | ✓ Valid |
| `vec3.xy` | `vec2` | ✓ Valid |
| `vec3.zyx` | `vec3` (reversed) | ✓ Valid |
| `vec3.rgb` | `vec3` | ✓ Valid |
| `vec4.a` | `float` | ✓ Valid |

**Component Identifiers:**
- Position: `x`, `y`, `z`, `w`
- Color: `r`, `g`, `b`, `a`
- Texture: `s`, `t`, `p`, `q`

---

## 4. Operators

| Operator | Description |
|----------|-------------|
| `.add(node\|value, ...)` | Addition |
| `.sub(node\|value)` | Subtraction |
| `.mul(node\|value)` | Multiplication |
| `.div(node\|value)` | Division |
| `.mod(node\|value)` | Modulo |
| `.equal(node\|value)` | Equality check |
| `.notEqual(node\|value)` | Inequality check |
| `.lessThan(node\|value)` | Less than |
| `.greaterThan(node\|value)` | Greater than |
| `.lessThanEqual(node\|value)` | Less than or equal |
| `.greaterThanEqual(node\|value)` | Greater than or equal |
| `.and(node\|value)` | Logical AND |
| `.or(node\|value)` | Logical OR |
| `.not(node\|value)` | Logical NOT |
| `.xor(node\|value)` | Logical XOR |

---

## 5. Math Functions

| Function | Description |
|----------|-------------|
| `abs(x)` | Absolute value |
| `acos(x)` | Arc cosine |
| `asin(x)` | Arc sine |
| `atan(y, x)` | Arc tangent |
| `ceil(x)` | Round up |
| `clamp(x, min, max)` | Constrain to range |
| `cos(x)` | Cosine |
| `cross(x, y)` | Cross product |
| `distance(x, y)` | Distance between points |
| `dot(x, y)` | Dot product |
| `exp(x)` | Natural exponentiation |
| `floor(x)` | Round down |
| `fract(x)` | Fractional part |
| `length(x)` | Vector length |
| `log(x)` | Natural logarithm |
| `max(x, y)` | Maximum value |
| `min(x, y)` | Minimum value |
| `mix(x, y, a)` | Linear interpolation |
| `normalize(x)` | Unit vector |
| `pow(x, y)` | Power |
| `reflect(I, N)` | Reflection direction |
| `refract(I, N, eta)` | Refraction direction |
| `saturate(x)` | Clamp between 0 and 1 |
| `sign(x)` | Sign of value |
| `sin(x)` | Sine |
| `smoothstep(e0, e1, x)` | Hermite interpolation |
| `sqrt(x)` | Square root |
| `step(edge, x)` | Step function |
| `tan(x)` | Tangent |

---

## 6. Geometry Attributes

### 6.1 Position (vec3)

| Variable | Description |
|----------|-------------|
| `positionGeometry` | Position attribute of geometry |
| `positionLocal` | Transformed local position |
| `positionWorld` | Transformed world position |
| `positionView` | View position |

### 6.2 Normal (vec3)

| Variable | Description |
|----------|-------------|
| `normalGeometry` | Normal attribute of geometry |
| `normalLocal` | Local normal |
| `normalView` | View normal |
| `normalWorld` | World normal |

### 6.3 Other Attributes

| Variable | Type | Description |
|----------|------|-------------|
| `uv()` | `vec2` | Texture coordinates |
| `time` | `float` | Elapsed time in seconds |
| `vertexColor()` | `color` | Vertex color |
| `modelWorldMatrix` | `mat4` | World matrix |
| `modelNormalMatrix` | `mat3` | Normal matrix |
| `cameraPosition` | `vec3` | Camera world position |

---

## 7. Material Node Properties

### 7.1 Basic Properties

| Property | Expected Type | Accepts (Verified) |
|----------|---------------|-------------------|
| `.colorNode` | `color/vec4` | float, vec2, vec3, vec4, color |
| `.opacityNode` | `float` | float, int, vec2, vec3, vec4, color |
| `.positionNode` | `vec3` | vec3 |
| `.normalNode` | `vec3` | vec3, color |

### 7.2 MeshStandardNodeMaterial

| Property | Expected Type | Accepts (Verified) |
|----------|---------------|-------------------|
| `.roughnessNode` | `float` | float, int, vec2, vec3, vec4, color |
| `.metalnessNode` | `float` | float, int, vec2, vec3, vec4, color |
| `.emissiveNode` | `color` | float, vec2, vec3, vec4, color |
| `.aoNode` | `float` | float, int, vec2, vec3, vec4, color |

### 7.3 MeshPhysicalNodeMaterial

| Property | Expected Type | Accepts (Verified) |
|----------|---------------|-------------------|
| `.anisotropyNode` | `vec2` | float, vec2, vec3 |
| `.clearcoatNode` | `float` | float, vec2, vec3, vec4 |
| `.sheenNode` | `color` | float, vec2, vec3, color |
| `.transmissionNode` | `float` | float, vec2, vec3, vec4 |
| `.iorNode` | `float` | float, int |

---

## 8. Visual Editor Connection Rules

Based on verified TSL behavior, the visual editor should implement these connection rules:

### 8.1 All Numeric Types Are Compatible

TSL automatically converts between all numeric types. The editor should **allow all connections** between:
- `float`, `int`, `uint`
- `vec2`, `vec3`, `vec4`
- `ivec2`, `ivec3`, `ivec4`
- `color`

### 8.2 Connection Validity Matrix

| From ↓ To → | float | vec2 | vec3 | vec4 | color |
|-------------|-------|------|------|------|-------|
| **float** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **int** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **vec2** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **vec3** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **vec4** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **color** | ✓ | ✓ | ✓ | ✓ | ✓ |

### 8.3 Special Type Restrictions

| Type | Can Connect To |
|------|----------------|
| `mat2` | `mat2` only |
| `mat3` | `mat3` only |
| `mat4` | `mat4` only |
| `sampler2D` | `sampler2D` only |
| `bool` | `bool` only (for conditionals) |

### 8.4 Recommended Visual Indicators

While all numeric connections are valid, the editor may show **visual hints**:

| Conversion | Indicator | Reason |
|------------|-----------|--------|
| `vec2 → vec3` | Info (blue) | Padding with zero |
| `vec3 → float` | Info (blue) | Only .x component used |
| `vec4 → vec3` | Info (blue) | .w component discarded |
| Same type | None | Exact match |

### 8.5 Graph Constraints

| Rule | Description |
|------|-------------|
| **Single Material** | Only one material node per graph |
| **No Cycles** | Graph must be a DAG |
| **One Input** | Each input port accepts one connection |
| **Multiple Outputs** | Output ports can connect to multiple inputs |

---

## Appendix: Test Results Summary

Tested on: Three.js r182 with WebGPU renderer

| Test | Result |
|------|--------|
| Type Creation (float, vec2, vec3, vec4, color) | ✓ Pass |
| Float → Vec3 (colorNode) | ✓ Pass |
| Vec3 → Float (roughnessNode) | ✓ Pass |
| Vec4 → Vec3 (colorNode) | ✓ Pass |
| Vec2 → Vec3 (colorNode) | ✓ Pass |
| Color ↔ Vec3 | ✓ Pass |
| Swizzling (.x, .xy, .zyx, .rgb) | ✓ Pass |
| Mixed Type Math (float×vec3, vec3×float, vec3+float) | ✓ Pass |
| Vec2 → Float | ✓ Pass |
| Int → Float | ✓ Pass |
| Explicit Conversions (.toFloat, .toVec2, .toVec3) | ✓ Pass |
| Geometry Nodes (positionLocal, normalWorld, uv, time) | ✓ Pass |
| UV (vec2) → colorNode | ✓ Pass |
| Position (vec3) → roughnessNode (float) | ✓ Pass |
| WebGPU Shader Compilation | ✓ Pass |
| Matrix Operations (mat4 × vec4) | ✓ Pass |
| Vec4 → Float | ✓ Pass |
| Color → Float | ✓ Pass |
| Float → Vec2 (anisotropyNode) | ✓ Pass |
| Vec3 → Vec2 (anisotropyNode) | ✓ Pass |

---

*Document Version: 2.0*
*Verified with: Three.js r182, WebGPU Renderer*
*Last Updated: January 2026*
