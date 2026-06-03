
# TSL Graph Editor - User Guide

Welcome to the **TSL (Three.js Shading Language) Graph Editor**. This tool mimics professional node-based shader editors, allowing you to build shaders visually by connecting logic blocks.

---

## 1. Interface Overview

The application is divided into four main areas:

### **1. Canvas (Center)**
The infinite workspace where you build your graph.
-   **Pan**: Middle Mouse Drag (or select Pan tool)
-   **Zoom**: Scroll Mouse Wheel

### **2. Node Picker (Left)**
Your toolbox. It lists all available nodes (Math, Color, UV, etc.).
-   **Click to Add**: Click any node name to add it to the center of the canvas.
-   **Search**: Quickly find nodes by name.
-   **Custom Nodes**: Your saved templates and subgraphs appear here.

### **3. Properties & Preview (Right)**
-   **Preview**: A real-time 3D view showing your material applied to a mesh.
-   **Properties Panel**: When a node is selected, its editable settings appear here.

### **4. Bottom Toolbar**
Quick access to common actions:
-   **Pan/Select Modes**: Switch between moving the canvas and selecting nodes.
-   **Create Subgraph**: Group selected nodes.
-   **View Code**: Open the panel to see the generated TSL code.

---

## 2. Working with Nodes

Nodes are the building blocks of your shader. Data flows from **Left** (Inputs) to **Right** (Outputs).

### **Adding Nodes**
-   **Click a node** in the **Left Panel**.
-   **Quick Add**: Drag a wire into empty space to open the Node Picker, filtered by compatibility.

### **Connections**
-   Drag a wire from an **Output** to an **Input**.
-   **Type Colors**:
    -   <span style="color:green">●</span> **Green**: Vectors (vec2, vec3, vec4)
    -   <span style="color:violet">●</span> **Violet**: Float (single number)
    -   <span style="color:blue">●</span> **Blue**: Integer (int, ivec)
    -   <span style="color:cyan">●</span> **Cyan**: Unsigned Int (uint, uvec)
    -   <span style="color:orange">●</span> **Orange**: Boolean (bool, bvec)
    -   <span style="color:orange">●</span> **Amber**: Color
    -   <span style="color:pink">●</span> **Pink**: Matrix (mat3, mat4)
    -   <span style="color:purple">●</span> **Purple**: Texture (sampler2D)
    -   <span style="color:gray">●</span> **Gray**: Any Type

### **Debugging**
-   **Node Debug Preview** (Bug Icon in each node header):
    -   Click a node's bug icon to inspect that node's output directly on the canvas.
    -   Click the same icon again to hide that node's preview.
    -   Useful for checking intermediate values like noise patterns or math operations.

### **Editing Properties**
-   Select a node to view its inputs in the **Right Panel**.
-   **Direct Values**: If an input is *not* connected, you can set a static value manually.
-   **Connected Inputs**: If an input is connected via a wire, the manual control is hidden.

---

## 3. Subgraphs (Custom Nodes)

Subgraphs allow you to bundle complex logic into a single, reusable node. They act just like functions in code.

### **1. Creating a Subgraph**
1.  Select multiple nodes (`Shift` + Click nodes, or hold `Shift` + Drag Box).
2.  Click the **Create Subgraph** icon (Layers icon) in the Bottom Toolbar.
3.  Name your new node. It is now saved as a **Custom Node**.
    -   **Automatic Ports**: The editor automatically creates inputs/outputs based on existing connections.
    -   **Manage Ports**: To add or rename ports later, you must **Edit the Subgraph** (see below).

### **2. Editing Internals**
To edit the logic inside a custom node, select it and click **"Edit Subgraph"** in the properties panel.

### **3. Understanding Anchor Nodes**
Inside a subgraph, you will see two special nodes:

#### **Subgraph Input**
-   Represents data coming **into** your custom node.
-   **Action**: Select this node to **add, remove, or rename inputs** (e.g., Color, Speed) in the Properties Panel.

#### **Subgraph Output**
-   Represents the final result sent **out** of your custom node.
-   **Action**: Connect your final calculation here to define what the node returns.

### **Developer Mental Model**
If you are familiar with coding, think of a Subgraph as a **Function**:
-   **Subgraph Input Node** = Function Arguments `(a, b)`
-   **Subgraph Output Node** = Return Statement `return result;`
-   **Node Instance** = Function Call `myFunction(1, 2)`

### **Important Notes**
-   Subgraphs currently support only **one output**.
-   Saved subgraphs appear in the **Node Picker** under "Custom Nodes" for easy reuse.

---

## 4. Code Nodes

Sometimes a visual graph is too messy for simple math. Code Nodes let you write TSL directly.

### **1. Creation & Input Detection**
Click **"Create from Code..."** in the Node Picker. The editor creates inputs based on your code structure.

*   **Writing Code (TSL)**: Wrap your logic in `Fn(([args]) => { ... })`.
    *   **Note**: Arguments must be passed as an **array**: `([color, time])`.
    ```javascript
    Fn(([color, time]) => {
      // 'color' and 'time' will become inputs on the node
      return color * sin(time);
    })
    ```
*   **Writing Code (WGSL)**: Choose **WGSL** in the language selector and write a raw WGSL function.
    ```wgsl
    fn colorFn(baseColor: vec4f, uv: vec2f) -> vec4f {
      let red   = (uv.x + 2.3) * 0.3;
      let green = (uv.y + 1.7) / 8.2;
      let blue  = (uv.x + uv.y) % 10.0;
      return mix(baseColor, vec4f(red, green, blue, 1.0), uv.x);
    }
    ```
*   **Configuring Types**: Once you type valid code, an **"Input Types"** section appears below. You can assign explicit types (e.g., `Color`, `Float`, `Vec3`) to your inputs to ensure they connect correctly.
    *   For WGSL, the **output type** is inferred from the function return type (falls back to `Any` if unknown).

### **2. Coding Environment**
You can write any standard **JavaScript** logic and use any **TSL function** available in **three.js**.

*   **Supported**:
    *   All TSL Math nodes (`sin`, `mix`, `step`, etc.)
    *   Vector operations (`dot`, `cross`, `normalize`)
    *   Standard JS control flow and variables.
*   **Limitations (Sandbox)**:
    *   Your code runs in **strict isolation**.
    *   No access to global objects like `window`, `document`, or `console`.

---

## 5. Miscellaneous Features

### **Group Nodes**
For visual organization without creating full Subgraphs.
-   **Create**: Select multiple nodes > Click **Group Nodes** (Group Icon) in toolbar.
-   **Interact**: Move the group frame to move all children.
-   **Rename**: Double-click the group label.
-   **Ungroup**: Select the group node > Click **Ungroup** in toolbar.

### **3D Preview**
-   **Real-time Visualization**: The right panel always shows your shader on a 3D sphere.
-   **Lighting**: Includes a rotating light source to help visualize normals and roughness.

---

## 6. Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **Ctrl + Z** / **Cmd + Z** | Undo |
| **Ctrl + Y** / **Cmd + Y** | Redo |
| **Delete** / **Backspace** | Delete Selected |
| **Shift + Click** | Add to Selection |
| **Shift + Drag** | Box Selection |
| **Middle Mouse** | Pan Canvas |
| **Mouse Wheel** | Zoom |
