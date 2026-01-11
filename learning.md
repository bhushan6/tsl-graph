# Subgraph Feature Implementation - Learnings

This document captures learnings and insights discovered while implementing the subgraph feature.

---

## 2026-01-08: Initial Analysis

### Codebase Architecture Overview

1. **Node Registry System**
   - Nodes are defined in `lib/nodes/` directory (math.ts, constants.ts, geometry.ts, output.ts)
   - All node definitions implement `BaseNodeDef` interface from `definitions.ts`
   - Registry singleton (`lib/registry.ts`) manages all node definitions
   - Nodes are initialized via `initializeNodes()` in `lib/nodes/index.ts`

2. **Type System**
   - `NodeType` - Union of all valid node type strings (e.g., 'math/add')
   - `TSLNodeData` - Data stored on each node instance (type, values, connected)
   - `Port` interface defines input/output port properties (label, type, default, connectionOnly)

3. **State Management**
   - Single Zustand store in `store/editor.ts`
   - Manages nodes, edges, selection state
   - Provides save/load to JSON and localStorage

4. **Code Generation**
   - `lib/compiler.ts` - Generates TSL code strings
   - `lib/tsl-builder.ts` - Builds actual Three.js materials at runtime
   - Both use topological sort from `lib/graph-utils.ts`

### Key Insight: Node Registration Pattern
Node definitions follow a consistent pattern:
```typescript
{
    type: 'category/name',
    label: 'Display Name',
    category: 'Category',
    tsl: 'tslFunctionName',
    inputs: { ... },
    outputs: { out: { label: 'Out', type: 'any' } }
}
```

### Challenge: Dynamic Ports
Subgraph input/output anchor nodes need **dynamic ports** that users can add/remove at runtime. Current node definitions have static port definitions. Will need to:
- Store dynamic port definitions in node's `data.values` or a new field
- Have TSLNode component read ports from node data instead of registry for anchor nodes

---

## 2026-01-08: Task 2 - State Management Design

### SubgraphDefinition Structure
Designed a comprehensive `SubgraphDefinition` interface to store:
- `id`: Unique identifier like `custom/blur-effect-123456`
- `name`: Human-readable display name
- `inputs`/`outputs`: Arrays of `SubgraphPort` for the node interface
- `nodes`/`edges`: The internal graph definition
- `createdAt`/`updatedAt`: Timestamps for tracking

### Editor Mode Pattern
Implemented a dual-mode editor pattern:
- **Main mode**: Normal graph editing
- **Subgraph mode**: Isolated editing of subgraph internals
- `mainGraphBackup` stores the main graph while editing subgraph

### Key Design Decisions

1. **Dynamic Ports via `dynamicPorts` field**: Added `dynamicPorts?: SubgraphPort[]` to `TSLNodeData` to support runtime-definable ports on anchor nodes.

2. **Anchor Node IDs**: Using fixed IDs (`subgraph-input`, `subgraph-output`) for anchor nodes makes it easy to find them when saving.

3. **Subgraph ID Format**: Using `custom/${name}-${timestamp}` pattern to ensure uniqueness while being human-readable.


4. **Persistence Integration**: Updated `saveToJSON`/`loadFromJSON` to include `subgraphs` field in `GraphData`.

---

## 2026-01-08: Task 3-4 - UI Implementation

### Multi-Selection Support
- Added `selectedNodeIds: string[]` to track multiple selected nodes
- Added `setSelectedNodes` action to update multi-selection
- Updated Editor's `onSelectionChange` to call both `setSelectedNode` (single) and `setSelectedNodes` (multi)

### Toolbar Integration
- Added "Subgraph" button that's disabled when `selectedNodeIds.length < 1`
- Created dialog for naming the new subgraph
- Added different toolbar display for subgraph editing mode (Save & Exit / Cancel)

### Dynamic Ports in TSLNode
- Added `dynamicPorts?: SubgraphPort[]` field to `TSLNodeData`
- TSLNode now checks if node is an anchor node (`subgraph/input` or `subgraph/output`)
- For anchor nodes, ports are read from `data.dynamicPorts` instead of registry
- Important: Subgraph Input has **outputs** (to connect to internal nodes), Subgraph Output has **inputs** (to receive from internal nodes)

---

## 2026-01-08: Task 8-9 - Compiler/Builder Integration

### Filtering Approach
For now, implemented filtering to skip subgraph anchor nodes in compilation:

1. **`compileGraph`**: Filters out `subgraph/input` and `subgraph/output` from the sorted node list
2. **`buildTSLMaterial`**: Same filtering in runtime builder
3. **`getRequiredImports`**: Skips anchor nodes to avoid importing placeholder tsl values

### Future Enhancement Needed
When subgraph **instances** (nodes with type starting with `custom/`) are fully implemented:
- Compiler should generate a function for each SubgraphDefinition
- Subgraph instance nodes should be compiled as function calls with inputs mapped
- Need to recursively compile the internal graph when generating the function

---

*More learnings will be added as implementation progresses...*
