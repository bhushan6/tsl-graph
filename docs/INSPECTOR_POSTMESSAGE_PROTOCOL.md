# TSL Graph Inspector postMessage Protocol

This document defines the iframe integration contract between a host app (for example the three.js Inspector) and the TSL Graph standalone editor.

## Scope

- Transport: `window.postMessage`
- Direction: Host <-> Editor iframe
- Current command surface:
  - `tsl:command:load`
  - `tsl:command:clear-graph`
  - `tsl:command:set-root-material`
  - `tsl:command:get-graph`
  - `tsl:command:get-code`
  - `tsl:command:get-uniform-schema`
  - `tsl:command:set-uniform-values`
- No built-in persistence bridge. Host decides when/how to persist.
- An optional public project bootstrap can be requested with `projectId` in the standalone URL.
  It is read once when the iframe starts; the standalone editor does not subscribe to the
  project or write edits back to Convex. Host applications remain responsible for persistence.

## Envelope

All messages use the same envelope:

```ts
type Envelope<T = unknown> = {
  source: string;
  type: string;
  requestId?: string;
  payload?: T;
  error?: string;
};
```

### Source values

- Host messages: `source: "tsl-graph-host"`
- Editor messages: `source: "tsl-graph-editor"`

## Message catalog

### Editor -> Host

1. `tsl:event:ready`
- Purpose: Editor iframe is mounted and command channel is ready.
- Payload:

```ts
{
  version: 1;
  enabledGraphs: Array<"material" | "postprocessing">;
}
```

2. `tsl:event:graph-changed`
- Purpose: Lightweight invalidation signal for graph edits.
- Payload:

```ts
{
  revision: number; // monotonically increasing within the session
}
```

3. `tsl:event:uniforms-changed`
- Purpose: Notify host that uniform values/schema changed.
- Payload:

```ts
{
  uniforms: Array<{
    scope: "node" | "global";
    id: string;
    name: string;
    uniformType: "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "color";
    value: unknown;
    min?: number;
    max?: number;
    step?: number;
  }>;
}
```

### Host -> Editor

1. `tsl:command:load`
- Purpose: Host-driven graph hydration/replacement.
- Payload:

```ts
{
  graphData: unknown;
}
```

2. `tsl:command:clear-graph`
- Purpose: Host-driven graph reset (clears current graph in editor).
- Payload: none.

2. `tsl:command:set-root-material`
- Purpose: Set and lock the root material node type.
- Payload:

```ts
{
  materialType: "material/node" | "material/standard" | "material/basic" | "material/physical" | "material/phong" | "material/sprite";
}
```

3. `tsl:command:get-graph`
- Purpose: Pull full graph JSON on demand.
- Payload: optional/unused.

4. `tsl:command:get-code`
- Purpose: Pull compiled code on demand.
- Payload: optional/unused.
- `material.code` is returned as an applier function: `tslGraph(material)`.
- Material declaration (`const material = new ...`) is omitted.
- `material.code` uses runtime uniform IDs and returns a uniform map.
- Custom helpers from `@/lib/tsl-utils`, easing helpers from `tsl-easings`, and texture helpers from `tsl-textures` are inlined into generated code, so hosts do not need those module imports.
- Response includes imports grouped by module for material and postprocessing code.
- Import groups may include bare `three` named imports (for example `Color`, `Vector2`, `Vector3` needed by inlined tsl-textures helpers). Hosts must resolve those from their own Three.js runtime, the same way they resolve `three/tsl` names.

5. `tsl:command:get-uniform-schema`
- Purpose: Pull current uniform schema/values on demand.
- Payload: optional/unused.

6. `tsl:command:set-uniform-values`
- Purpose: Patch one or more uniforms by id/scope.
- Payload:

```ts
{
  updates: Array<{
    scope: "node" | "global";
    id: string;
    value: unknown;
  }>;
}
```

Note:
- Node uniform updates are applied against the material root graph. If material root is not active, those node updates are rejected with a reason.

### Editor command responses

1. `tsl:response:load`

```ts
{
  ok: true;
}
```

2. `tsl:response:clear-graph`

```ts
{
  ok: true;
}
```

3. `tsl:response:set-root-material`

```ts
{
  ok: true;
  materialType: "material/node" | "material/standard" | "material/basic" | "material/physical" | "material/phong" | "material/sprite";
}
```

4. `tsl:response:get-graph`

```ts
{
  graphData: unknown;
}
```

5. `tsl:response:get-code`

```ts
{
  enabledGraphs: Array<"material" | "postprocessing">;
  material: {
    code: string | null;
    error: string | null;
    imports: Array<{ from: string; imports: string[] }>;
  };
  postprocessing: {
    code: string | null;
    functionName: string | null;
    error: string | null;
    imports: Array<{ from: string; imports: string[] }>;
  };
}
```

Note:
- `material.code` excludes the `const material = new ...` block.
- `material.code` keeps `material.* = ...` assignments inside `tslGraph(material)`.
- `material.code` converts runtime helper calls into direct `uniform(...)` refs.
- `material.imports` excludes material class symbols (e.g. `MeshStandardNodeMaterial`) because the host provides the material instance.
- `tslGraph(material)` returns `{ uniforms }` where:
  - `uniforms` is a map keyed by uniform id
  - each value is the uniform reference
- Post-processing code remains separate in `postprocessing.code`.

6. `tsl:response:get-uniform-schema`

```ts
{
  uniforms: Array<{
    scope: "node" | "global";
    id: string;
    name: string;
    uniformType: "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "color";
    value: unknown;
    min?: number;
    max?: number;
    step?: number;
  }>;
}
```

7. `tsl:response:set-uniform-values`

```ts
{
  ok: boolean;
  uniforms: Array<{
    scope: "node" | "global";
    id: string;
    name: string;
    uniformType: "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "color";
    value: unknown;
    min?: number;
    max?: number;
    step?: number;
  }>;
  rejected?: Array<{
    scope: "node" | "global";
    id: string;
    reason: string;
  }>;
}
```

If any command fails, editor returns `error` on the envelope with the same `requestId`.

### Uniform range metadata

`min`, `max`, and `step` are optional range metadata configured per uniform in the editor
(only present for numeric kinds: `float`, `int`, `vec2`, `vec3`, `vec4`; for vector kinds
the scalar range applies per component). Hosts can use them to render sliders or steppers.
Values sent via `tsl:command:set-uniform-values` are type-coerced and clamped to the
configured range by the editor. Editing a range in the editor emits a fresh
`tsl:event:uniforms-changed`.

## Lifecycle and timing

Recommended host behavior:

1. Create iframe URL:
- `/editor/standalone?docId=<id>&graphs=material&targetOrigin=<host-origin>`
- To start from a shared project, append `projectId=<public-project-id>`:
  `/editor/standalone?projectId=<public-project-id>&targetOrigin=<host-origin>`

2. Listen for messages and validate:
- `event.origin`
- `source`
- `requestId` for command/response matching

3. On `tsl:event:ready`:
- The ready event is sent only after the postMessage listener is installed and the initial
  standalone bootstrap (including the optional public project graph) has completed.
- If the host has a newer saved draft, send `tsl:command:load` after this event. That host
  payload becomes the editor's working copy for the rest of the iframe session.
- Optionally send `tsl:command:set-root-material` with the selected `materialType`.
- Editor can stay blank until host chooses a material/graph and sends `tsl:command:load`.

4. On `tsl:event:graph-changed`:
- Debounce and call:
  - `tsl:command:get-code` for live preview/application
  - `tsl:command:get-graph` when needed for persistence/export

5. On `tsl:event:uniforms-changed`:
- Sync inspector-side uniform UI using the provided uniform list.

6. Persist graph in host app:
- Keep your own debounce policy and persist `graphData` pulled through `tsl:command:get-graph`.

### Public project embed

The share dialog's **Standalone editor URL** points at the auth-free editor bootstrap. It is
available only while the project is public. The generated iframe markup is equivalent to:

```html
<iframe
  src="https://example.com/editor/standalone?projectId=<public-project-id>"
  width="100%"
  height="600"
  title="TSL Graph"
  allowfullscreen
  style="border:0"
></iframe>
```

The project graph is copied into the iframe's local editor state once. Edits, including edits
made through host commands, stay browser-local unless the embedding host explicitly reads the
graph and persists it itself. A private, missing, malformed, or unavailable project id opens
the recovery screen instead of exposing project data.

### Embedded UI controls

Use the optional `show` query parameter as a comma-separated allow-list of editor surfaces. If
`show` is absent, the complete editor remains visible for backward compatibility. The graph
canvas is always rendered and is not a `show` value.

Supported values are:

- `preview` — final shader preview
- `library` — node library on the left
- `inspector` — properties, uniforms, and globals on the right
- `toolbar` — graph toolbar
- `navbar` — top navigation
- `controls` — menu for independently showing, hiding, or resetting the optional panels
- `none` — explicit graph-only preset; it overrides other values

Examples:

```text
# Graph only
/editor/standalone?projectId=<id>&show=none

# Graph and final preview, with independent panel controls
/editor/standalone?projectId=<id>&show=preview,controls

# Graph, preview, and toolbar
/editor/standalone?projectId=<id>&show=preview,toolbar,controls
```

The `show` value controls only the initial embed presentation. Changes made through the controls
menu last for the iframe session only; they do not change the URL, graph, or persistence behavior.

## Security and reliability guidance

1. Always validate message origin in production.
2. Avoid `targetOrigin="*"` outside local development.
3. Use request timeouts for host-issued commands.
4. Match responses by `requestId` only.
5. Treat `graphData` as untrusted input; validate before storing.

## Minimal host command helper

```ts
async function command<T = unknown>(type: string, payload?: unknown): Promise<T> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  iframe.contentWindow?.postMessage(
    { source: "tsl-graph-host", type, requestId, payload },
    editorOrigin
  );
  // resolve from message listener by matching requestId
  // reject on timeout
}
```
