# Changelog

All notable changes to this project since February 10, 2026 will be documented in this file.

## [Unreleased] - 2026-02-13

### Features

- **Navbar Note Search**: Introduced a new search functionality in the navigation bar, allowing users to quickly search for and navigate through notes using a debounced search input integrated with Convex.
- **Copy/Paste Clipboard Support**: Added robust support for copying and pasting nodes and edges. Users can now duplicate parts of their graph with ease, including support for context menu paste operations and maintaining relative positions.
- **AI Integration Enhancements**:
  - Integrated `AiChatDock` for AI-assisted graph building and modifications.
  - Added user AI settings to persist preferences like provider API keys locally.
  - Improved AI tool runner with better support for graph operations and auto-layout.
- **CodeMirror Integration**: Replaced Prism with CodeMirror for TSL code editing. This brings significant improvements to the code editing experience, including:
  - Better syntax highlighting for TSL and WGSL.
  - Basic autocompletion for TSL functions and types.
  - Improved performance for large code blocks.
- **WGSL Support**: Added dedicated WGSL code nodes, allowing users to write raw WebGPU Shading Language code directly within the TSL graph. Includes compiler updates to handle WGSL integration.
- **Uniforms Management**:
  - Added a new **Uniforms Panel** in the right sidebar for centralized management of all shader uniforms.
  - Introduced **Uniform Nodes** with live updates, enabling real-time feedback in the preview when uniform values change.
- **Material Input Activation**: Improved UX for material nodes with inline activation controls, making it easier to toggle and edit material properties.
- **Numeric Scrubber**: Added a `NumericScrubber` component for all numeric inputs, allowing users to intuitively change values by clicking and dragging.
- **Multi-mode Loop Groups**: Added support for multi-mode loop groups, enabling more complex control flow within the shader graphs.
- **Node Picker Improvements**: Users can now open the node picker via a right-click on the canvas, streamlining the process of adding new nodes.

### Bug Fixes

- **Numeric Input Precision**: Fixed issues where numeric inputs would lose precision or fail to clamp correctly to their defined ranges.
- **Float Input Step**: Corrected the default step value for float inputs to ensure smoother value increments.
- **Loop Group Validation**: Prevented the creation of loop groups when material nodes are selected, avoiding invalid graph states.
- **Uniform List Focus**: Fixed a bug where focus control in the uniform list was inconsistent during editing.
- **Type Safety**: Resolved multiple TypeScript errors across the codebase, particularly in the compiler and store logic, improving overall code maintainability.

### Miscellaneous

- **Open Source Preparation**: Performed various cleanups and configurations to prepare the codebase for its public open-source release.
- **Vitest Configuration**: Added and updated Vitest configuration for better unit testing support.
