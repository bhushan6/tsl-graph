# Type Inference Feature Review

## Overview

**Commit:** `4a2fce8a2ae1533e3e5b485d8a7a35f0c5180db3`  
**Branch:** `feat/type-inference`  
**Author:** bhushan6  
**Status:** WIP (Work in Progress)

This PR introduces a comprehensive type inference system for the TSL Graph node editor that dynamically resolves input and output types based on connected data flows. The feature enables real-time type propagation through the graph, improving UX with better visual feedback (handle colors) and more accurate type information in the properties panel.

---

## Summary of Changes

### Files Added

1. **`lib/type-inference-context.tsx`** (30 lines)
   - React Context provider for sharing type inference resolver across components
   - Provides `useTypeInferenceResolver()` hook

2. **`lib/local-utils.test.ts`** additions (196 lines)
   - Comprehensive tests for math runtime inference
   - Tests for `createTypeInferenceResolver`, `resolveNodeInputTypeById`
   - Tests covering add, split, remap, remapClamp, range, and multiOp operations

3. **`app/api/tsl-utils-source/route.ts`** (19 lines)
   - New API route to serve `tsl-utils.ts` source code for the Code Panel

### Files Modified

#### Core Type Inference (`lib/local-utils.ts`)

**Before:** ~311 lines with basic type resolution  
**After:** ~796 lines with full inference system

Key additions:
- `TypeInferenceState` interface with memoization support (outputMemo, inputMemo)
- `TypeInferenceResolver` interface with `resolveOutputType` and `resolveInputType` methods
- Matrix type support (`mat2`, `mat3`, `mat4`)
- Math operation type inference:
  - `inferMathOperationType()` - infers output type from TSL function and argument types
  - `inferOperatorResultType()` - handles matrix/vector math rules
  - `inferMathInputFromSiblings()` - propagates types to unconnected inputs
  - `inferMultiOpOutputType()` - chains multi-operation type inference
- Support for special TSL functions: `split`, `remap`, `remapClamp`, `range`, `add`, `sub`, `mul`, `div`
- Fixed-type functions: `length`/`distance`/`dot` → `float`, `all`/`any` → `bool`, `cross` → `vec3`

#### Component Updates

**`components/Editor.tsx`**
- Added `TypeInferenceProvider` wrapper around the canvas
- Creates `typeInferenceResolver` using `graphStructureVersion` as reactive dependency
- Uses resolver for edge drop picker type detection

**`components/TSLNode.tsx`**
- Uses `useTypeInferenceResolver()` hook
- `resolveInputDataType()` and `resolveOutputDataType()` callbacks for handle type resolution
- Fallback to declared types when inference returns `'any'`

**`components/TSLEdge.tsx`**
- Simplified significantly: removed ~59 lines of local type resolution logic
- Now uses `useTypeInferenceResolver()` for both source and target type resolution
- Single line resolution: `typeInferenceResolver.resolveOutputType(source, sourceHandleId ?? 'out')`

**`components/PropertiesPanel.tsx`**
- Displays inferred types alongside declared types: `formatTypeWithInference()` helper
- Shows `declaredType • inferred {inferredType}` format when they differ
- MultiOp nodes show resolved input types per operation input

**`components/CodePanel.tsx`**
- Added tabs for `main.js` and `tsl-utils.js`
- New tabbed UI using `Tabs` component from shadcn/ui
- Fetches tsl-utils source from `/api/tsl-utils-source` endpoint

#### Code Node Scope Removal

**`lib/types.ts`**
- Removed `CodeNodeScope` type
- Removed `scope` field from `CodeNodeDefinition` interface

**`lib/code-node-scope.ts`**
- **DELETED** - No longer needed

**`store/editor.ts`**
- Removed `setCodeNodeScope` method
- Removed `normalizeCodeNodeDefinition` and `normalizeCodeNodesRecord` functions
- Simplified `createCodeNode` - no longer accepts scope parameter
- Code nodes are always saved as templates when template callbacks are available

**`store/editor.code-node-scope.test.ts`**
- **DELETED** - Tests no longer applicable

**`components/CodeNodeDialog.tsx`**
- Removed scope selector UI
- Removed scope-related state and effects
- Simplified save logic

**`components/NodePicker.tsx`**
- Removed project-scoped code node listings
- Added "Create from Code..." button in Custom Nodes section
- Only shows code nodes from templates (user and public)

**`components/EdgeDropNodePicker.tsx`**
- Removed project code node handling
- Only shows template-based code nodes

**`components/StaleTemplatesNotification.tsx`**
- Removed scope-based filtering logic
- Simplified template staleness detection

#### Compiler and Build Changes

**`lib/compiler.ts`**
- Removed `importFrom` field from material node definitions
- Simplified import collection - removed fallback value imports
- Physical material feature-gating keys moved inline

**`lib/nodes/output.ts`**
- Removed `importFrom: 'three/webgpu'` from all material node definitions

**`lib/editor-host/tsl-utils-inline.ts`**
- Removed `tsl-easings` module support
- Simplified from multi-module structure to single module
- Removed all easing function definitions (~300 lines)

**`lib/editor-host/tsl-utils-inline.test.ts`**
- Removed tests for easing inlining
- Updated to reflect simplified API

#### Other Changes

**`lib/ai/tool-runner.ts`**
- Removed `inlineCustomTslImports` usage
- Simplified compileGraph output to not include helper code

**`components/Toolbar.tsx`**
- Removed `onCreateCodeNode` prop
- Simplified `createLoopGroup` calls (no longer accepts viewport center)

**`components/editor-host/EditorHost.tsx`**
- Removed `initialDataRef` pattern
- Persistence uses `initialData` directly

**`store/editor.root-material-lock.test.ts`**
- Removed tests for connection/value preservation during material switching
- Simplified to test basic material node enforcement

**`lib/tsl-builder.ts`**
- Uncommented console.error logging for TSL evaluation errors

**`components/preview/PreviewCanvas3D.tsx`**
- Uncommented console.error for material build errors

**`docs/INSPECTOR_POSTMESSAGE_PROTOCOL.md`**
- Updated to reflect new persistence bridge (`tsl:request:load`, `tsl:request:save`)
- Removed `tsl:command:load` and `tsl:command:clear-graph`

---

## Architecture Analysis

### Type Inference System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     Type Inference Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  Component   │───▶│ TypeInferenceResolver │───▶│  State Store  │  │
│  │  (use hook)  │    │  (context)         │    │  (memoized)  │  │
│  └──────────────┘    └──────────────────┘    └──────────────┘  │
│                              │                                   │
│                              ▼                                   │
│                    ┌──────────────────┐                         │
│                    │ resolveNodeOutput │                         │
│                    │ resolveNodeInput  │                         │
│                    └──────────────────┘                         │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│        ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│        │  Local   │   │   Math   │   │ Declared │              │
│        │  Portal  │   │  Nodes   │   │  Types   │              │
│        └──────────┘   └──────────┘   └──────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Memoization**: Each resolver maintains `outputMemo` and `inputMemo` caches to prevent redundant calculations
2. **Cycle Detection**: Uses `outputStack`/`inputStack` sets to prevent infinite recursion in circular references
3. **Math Type Promotion**: Implements proper GLSL-style type promotion rules:
   - `float` + `vec3` → `vec3`
   - `vec2` + `vec3` → `vec3` (higher dimension wins)
   - Matrix × `float` → Matrix
   - Matrix × `vec3` → `vec3` (for mat3)
4. **Sibling Inference**: Unconnected math inputs inherit types from connected siblings

---

## Code Quality Assessment

### Strengths

1. **Comprehensive Test Coverage**: New tests cover edge cases for math type inference
2. **Performance Conscious**: Memoization prevents expensive re-computation
3. **Clean Architecture**: Context-based dependency injection makes components simpler
4. **Type Safety**: Full TypeScript support with proper interfaces

### Areas of Concern

1. **Large File**: `lib/local-utils.ts` is now ~796 lines - consider splitting into:
   - `lib/type-inference/` directory with:
     - `types.ts` - interfaces and types
     - `math-inference.ts` - math-specific logic
     - `resolver.ts` - main resolver implementation
     - `state.ts` - state management

2. **WIP Commit Message**: Commit is labeled "WIP" - should be cleaned up before merge

3. **Unused Submodule**: `.tmp/pokebox` appears to be accidentally added (git submodule)

4. **Mixed Concerns**: Some changes (code node scope removal, tsl-easings removal) appear unrelated to type inference - consider separate PRs

5. **Breaking Changes**: Code node scope removal is a breaking change that affects:
   - Existing projects with scoped code nodes
   - Template library migration
   - Backward compatibility

---

## Potential Issues

### 1. Type Inference Performance

**Concern**: Recalculating the entire resolver on every `graphStructureVersion` change could be expensive for large graphs.

**Suggestion**: Consider:
- Lazy evaluation per-node
- Incremental updates
- Web Worker for large graphs

### 2. Circular Dependency Detection

```typescript
// Current implementation:
if (state.outputStack.has(cacheKey)) return 'any';
```

This silently returns `'any'` for cycles. Consider:
- Error reporting for debugging
- Visual indicator in UI for circular type references

### 3. Math Operation Type Rules

The `inferOperatorResultType` function has complex logic for matrix operations. Consider adding more test cases for:
- Matrix × Matrix multiplication
- Matrix × Vector with mismatched dimensions
- Mixed int/float operations

### 4. Code Node Scope Migration

Removing scope entirely might break existing workflows. Consider:
- Migration path for existing scoped code nodes
- Deprecation warning before removal
- Backward compatibility layer

---

## Testing Observations

### New Tests Added

1. **Math Runtime Inference Tests** (in `lib/local-utils.test.ts`):
   - `add(float, float)` → all `float`
   - `add(float, vec3)` → all `vec3`
   - Sibling/value/default fallbacks
   - `split` output follows input type
   - `remap`/`remapClamp` output follows `node` input type
   - `range` output uses dominant type from min/max
   - Multi-op chain type propagation
   - `createTypeInferenceResolver` integration

### Test Coverage Gaps

1. Matrix type inference not fully tested
2. Global reference type resolution through locals
3. Subgraph type inference
4. Code node type inference
5. Error cases (malformed nodes, missing edges)

---

## Documentation

### Updated

- `docs/INSPECTOR_POSTMESSAGE_PROTOCOL.md` - persistence protocol changes

### Needs Update

- User-facing documentation for type inference behavior
- Migration guide for code node scope removal
- Architecture diagram for the type inference system

---

## Recommendations

### Before Merge

1. **Split the PR** (if possible):
   - Type inference feature
   - Code node scope removal
   - tsl-easings removal
   - PostMessage protocol changes

2. **Clean up**:
   - Remove `.tmp/pokebox` submodule
   - Improve commit message from "WIP" to descriptive message
   - Run full test suite

3. **Add documentation**:
   - Type inference behavior in user docs
   - Breaking changes notice

4. **Address performance**:
   - Benchmark with large graphs (100+ nodes)
   - Consider optimization if needed

### Long-term

1. **Modularize** `lib/local-utils.ts`
2. **Add visual feedback** for type mismatches
3. **Consider type hints** in node picker
4. **Add type validation** at compile time

---

## Conclusion

The type inference feature is a valuable addition that significantly improves the user experience. The implementation is technically sound with good test coverage and proper memoization. However, the PR mixes several unrelated changes which makes review difficult.

**Recommendation**: 
- ✅ **Approve** the type inference feature (with minor refactoring suggestions)
- ⚠️ **Consider separate PR** for code node scope removal due to breaking changes
- 🔧 **Request changes** for cleanup (WIP commit, submodule removal)

---

## Appendix: Type Inference Examples

### Example 1: Simple Addition
```
[float] ────┐
            ├──[math/add]──→ [vec3]
[vec3] ─────┘

Input types: float, vec3
Output type: vec3 (promoted)
Unconnected inputs: inherit sibling type (vec3)
```

### Example 2: Multi-Op Chain
```
[float] ──┐
          ├──[op1: add]──┐
[vec3] ───┘              ├──[op2: mul]──→ [vec3]
                   [float]─┘

Chain type progression:
- op1: float + vec3 → vec3
- op2: vec3 * float → vec3
```

### Example 3: Local Variable
```
[vec3] ───[local/set "pos"]──┐
                              ├──[local/get]──→ [vec3]
[loop] ...                    │
                              └──(scope check passes)
```
