# Ping-Pong (Feedback) Buffers in the Post-Processing Graph — Research & Plan

## 1. Verdict: is it useful?

**Yes — it is arguably the highest-leverage feature you can add to the post graph.**

Today the post graph is *stateless*: every node is a pure function of the current
frame. The single exception is `postfx/afterImage`, which secretly contains a
ping-pong buffer inside three.js's `AfterImageNode` — but its combine function is
hard-coded (threshold + damp + max). A generic feedback buffer is "afterImage with
a user-defined update function", and it converts the post graph from a
color-grading toy into a **simulation playground**:

| Effect class | Examples |
|---|---|
| Trails & echo | custom motion trails, ghosting, long-exposure, datamosh-style smear |
| Video feedback | infinite zoom, kaleidoscope feedback, "camera pointed at its own monitor" |
| Temporal accumulation | progressive blur, noise smoothing for stochastic effects, cheap TAA-ish AA |
| Simulations | reaction-diffusion, Game of Life, ripple/water, ink advection, slime mold |
| Interactive | paint-on-screen, heat maps that fade, snow/sand deformation that heals |

Every mature tool in this space has it, because feedback is what makes people's
most-shared shaders possible:

- **ShaderToy** — Buffer A–D passes; a buffer can sample its own previous frame.
  The most famous ShaderToy shaders (fluids, reaction-diffusion) are all feedback.
- **Unity** — [Custom Render Textures with `doubleBuffered`](https://docs.unity3d.com/ScriptReference/CustomRenderTexture-doubleBuffered.html)
  plus dedicated Shader Graph nodes that expose the previous frame's texture
  ([official example: self-healing snow deformation](https://docs.unity3d.com/Packages/com.unity.shadergraph@17.0/manual/Custom-Render-Texture-Example.html)).
- **TouchDesigner** — the Feedback TOP, the backbone of most TD visuals.
- **three.js community** — recurring forum topics on exactly this in TSL:
  [ping-pong in a post-processing pass](https://discourse.threejs.org/t/ping-pong-buffer-in-postprocessing-pass/87154),
  [recreating WebGL ping-pong with WebGPU + TSL](https://discourse.threejs.org/t/struggling-to-recreate-webgl-ping-pong-buffers-with-webgpu-and-tsl/87462),
  [render-to-texture feedback trails](https://discourse.threejs.org/t/recursive-trail-ping-pong-three-js-render-to-texture-feedback/89718).
  There is demand and no good node-based tool for it in the three.js ecosystem.

**Honest caveats** (why it's the hardest node type in the system):

- It breaks the "pure DAG" model — feedback is a cycle in *time*, so the graph
  representation needs a deliberate design (solved below without touching cycle
  detection).
- It's stateful: needs lifecycle (create/persist/resize/reset/dispose), which no
  current node has.
- The update function must render in its **own fullscreen pass**, so the compiler
  must extract part of the graph into a separate `Fn` — a new compiler capability.
- Exported code needs a small runtime class shipped with it.

None of these are blockers; the codebase already has the right primitives
(see §3).

---

## 2. How ping-pong works (recap)

A GPU cannot read and write the same texture in one pass. So you keep **two**
render targets: read from A (previous frame's state) while writing to B, then
swap. `AfterImageNode.js` in three.js is a complete, working reference:

```
updateBefore(frame):
    resize RTs to drawing buffer size
    point read-texture-node at oldRT, write target at compRT
    render fullscreen QuadMesh whose material.fragmentNode = updateFn   // TSL!
    swap(oldRT, compRT)

getTextureNode(): passTexture(this, compRT.texture)   // this frame's result
```

The generic version replaces the hard-coded `updateFn` with a TSL function
compiled from the user's graph.

---

## 3. What the codebase already gives us

| Existing piece | How it helps |
|---|---|
| `postfx/afterImage` wrapper + `AfterImageNode` (`node_modules/three/examples/jsm/tsl/display/AfterImageNode.js`) | Exact template for the runtime class: `TempNode` subclass, 2 RTs, `QuadMesh`, `NodeMaterial`, `updateBefore` render+swap, `passTexture` output, `setSize`, `dispose`. |
| `local/set` / `local/get` nodes (`lib/nodes/local.ts`, `lib/local-utils.ts`) | Proven UI + compiler pattern for **two nodes linked by name** with hidden dependency edges (`withLocalDependencyEdges`). Feedback Write/Read reuses this mental model, so the DAG stays acyclic and `hasCycle` (Editor.tsx:455) is untouched. |
| `uniform-store.ts` (`ensureUniform` keyed by id) | Pattern for **state that survives graph rebuilds**. A sibling `feedback-store.ts` keyed by node id keeps buffer contents alive while the user tweaks sliders (rebuilds happen on every `graphStructureVersion` bump in `PreviewCanvas3D.tsx`). |
| `compilePostGraph` → synthetic subgraph → `Fn` (`lib/compiler.ts:1522`) | The machinery for compiling a node subset into a standalone `Fn` already exists; buffer update functions are "one more Fn per write node". |
| `inlineCustomTslImports` (`lib/editor-host/tsl-utils-inline.ts`, used by `CodePanel.tsx`) | Export story: the feedback runtime class gets inlined into exported code the same way custom TSL utils already are. |
| Debug preview (`buildTSLPostDebugOutputNode`) | Needs a rule for feedback nodes (see §7), but the partial-graph machinery already exists. |

---

## 4. Core design decision: representing a loop in a DAG

Three options considered:

1. **Single node with `previous` output and `write` input** — user wires
   `previous → effects → write` on the same node. Creates a literal ReactFlow
   cycle; requires exempting feedback nodes from `hasCycle` and from the
   compiler's topological sort. Invasive and confusing ("why is this cycle
   allowed but not others?").
2. ✅ **Two linked nodes — `Feedback Write` + `Feedback Read` (recommended)** —
   like `local/set`/`local/get`, linked by buffer name. The graph stays a pure
   DAG because the read node has *no intra-frame dependency* on the write node
   (it reads last frame's texture). Zero changes to cycle detection. Matches
   Unity's model (write = the CRT material output, read = "previous frame" node)
   and ShaderToy's (a buffer samples its own previous frame as a channel input).
3. **ShaderToy-style multi-pass tabs** (each buffer is its own sub-graph/tab) —
   most powerful, but a much larger editor/store/UI change. Deferred to Phase 3;
   the two-node design is forward-compatible with it.

### Node definitions (Phase 1)

**`post/feedbackWrite` — "Feedback Buffer"** (one per buffer; sink like `post/output`)
- Inputs:
  - `state: vec4` (connectionOnly) — the new buffer contents for this frame.
- Properties (propertyOnly):
  - `name: string` — unique buffer name (validated).
  - `precision: 'unorm8' | 'half' | 'float'` — default **`half`** (unorm8 destroys
    simulations via clamping/banding; AfterImage inherits input type, we should not).
  - `filter: 'linear' | 'nearest'` — nearest is required for Game-of-Life-style
    cellular sims; linear for fluids/trails. Default linear.
  - `wrap: 'clamp' | 'repeat' | 'mirror'` — default clamp.
  - `resolutionScale: float` — 1.0 = drawing buffer size; 0.5/0.25 for cheap sims.
  - `iterations: int` (default 1) — sub-steps per frame (reaction-diffusion needs
    ~8–10; with ping-pong this is just render+swap N times inside `updateBefore`).
- Outputs: `out: vec4` — convenience passthrough of the *updated* buffer
  (equivalent to reading the buffer after this frame's update), so the common
  "sim → screen" wiring is one edge.

**`post/feedbackRead` — "Previous Frame"** (any number per buffer)
- Properties: `buffer: string` — dropdown of declared buffer names (same UX as
  `local/get`'s source picker).
- Inputs: `uv: vec2` (optional, defaults to `screenUV`) — sampling with a
  transformed UV is what makes zoom/rotate feedback effects work.
- Outputs:
  - `color: vec4` — sample of previous frame's buffer at `uv`.
  - `texture: texture` — raw texture for the existing `texture/sampleNode`
    and blur postfx nodes.

Semantics to document plainly in the node docs: *reads always return last frame's
value; the loop closes across frames, which is why no cycle exists in the graph.*
Cross-buffer reads (B reads A) are allowed and inherit one-frame latency.

---

## 5. Runtime design: `FeedbackBufferNode`

New file `lib/feedback-buffer.ts` (kept out of `tsl-utils.ts` so it can be
selectively inlined into exports):

```
class FeedbackBufferNode extends TempNode {
    constructor(name, config)            // 2× RenderTarget(1,1,{depthBuffer:false, type, filter, wrap})
    setUpdateNode(tslNode)               // fragmentNode of internal NodeMaterial
    getPreviousTextureNode()             // texture(oldRT.texture)  — what Read nodes sample
    getTextureNode()                     // passTexture(this, compRT.texture) — 'out' after update
    updateBefore(frame)                  // for i in iterations: render quad → compRT; swap
    setSize(w, h)                        // drawingBufferSize × resolutionScale; clear on resize
    reset()                              // clear both RTs (also guards NaN poisoning)
    dispose()
}
export const feedbackBuffer = (name, config) => new FeedbackBufferNode(name, config);
```

Plus `lib/feedback-store.ts` mirroring `uniform-store.ts`:

- `ensureFeedbackBuffer(key, config)` — returns existing instance if config is
  unchanged (state survives rebuilds → tweaking a slider doesn't reset your sim);
  recreates + disposes if precision/scale/filter changed.
- `pruneFeedbackBuffers(activeKeys)` / `disposeAllFeedbackBuffers()` — called from
  `PreviewCanvas3D` on rebuild/unmount. (Side benefit: this introduces the
  dispose-on-rebuild hook that today's postfx nodes like bloom/afterImage lack —
  their RTs currently leak on every graph rebuild.)
- `resetFeedbackBuffer(key)` — wired to a "Reset" button on the node UI and a
  global "Reset simulations" action in preview controls.

Registered in `createTSLRuntimeScope()` (`lib/tsl-builder.ts`) as
`__feedbackBuffer: ensureFeedbackBuffer` alongside `__uniform`.

Pass ordering is handled by three.js itself: `updateBefore` on referenced nodes
runs before the main pass, exactly like `AfterImageNode` and `pass()` today. The
scene color/depth/normal texture nodes can be sampled inside the buffer's update
function because they're independent pass textures.

---

## 6. Compiler changes (`lib/compiler.ts`)

`compilePostGraph` grows a partitioning step:

1. Find all `post/feedbackWrite` nodes; validate unique non-empty names.
2. For each write node, compute the upstream closure of its `state` input
   (reuse `getAncestorNodeIds` logic from `tsl-builder.ts`). Compile that
   closure into its own `Fn` — **the update function** — in which:
   - `post/feedbackRead` of *any* buffer compiles to
     `<bufVar>.getPreviousTextureNode().sample(uv)`;
   - scene inputs compile to the same texture args the main Fn receives.
   Nodes shared between a buffer closure and the main graph are compiled into
   both `Fn`s — correct, since they execute in different passes.
3. Emit, before the main post Fn:
   ```js
   const fb_trail = __feedbackBuffer('trail', { precision: 'half', filter: 'linear', wrap: 'clamp', scale: 1, iterations: 1 });
   fb_trail.setUpdateNode(trailUpdateFn(...sceneArgs));
   ```
4. In the main Fn: `feedbackRead` → `fb_trail.getPreviousTextureNode()` sample;
   `feedbackWrite.out` → `fb_trail.getTextureNode()` (`.rtt()`-style pass texture).
   A write node whose `out` is unused still gets its buffer declared and stepped
   (it may exist only to be read elsewhere).
5. `getPostConvenienceExpression` untouched; new node types get their own emit
   branch like `texture/sampleNode` does.

Validation / friendly errors (surface via existing `onPostErrorChange` path):
- duplicate buffer names → "Two Feedback Buffers are named 'x'…"
- read with no matching write → compile to `vec4(0)` + editor warning badge.
- feedback nodes restricted to the post root graph in Phase 1 (reject inside
  subgraphs/loops, like the post anchors already are).

**Code export**: extend the `inlineCustomTslImports` mechanism so exported code
containing `__feedbackBuffer` inlines `feedback-buffer.ts` source (self-contained
copy-paste export, matching the current philosophy).

---

## 7. Editor / preview integration

- **Node UI** (`components/nodes/…`): reuse the `local/set`-style name field and
  `local/get`-style source dropdown; property panel for precision/filter/wrap/
  scale/iterations; **Reset button** on the write node.
- **`PreviewCanvas3D.tsx`**: after each successful post rebuild, call
  `pruneFeedbackBuffers(activeKeys)`; on unmount `disposeAllFeedbackBuffers()`.
- **Debug preview** (`buildTSLPostDebugOutputNode`): feedback state must NOT be
  double-stepped (main pipeline + debug pipeline each calling `updateBefore`
  would advance the sim 2× or fight over RTs). Rule: debug previews sample the
  shared buffer **read-only** via `getPreviousTextureNode()` and never register
  the stepping node; previewing the write node's upstream chain evaluates it as
  a plain expression (fine — reads still resolve read-only). This makes the node
  debug preview show the *live* sim, which is a great UX.
- **Reset triggers**: manual button; automatic when buffer config changes;
  optional "reset on graph structure change" toggle (default off — preserving
  state while editing is the better default).

---

## 8. Feature list

### Phase 0 — quick win (optional, ~1 day): `postfx/feedback` convenience node
A pre-canned feedback node like `afterImage` but more fun: inputs `input`,
`decay`, `zoom`, `rotate`, `offset`, blend mode (max/mix/add). One custom
TempNode in `lib/feedback-buffer.ts`, one node def, zero compiler changes.
Ships trails/infinite-zoom immediately and de-risks the runtime class before
the compiler work. (Skippable if you want to go straight to Phase 1.)

### Phase 1 — core (MVP)
- [ ] `FeedbackBufferNode` runtime class + `feedback-store.ts` persistence
- [ ] `post/feedbackWrite` + `post/feedbackRead` node defs (name-linked pair)
- [ ] Compiler: buffer-closure extraction into per-buffer `Fn`s; declarations;
      read/write emission; validation errors
- [ ] Runtime scope + `PreviewCanvas3D` prune/dispose wiring
- [ ] Reset button; clear-to-transparent-black initial state
- [ ] Node picker entries, `descriptions.ts` + `lib/docs/nodes.ts` docs with the
      "reads return last frame" semantics spelled out
- [ ] Compiler tests (`compiler.test.ts`): extraction, shared-node duplication,
      cross-buffer reads, validation failures

### Phase 2 — make it good
- [ ] Buffer config: precision / filter / wrap / resolutionScale / iterations
- [ ] Debug-preview read-only integration (live sim thumbnail on node)
- [ ] Init state: `init` input expression sampled once on reset (e.g. seed a sim
      from scene color or a noise node)
- [ ] Global "Reset simulations" control in `PreviewControls`
- [ ] Export: inline runtime class via `inlineCustomTslImports`
- [ ] 2–3 starter templates: **Motion Trail**, **Ripple/Water**, **Game of Life**
      (nearest + unorm8 + iterations=1), ideally as a tutorial — feedback is a
      concept people specifically want to learn
- [ ] Docs page section in `USER_GUIDE.md`

### Phase 3 — advanced / later
- [ ] Pointer/mouse input node (position, down, velocity as uniforms) — none
      exists today, and interactive sims (paint, fluid stirring) need it; it's
      independently useful
- [ ] History depth > 1 (read frame N-2 for e.g. wave equation: needs 3 targets)
- [ ] Multi-pass UI (ShaderToy-style buffer tabs) if graphs get crowded
- [ ] Compute/`StorageTexture` path for WebGPU-native sims (particles, grids)
- [ ] Buffer resolution decoupled from viewport with custom aspect (sim domains)
- [ ] NaN sanitize toggle (clamp state each step) for foolproof sims

---

## 9. Risks & edge cases

| Risk | Mitigation |
|---|---|
| State resets feel random (rebuild on every edit) | `ensureFeedbackBuffer` keyed persistence; only recreate when config changes |
| RT leaks on rebuild (already latent for bloom/afterImage) | prune step in Phase 1; consider extending it to all stateful postfx nodes later |
| NaN poisoning bricks a sim until reload | Reset button (P1), sanitize toggle (P3) |
| unorm8 default silently breaks sims | default `half`; docs call it out |
| Debug preview double-stepping | read-only sampling rule (§7) |
| Resize loses state | acceptable + documented (clear on resize); blit-rescale later if wanted |
| User expects same-frame read-after-write | docs + node description state the one-frame delay explicitly |
| WebGPU texture format/filtering quirks (float filtering support) | half-float linear is universally filterable on WebGPU; float falls back to nearest with a warning |

## 10. Sources

- [three.js forum — Ping pong buffer in postprocessing pass](https://discourse.threejs.org/t/ping-pong-buffer-in-postprocessing-pass/87154)
- [three.js forum — Struggling to recreate WebGL ping-pong buffers with WebGPU and TSL](https://discourse.threejs.org/t/struggling-to-recreate-webgl-ping-pong-buffers-with-webgpu-and-tsl/87462)
- [three.js forum — Recursive Trail Ping-Pong (render-to-texture feedback)](https://discourse.threejs.org/t/recursive-trail-ping-pong-three-js-render-to-texture-feedback/89718)
- [Unity — CustomRenderTexture.doubleBuffered](https://docs.unity3d.com/ScriptReference/CustomRenderTexture-doubleBuffered.html)
- [Unity Shader Graph — Custom Render Texture example (self-healing deformation)](https://docs.unity3d.com/Packages/com.unity.shadergraph@17.0/manual/Custom-Render-Texture-Example.html)
- [Maxime Heckel — Beautiful and mind-bending effects with WebGL Render Targets](https://blog.maximeheckel.com/posts/beautiful-and-mind-bending-effects-with-webgl-render-targets/)
- Local reference: `node_modules/three/examples/jsm/tsl/display/AfterImageNode.js`
