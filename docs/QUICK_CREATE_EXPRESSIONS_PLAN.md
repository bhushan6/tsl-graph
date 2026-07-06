# Quick-Create Expressions v2 — Implementation Plan

> **Status (July 2026):** All phases implemented in `lib/quick-create/`.
> Phases 1–4: tokenizer, Pratt parser, registry catalog, inference, folding
> builder, swizzles, method chains, ternary, `$` source refs,
> evaluated-constant suggestion, `resolveDropParentGroup` extraction.
> Phase 5 (`assist.ts` + picker): tolerant mid-keystroke repair
> ("sin(time" suggests "sin(time)"), in-expression name completions,
> type badges on suggestions, inline syntax cheatsheet in the picker footer.

Extend the right-click / edge-drop quick-create feature from "literals + `+ - * /`"
into a mini TSL expression compiler that can build meaningful node subgraphs from
things like:

```
sin(time * 2) * 0.5 + 0.5
mix(red, blue, uv.x)
smoothstep(0.2, 0.8, noise)
uv.x > 0.5 ? red : blue
uv().mul(2).sub(1)
```

## 1. Current state

- [lib/quick-create-constants.ts](../lib/quick-create-constants.ts) — parses single
  literals: numbers (`3` → `const/float`, int suggestion), `vecN(...)`, `float(x)`,
  `int(x)`, hex colors, CSS color names.
- [lib/quick-create-expressions.ts](../lib/quick-create-expressions.ts) — hand-rolled
  recursive-descent parser for `+ - * /` with parens. Leaves must be constants
  (delegates to `parseQuickCreateConstant`). Builds an AST, infers the result type
  with GLSL-style promotion (incl. matrices), and `buildQuickCreateExpressionGraph`
  lays nodes out in depth-based columns and wires `a`/`b` handles of
  `math/add|sub|mul|div`.
- [components/EdgeDropNodePicker.tsx](../components/EdgeDropNodePicker.tsx) surfaces
  both suggestion lists; [components/CanvasEdgeDropPicker.tsx](../components/CanvasEdgeDropPicker.tsx)
  inserts the graph and connects `outputNodeId` to the drop-source handle when the
  picker was opened by dragging backward from an input.

Key asset we're not using yet: **every `NodeDef` in the registry has a required
`tsl` name plus ordered, typed, defaulted inputs** ([lib/types.ts](../lib/types.ts)).
That means the function catalog for the parser can be generated from the registry
instead of hand-written.

## 2. What to support (prioritized by user value)

### Tier 1 — biggest wins
1. **Function calls** — `sin(x)`, `clamp(x, 0, 1)`, `mix(a, b, t)`, `pow(x, 2)`,
   `smoothstep(0, 1, x)` … every Math/Logic/Noise/Easing/SDF node becomes callable
   by its `tsl` name. This is the core of the feature.
2. **Input identifiers** — `uv`, `time`, `positionLocal`, `normalWorld`, `PI`,
   `EPSILON` … zero-required-input registry nodes referenced by name. Without
   these, expressions can only combine constants; with them, `sin(time * 2)` works
   and the feature becomes an actual shader-authoring accelerator.
3. **Literal folding into input values** — `clamp(x, 0, 1)` should NOT create two
   `const/float` nodes; the `0` and `1` become `values.min` / `values.max` on the
   clamp node (unconnected handles already render scrubbers). Rule:
   - scalar literal feeding a node input → fold into `values`
   - vec/color literal → keep as a `const/*` node (an `any` input's inline widget
     can't represent them reliably)
   - top-level bare literal (`3`) → unchanged, still a const node
   - Optional: apply the same folding to `3 - 2` (one `math/sub` with `a=3, b=2`
     instead of 3 nodes). Recommended — but it changes existing behavior, so gate
     it behind the same folding rule and update tests deliberately.
4. **More operators** — `%` → `math/mod`, `**` (and `^` alias) → `math/pow`,
   unary `-` → `math/negate` (fold into the literal when the operand is a number),
   `!` → `logic/not`.

### Tier 2 — strong TSL ergonomics
5. **Swizzles / member access** — `uv.x` → `math/split` using its `x` output
   handle (split already exposes `x|y|z|w` outputs, no new node needed).
   Multi-component swizzles (`pos.xy`) → `math/split` + `const/vec2` recombine,
   or a dedicated swizzle node later (stretch).
6. **Method chaining** — `uv().mul(2).sub(1)`, `time.sin()`. Postfix calls resolve
   through the same catalog with the receiver as first argument. This lets users
   paste real TSL snippets from three.js docs/examples straight into the picker —
   arguably the highest "wow" per line of code.
7. **Comparisons + ternary** — `< > <= >= ==` → `logic/lessThan` etc.,
   `&&`/`||` → `logic/and|or`, `cond ? a : b` → `logic/select`
   (`cond`/`trueVal`/`falseVal`).
8. **`color(r, g, b)` and `uniform(x)` constructors** — trivially fills gaps in
   the constant parser (`const/color`, `const/uniform`).

### Tier 3 — context-aware / polish
9. **Source reference in edge-drop context** — when the picker opened from a
   dragged edge, a token like `$` (or `in`/`_`) refers to the dragged source:
   drag from a noise output, type `$ * 0.5 + 0.5`, and the source gets wired into
   the expression. Turns the feature into an inline "math on this wire" tool.
10. **Evaluated-constant alternative suggestion** — for numeric-only expressions
    show both entries: "Create Expression 3 - 2" and "Create Float 1 (evaluated)".
11. **Project globals by name** — identifier resolution falls back to the
    project's globals/locals (`global/ref` with `globalId`, `local/get`). Stretch.
12. **Leaf deduplication (CSE)** — `uv.x * uv.y` creates one `geo/uv` + one split,
    not two of each. Dedupe only pure zero-input identifier leaves.

## 3. Architecture

### 3.1 New module layout (all pure + unit-testable, mirroring current style)

```
lib/quick-create/
  tokenizer.ts        — token stream: numbers, identifiers, operators, punctuation
  parser.ts           — Pratt (precedence-climbing) parser → AST
  catalog.ts          — registry-derived function/identifier tables
  infer.ts            — type inference over the AST (move getTypeLength etc. here)
  build-graph.ts      — AST → { nodes, edges, outputNodeId } (evolves current builder)
  index.ts            — parseQuickCreateExpression / suggestions / build API
lib/quick-create-constants.ts   — stays; still owns standalone-literal suggestions
```

Keep the existing exported API shape (`QuickCreateExpressionIntent`,
`buildQuickCreateExpressionGraph`) so the two picker components barely change.

### 3.2 AST

```ts
type ExprNode =
  | { kind: 'literal';  intent: QuickCreateConstantIntent }        // numbers, vecN, colors
  | { kind: 'ident';    name: string; entry: IdentifierEntry }      // time, uv, PI…
  | { kind: 'call';     entry: FunctionEntry; args: ExprNode[] }    // sin(x), mix(a,b,t)
  | { kind: 'unary';    op: '-' | '!'; operand: ExprNode }
  | { kind: 'binary';   op: BinaryOp; left: ExprNode; right: ExprNode }
  | { kind: 'ternary';  cond: ExprNode; ifTrue: ExprNode; ifFalse: ExprNode }
  | { kind: 'member';   object: ExprNode; swizzle: string }         // .x .xy .rgb
  | { kind: 'sourceRef' };                                          // $ / in
```

Method calls (`x.mul(2)`) are normalized in the parser into
`{ kind: 'call', args: [x, 2] }` — the builder never knows the difference.

### 3.3 Tokenizer + Pratt parser

Replace the recursive-descent class. Precedence (low → high), matching JS/GLSL:

| prec | operators                     |
|------|-------------------------------|
| 1    | `?:` (right-assoc)            |
| 2    | `\|\|`                        |
| 3    | `&&`                          |
| 4    | `==`                          |
| 5    | `<` `>` `<=` `>=`             |
| 6    | `+` `-`                       |
| 7    | `*` `/` `%`                   |
| 8    | `**` / `^` (right-assoc)      |
| 9    | unary `-` `!`                 |
| 10   | postfix: call `()`, member `.`|

Notes:
- Unary `-` before a number literal folds into the literal (preserves current
  `-2` behavior); otherwise emits `math/negate`.
- Bare-constant inputs must not produce expression suggestions (the constants
  path owns them). Current gate is `hasOperatorNode`; new gate: **suggest only if
  the AST is more than a single `literal` node.** A bare `sin(3)` is a call and
  should qualify.
- Keep the whole thing failure-tolerant: any parse error → `null`, picker falls
  back to normal search. Never throw.

### 3.4 Registry-driven catalog (`catalog.ts`)

Built lazily once (module-level memo) from `registry.all()`:

```ts
interface FunctionEntry {
  tslName: string;              // 'sin', 'mix', 'smoothstep', …
  nodeType: NodeType;
  inputHandles: string[];       // Object.keys(def.inputs) — insertion order
  inputDefs: Record<string, Port>;
  outputHandle: 'out';
  outputType: TSLType;          // def.outputs.out.type ('any' → infer from args)
}
interface IdentifierEntry {
  tslName: string;              // 'time', 'uv', 'positionLocal', 'PI', …
  nodeType: NodeType;
  outputHandle: string;
  outputType: TSLType;
}
```

Rules:
- **Category allowlist** to start: `Math`, `Logic`, `Noise`, `Easing`, plus the
  SDF/rotate utils. Explicitly exclude texture/material/output/post/loop/subgraph
  nodes — they need canvas context and would produce broken graphs.
- **Functions** = allowlisted defs with ≥1 input; callable with `1..N` positional
  args (missing args keep `Port.default`, extra args → parse failure).
- **Identifiers** = allowlisted defs whose inputs are all optional/defaulted and
  that conceptually are "sources" (`geo/*`, `math/PI|EPSILON|…`). `uv` works both
  bare and as `uv(1)` (its `index` input).
- **Aliases** map: `lerp → mix`, `frac → fract`, `saturate` (exists), `atan2 → atan`,
  `not`, plus operator aliases above. Case-insensitive lookup.
- **Arg-order audit**: registry input order was authored from TSL signatures
  (`atan(y, x)`, `step(edge, x)`, `smoothstep(edge0, edge1, x)`, `clamp(x, min, max)`)
  so positional mapping should be correct — but add a one-time audit + an
  `argOrder?: string[]` override field for exceptions found during testing.
- **Name collision:** `tan` is both a CSS color and a function. Disambiguation is
  syntactic: identifier followed by `(` → function; bare identifier → try
  identifier table first, then color name. (Bare `tan` staying a color matches
  today's behavior; bare `time` is not a color so no conflict.)

Add a catalog unit test that walks every generated entry and asserts the node
type exists in the registry and handles are valid — this keeps the catalog
honest as nodes are added/renamed.

### 3.5 Type inference (`infer.ts`)

- Move `getTypeLength` / `isMatrixType` / `resolveBinaryOperatorResultType` here.
- `call`: if `def.outputs.out.type !== 'any'` use it; otherwise promote across
  arg types with the existing binary rules (matches TSL's behavior for
  `sin`, `mix`, `clamp`, …). Special-case the few reducers whose `any` output is
  actually scalar if any slip through the audit (e.g. verify `length`, `dot`).
- `member`: swizzle length → `float` / `vec2` / `vec3` / `vec4`.
- `ternary`: promote(ifTrue, ifFalse). Comparisons/boolean ops → `bool`.
- Surface the inferred type in the suggestion label:
  `Create Expression sin(time * 2) → float`.

### 3.6 Graph builder (`build-graph.ts`)

Evolves the current builder; same options/return contract.

- `call` nodes: create the node, connect non-literal args to `inputHandles[i]`
  by edge, fold scalar-literal args into `values[handle]` (Tier-1 item 3),
  set `connected` only for real edges.
- `member`: emit `math/split`, return output handle `x|y|z|w` for 1-component
  swizzles (builder must support non-`'out'` output handles — small type change:
  `outputHandleId: string`). Multi-component: split + `const/vecN` with each
  component edge-wired.
- `ternary`: `logic/select` with `cond`/`trueVal`/`falseVal`.
- `sourceRef`: no node created; the arg's edge source is the picker's
  `sourceNodeId`/`sourceHandleId` (passed via new builder option). Only offered
  when the picker context has a source; otherwise `$` fails the parse.
- Layout: keep depth-column layout (`depth = max child depth + 1` instead of
  recursion depth once leaves can be shared), leaves stacked with `VERTICAL_GAP`.
  Dedupe identifier leaves via a `Map<tslName, builtNode>` (Tier 3, item 12 —
  can ship later; layout already tolerates shared sources since edges are by id).

### 3.7 Picker integration

- `EdgeDropNodePicker`: no structural change — same two `useMemo` suggestion
  hooks. Pass `hasEdgeSource` / source data type into
  `getQuickCreateExpressionSuggestions(search, context)` so `$` and the
  evaluated-constant suggestion can be offered contextually.
- `CanvasEdgeDropPicker.handleQuickCreateExpression`: pass
  `{ sourceNodeId, sourceHandleId }` into `buildQuickCreateExpressionGraph`
  options for `sourceRef` wiring. Forward-drag case (dragging from an output)
  currently doesn't connect expressions at all — `$` fixes that naturally.
- **Refactor note:** the group-ancestor/parent-position logic is duplicated
  between `handleNodeSelect` and `handleQuickCreateExpression` (~80 lines each).
  Extract a shared `resolveDropParentGroup()` helper while in there.

## 4. Phases

Each phase ships independently and keeps all existing tests green.

**Phase 1 — Parser rewrite + functions + identifiers (core value)**
- `lib/quick-create/` scaffolding: tokenizer, Pratt parser producing the current
  feature set (`+ - * /`, parens, literals) with identical outputs → port existing
  tests over first, then extend.
- `catalog.ts` from registry (+ audit test), `call` + `ident` AST/build/infer.
- Literal-arg folding into `values`.
- Estimated: the bulk of the work; everything after this is incremental.

**Phase 2 — Operators**
- `%`, `**`/`^`, unary `-`/`!`, comparisons, `&&`/`||`, ternary → `logic/select`.

**Phase 3 — TSL ergonomics**
- Swizzles via `math/split` (non-`out` output handle support in builder).
- Method-call chaining (`.mul(2).sin()`), `color()`/`uniform()` constructors.

**Phase 4 — Context & cleanliness**
- `$` source reference (+ picker plumbing), evaluated-constant second suggestion,
  identifier-leaf dedup, shared `resolveDropParentGroup()` extraction.

**Phase 5 — Polish**
- Tolerant/partial parsing while typing (extend the existing vec-completion
  idea: auto-close parens, ignore trailing operator) so suggestions appear
  mid-keystroke.
- Type badge in suggestion label; maybe function-name completion inside
  expressions (reuse `tsl-completions.ts` data).
- Docs/tutorial: a "cheatsheet" popover in the picker footer.

## 5. Edge cases & decisions

- **`3 - 2` behavior change** (folding vs const nodes): recommended to fold —
  fewer nodes, values still scrubbable — but it's a visible behavior change;
  decide explicitly and update `quick-create-expressions.test.ts` fixtures.
- **No constant folding of the math itself** by default (`3 - 2` builds a sub
  node, not `1`) — that's the point of the feature; the *evaluated* variant is a
  separate suggestion. Never fold `x / 0`.
- **`tan`/color collisions**: call syntax → function; bare → identifier table,
  then color (documented in catalog).
- **Arity errors** (`mix(1,2,3,4)`), unknown identifiers, unclosed parens → parse
  returns `null`, picker falls back to node search. No error UI needed in v1.
- **`geo/uv` and friends with optional inputs**: valid both as identifier and call.
- **Int vs float literals inside expressions**: keep current behavior — bare
  numbers are floats inside expressions (int alternative only for standalone
  constants).
- **Undo**: unchanged — single `takeSnapshot()` before insert covers the whole
  subgraph.

## 6. Testing

- Port all existing `quick-create-expressions.test.ts` cases to the new parser
  unchanged (regression gate for Phase 1).
- New parser tests: precedence table, associativity (`2 ** 3 ** 2`, `a - b - c`),
  unary folding, ternary nesting, method-chain normalization, swizzles, `$`,
  failure cases (unknown fn, extra args, trailing garbage).
- Catalog audit test (every entry resolves against the registry).
- Builder tests: handle wiring order for `mix`/`clamp`/`atan`, literal folding
  into `values`, split output-handle selection, select wiring, sourceRef edge,
  dedup, parent-group offset math (existing coverage).
- Infer tests: `any`-output promotion (`sin(vec3) → vec3`, `mix(color, color, float)
  → color`), comparison → bool, swizzle sizes.
