# Forum Feedback Tasks

Source: Three.js forum discussion from May 6-16, based on follow-up comments from `bhushan6` and `aaaidan`.

## Summary

The discussion centered on post graph maturity, post-processing sampling behavior, missing convenience nodes, node debugging UX, numeric input ergonomics, multi-select behavior, and open-source readiness.

## High Priority

### Bug: Post graph texture sampling can go black

- [ ] Reproduce `Screen UV -> Texture -> Output` producing black output.
- [ ] Confirm whether the graph is attempting to sample the scene or an imported texture.
- [ ] Verify the supported path: `Post Input.sceneTexture -> Sample Texture`.
- [ ] Confirm that `Sample Texture` defaults to screen UV when used with `Post Input.sceneTexture`.
- [ ] Fix the post graph path if `Post Input.sceneTexture -> Sample Texture` also renders black.
- [ ] Add regression coverage or a saved example graph for scene texture sampling.

Notes:

- `Screen UV -> Texture -> Output` going black is not expected behavior.
- Scene sampling should currently happen through `Post Input.sceneTexture -> Sample Texture`.

### UX: Add per-node debug preview

- [ ] Replace or supplement the current global debug view with a per-node debug view.
- [ ] Decide where the per-node debug control lives on each node.
- [ ] Ensure only the selected/debugged node is evaluated for preview when possible.
- [ ] Measure performance impact on medium and large graphs.
- [ ] Add clear empty/error states for unsupported node outputs.

Notes:

- Per-node debug was agreed to be better UX than the current debug approach.
- Initial concern was performance, so implementation should include a quick performance check.

### UX: Restore Shift multi-select

- [ ] Re-enable `Shift` as a multi-select modifier.
- [ ] Keep `Cmd` / `Ctrl` multi-select support if it is already useful.
- [ ] Verify selection behavior for nodes, edges, box selection, and mixed selections.
- [ ] Update any user-facing docs or shortcuts if they exist.

Notes:

- `Shift` was originally used, then changed to `Cmd`.
- Forum feedback suggests `Shift` is the more standard expectation.

## Medium Priority

### Feature: Improve number input controls

- [ ] Review current numeric input behavior in node properties.
- [ ] Add a more ergonomic number input interaction.
- [ ] Support precise typing and quick drag/step adjustment if appropriate.
- [ ] Preserve existing value parsing and type handling.
- [ ] Verify behavior for scalar, vector, and color-related numeric fields.

Notes:

- The forum exchange mentions a planned improvement for number inputs, but the exact requested interaction should be recovered from the original feedback before implementation.

### Feature: Add normal convenience sampler

- [ ] Add a post graph normal sampler matching existing `color` and `depth` convenience samplers.
- [ ] Confirm the source attachment and expected normal format.
- [ ] Add node metadata, labels, docs, and examples.
- [ ] Test the normal sampler in a basic post effect graph.

Notes:

- Existing convenience samplers include `color` and `depth`.
- `normal` was agreed to be a missing equivalent.

### Feature: Expose tonemapping controls

- [ ] Decide whether tonemapping should be a node, graph setting, output option, or material/post-process setting.
- [ ] Identify supported Three.js/WebGPU tonemapping options.
- [ ] Add UI/API exposure if the post graph design can support it cleanly.
- [ ] Document current behavior and limitations.

Notes:

- Tonemapping is currently not exposed.

### Feature: Add dedicated sRGB encode/decode nodes

- [ ] Add explicit sRGB encode and decode nodes if they fit the node library.
- [ ] Confirm interaction with imported texture color-space settings.
- [ ] Avoid double-conversion when texture color-space is already configured.
- [ ] Add examples for linear workflow and texture sampling.

Notes:

- Imported textures already expose a color-space setting on the Texture node.
- Dedicated encode/decode nodes do not exist yet.

## Low Priority / Roadmap

### Roadmap: Mature the post graph

- [ ] Collect real post graph examples from users.
- [ ] Identify the smallest set of post-processing features that make the graph useful.
- [ ] Add docs/examples for common effects.
- [ ] Track bugs separately from missing post features.

Notes:

- The post graph was described as a basic first version that did not receive much iteration or feedback.

### Roadmap: Consider multi-pass / multiple scene renders later

- [ ] Keep current behavior documented: one scene render plus depth/normal attachments.
- [ ] Revisit multi-pass or multiple scene render support only after the post graph is more mature.
- [ ] Evaluate feasibility, performance cost, and usefulness before committing.

Notes:

- Current behavior: the graph gets one scene render, plus depth and normal attachments by default.
- This was considered potentially useful, but not feasible or useful enough in the current app state.

### Project: Prepare for open source

- [ ] Audit repository for private credentials, local-only assumptions, and generated files.
- [ ] Add or update README with project purpose, setup, examples, and limitations.
- [ ] Add license.
- [ ] Add contribution notes or issue templates if useful.
- [ ] Document current maturity of material graph and post graph separately.

Notes:

- The project may be ready to open source because active development time has been limited.

## Already Done / Verify

### Type inference for Math nodes

- [ ] Verify derived output types are visible for Math nodes.
- [ ] Add or confirm test coverage for representative Math node combinations.
- [ ] Document type inference behavior if user-facing docs mention Math nodes.

Notes:

- Type inference for Math nodes was reported as already added.

### Resolution node availability

- [ ] Ensure docs explain that `Resolution.x / Resolution.y` gives aspect ratio.
- [ ] Add an example for keeping UV-driven noise square.

Notes:

- Viewport size is already available through the Resolution node.
- Resolution maps to screen/render resolution.

## Suggested Issue Breakdown

1. Fix post scene texture sampling black output.
2. Add per-node debug preview.
3. Restore Shift multi-select.
4. Improve numeric input interaction.
5. Add normal convenience sampler.
6. Add sRGB encode/decode nodes.
7. Explore tonemapping exposure.
8. Document Resolution node aspect-ratio usage.
9. Prepare open-source checklist.
