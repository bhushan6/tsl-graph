import { createDefaultPreviewSettings, useEditorStore } from '@/store/editor';

export type TutorialEditorState = ReturnType<typeof useEditorStore.getState>;

export interface TutorialTask {
  id: string;
  label: string;
  description: string;
  hint?: string;
  manualComplete?: boolean;
  validate: (editorState: TutorialEditorState) => boolean;
}

export interface TutorialDefinition {
  id: string;
  title: string;
  description: string;
  tasks: TutorialTask[];
  setup?: () => void;
}

const deselectAll = () => {
  useEditorStore.setState({ selectedNodeId: null, selectedNodeIds: [] });
};

const alwaysComplete = () => true;

const resetTutorialWorkspace = (store: TutorialEditorState) => {
  store.clearGraph();
  useEditorStore.setState({
    previewSettings: { ...createDefaultPreviewSettings(), postEnabled: false },
  });
};

const hasUploadedAssetValue = (value: unknown): boolean =>
  !!value &&
  typeof value === 'object' &&
  'assetId' in value &&
  typeof value.assetId === 'string' &&
  value.assetId.trim().length > 0;

export const tutorialDefinitions: TutorialDefinition[] = [
  {
    id: 'tutorial_4',
    title: 'Navigating the Canvas',
    description:
      'Before building shaders, let us get comfortable moving around. You will learn how to pan, zoom, move, delete, and undo so the canvas never feels like a black box.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 400, y: 200 });
      store.addNode('const/color', { x: 100, y: 100 });
      store.addNode('const/float', { x: 100, y: 300 });
      deselectAll();
    },
    tasks: [
      {
        id: 't4_pan_canvas',
        label: 'Pan the Canvas',
        description:
          'Hold Middle Mouse or Space + Drag to pan around the canvas. Move the view until you can comfortably see the graph.',
        hint: 'Hold the scroll wheel or press Space and drag to move the canvas view.',
        manualComplete: true,
        validate: alwaysComplete,
      },
      {
        id: 't4_zoom',
        label: 'Zoom In and Out',
        description:
          'Use the scroll wheel to zoom in and out. Try zooming close to a node, then zooming back out to see the whole graph.',
        hint: 'Scroll up to zoom in and scroll down to zoom out.',
        manualComplete: true,
        validate: alwaysComplete,
      },
      {
        id: 't4_move_node',
        label: 'Move a Node',
        description:
          'Click and drag the Float node to a new position below the Color node. Keeping your graph tidy makes it easier to think clearly.',
        hint: 'Grab the Float node and drag it somewhere else on the canvas.',
        validate: (s) => {
          const floatNode = s.nodes.find((n) => n.data?.type === 'const/float');
          if (!floatNode) return false;
          return Math.abs(floatNode.position.x - 100) > 30 || Math.abs(floatNode.position.y - 300) > 30;
        },
      },
      {
        id: 't4_delete_node',
        label: 'Delete a Node',
        description:
          'Select the Float node, then press Delete or Backspace to remove it from the canvas.',
        hint: 'Click the Float node, then press the Delete key.',
        validate: (s) => !s.nodes.some((n) => n.data?.type === 'const/float'),
      },
      {
        id: 't4_undo',
        label: 'Undo Your Action',
        description:
          'Bring the Float node back with Ctrl+Z or Cmd+Z. Undo is your quick escape hatch when something goes wrong.',
        hint: 'Press Ctrl+Z on Windows or Cmd+Z on Mac.',
        manualComplete: true,
        validate: (s) => s.nodes.some((n) => n.data?.type === 'const/float'),
      },
    ],
  },
  {
    id: 'tutorial_5',
    title: 'Customizing the Preview',
    description:
      'The 3D preview shows your shader in real time. Let us explore the shape, lighting, and background so the result is easier to judge.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 400, y: 150 });
      store.addNode('const/color', { x: 80, y: 150 }, { values: { value: '#4488ff' } });
      const currentState = useEditorStore.getState();
      const material = currentState.nodes.find((n) => n.data?.type.startsWith('material/'));
      const color = currentState.nodes.find((n) => n.data?.type === 'const/color');
      if (material && color) {
        currentState.onConnect({
          source: color.id,
          sourceHandle: 'out',
          target: material.id,
          targetHandle: 'colorNode',
        });
      }
      deselectAll();
    },
    tasks: [
      {
        id: 't5_open_preview',
        label: 'Observe the Preview',
        description:
          'Look at the 3D Preview panel in the top-right corner. You should see a blue sphere with your shader applied in real time.',
        hint: 'The preview panel lives in the top-right of the editor.',
        manualComplete: true,
        validate: alwaysComplete,
      },
      {
        id: 't5_change_geometry',
        label: 'Change the Geometry',
        description:
          'In the top-right Preview panel, click the settings button, open the Geometry dropdown, and switch from Sphere to Torus. The same shader wraps around a different shape.',
        hint: 'The settings button is in the Preview panel controls. Open it, then choose Torus from Geometry.',
        validate: (s) => s.previewSettings.mesh === 'torus',
      },
      {
        id: 't5_change_hdri',
        label: 'Change the Environment',
        description:
          'In those same Preview Settings, open the Environment dropdown and choose a different HDRI. Lighting changes can make the same material feel very different.',
        hint: 'Click the settings button in the Preview panel, then pick any Environment other than None.',
        validate: (s) => !!s.previewSettings.environment && s.previewSettings.environment !== 'none',
      },
      {
        id: 't5_toggle_background',
        label: 'Show the Background',
        description:
          'After choosing an environment, turn on Show Background inside Preview Settings so the HDRI appears behind the object as a skybox.',
        hint: 'The Show Background toggle appears in Preview Settings after you choose an environment.',
        validate: (s) => s.previewSettings.showEnvironmentBackground === true,
      },
      {
        id: 't5_fullscreen',
        label: 'Go Fullscreen',
        description:
          'Click the fullscreen toggle on the preview panel for a larger view, then click it again to return.',
        hint: 'Use the expand icon on the preview panel.',
        manualComplete: true,
        validate: alwaysComplete,
      },
    ],
  },
  {
    id: 'tutorial_1',
    title: 'Your First Nodes',
    description:
      'Nodes are the building blocks of your shader. Each node does one simple thing, like hold a color value, do math, or output your final material.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 400, y: 150 });
      deselectAll();
    },
    tasks: [
      {
        id: 't1_add_float',
        label: 'Add a Float Node',
        description:
          'Open the Node Picker on the left sidebar, expand the Constants category, and click Float to add a Float node.',
        hint: 'Click the plus button or use the left panel, then choose Constants -> Float.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'const/float'),
      },
      {
        id: 't1_change_float_val',
        label: 'Edit the Float value to 0.5',
        description:
          'Select the Float node and change its value to 0.5 in the Properties panel on the right.',
        hint: 'Click the Float node, then edit the Value field to 0.5.',
        validate: (s) => {
          const floatNode = s.nodes.find((n) => n.data?.type === 'const/float');
          return floatNode ? floatNode.data?.values?.value === 0.5 : false;
        },
      },
      {
        id: 't1_add_color',
        label: 'Add a Color Node',
        description:
          'Go back to the Node Picker and add a Color node from the Constants category.',
        hint: 'Left Panel -> Constants -> Color.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'const/color'),
      },
      {
        id: 't1_change_color_val',
        label: 'Change the Color Value',
        description:
          'Select the Color node, choose any color other than white, and finish the tutorial when you are happy with it.',
        hint: 'Click the color swatch in the Properties panel and pick a new color.',
        manualComplete: true,
        validate: (s) => {
          const colorNode = s.nodes.find((n) => n.data?.type === 'const/color');
          return colorNode
            ? colorNode.data?.values?.value !== undefined &&
              colorNode.data.values.value !== '#ffffff' &&
              colorNode.data.values.value !== '#fff'
            : false;
        },
      },
    ],
  },
  {
    id: 'tutorial_2',
    title: 'Connecting Nodes',
    description:
      'Data flows between nodes via connections. Outputs on the right connect to inputs on the left, so values can travel through the graph.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 450, y: 150 });
      store.addNode('const/color', { x: 80, y: 150 }, { values: { value: '#ff0000' } });
      deselectAll();
    },
    tasks: [
      {
        id: 't2_connect_color',
        label: 'Connect Color to Material Color',
        description:
          'Drag a wire from the Color node output to the Color input on the MeshStandardMaterial node.',
        hint: 'Connect the right handle of the Color node to the Color input on the material node.',
        manualComplete: true,
        validate: (s) => {
          const colorNode = s.nodes.find((n) => n.data?.type === 'const/color');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!colorNode || !matNode) return false;
          return s.edges.some(
            (e) => e.source === colorNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
        },
      },
      {
        id: 't2_add_second_color',
        label: 'Add a Second Color Node',
        description:
          'Add a second Color node and change it to a different color so you can compare connections.',
        hint: 'Constants -> Color, then change the value in Properties.',
        validate: (s) => s.nodes.filter((n) => n.data?.type === 'const/color').length >= 2,
      },
      {
        id: 't2_replace_connection',
        label: 'Replace the Connection',
        description:
          'Reconnect the material to the new Color node and watch the old edge get replaced automatically.',
        hint: 'Drag the new Color output to the same Color input on the material.',
        manualComplete: true,
        validate: (s) => {
          const colorNodes = s.nodes.filter((n) => n.data?.type === 'const/color');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (colorNodes.length < 2 || !matNode) return false;
          const originalColorNode = colorNodes.find((n) => n.position.x < 120);
          const activeEdge = s.edges.find((e) => e.target === matNode.id && e.targetHandle === 'colorNode');
          if (!activeEdge) return false;
          return originalColorNode ? activeEdge.source !== originalColorNode.id : true;
        },
      },
      {
        id: 't2_select_material',
        label: 'Select the Material Node',
        description:
          'Click the MeshStandardMaterial node so its properties appear in the right panel.',
        hint: 'Click the material node on the canvas until it has a highlight.',
        validate: (s) => {
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!matNode) return false;
          return s.selectedNodeId === matNode.id || s.selectedNodeIds.includes(matNode.id);
        },
      },
      {
        id: 't2_enable_roughness',
        label: 'Enable the Roughness Input',
        description:
          'Find the Roughness input in the Properties panel and check it so the port becomes available.',
        hint: 'Scroll to Inputs and enable Roughness.',
        validate: (s) => {
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          return !!matNode && Array.isArray(matNode.data?.activeInputs) && matNode.data.activeInputs.includes('roughnessNode');
        },
      },
      {
        id: 't2_quick_add',
        label: 'Try Quick Add from Handle',
        description:
          'Drag from the Roughness input into empty space and choose Float from the popup menu.',
        hint: 'Drag the Roughness handle into empty space and pick Float.',
        manualComplete: true,
        validate: (s) => {
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          const floatNodes = s.nodes.filter((n) => n.data?.type === 'const/float');
          if (!matNode || floatNodes.length === 0) return false;
          return s.edges.some(
            (e) =>
              e.target === matNode.id &&
              e.targetHandle === 'roughnessNode' &&
              floatNodes.some((fn) => fn.id === e.source)
          );
        },
      },
    ],
  },
  {
    id: 'tutorial_3',
    title: 'Building a Shader',
    description:
      'Let us combine coordinates, color, and mixing to create a simple UV gradient shader.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 500, y: 150 });
      deselectAll();
    },
    tasks: [
      {
        id: 't3_add_uv',
        label: 'Add a UV Node',
        description:
          'Open the Node Picker, find Geometry, and add a UV node to the canvas.',
        hint: 'Left Panel -> Geometry -> UV.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'geo/uv'),
      },
      {
        id: 't3_add_mix',
        label: 'Add a Mix Node',
        description:
          'Add a Mix node from the Math category. It blends two values using a ratio input.',
        hint: 'Left Panel -> Math -> Mix.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'math/mix'),
      },
      {
        id: 't3_connect_uv_mix',
        label: 'Connect UV to Mix Factor',
        description: 'Connect the UV output to the Mix T input.',
        hint: 'Drag from UV output to the T input on Mix.',
        validate: (s) => {
          const uvNode = s.nodes.find((n) => n.data?.type === 'geo/uv');
          const mixNode = s.nodes.find((n) => n.data?.type === 'math/mix');
          if (!uvNode || !mixNode) return false;
          return s.edges.some((e) => e.source === uvNode.id && e.target === mixNode.id && e.targetHandle === 't');
        },
      },
      {
        id: 't3_add_colors',
        label: 'Add Two Color Nodes',
        description:
          'Add two Color nodes. They will become the two ends of your gradient.',
        hint: 'Add two Constants -> Color nodes.',
        validate: (s) => s.nodes.filter((n) => n.data?.type === 'const/color').length >= 2,
      },
      {
        id: 't3_change_colors',
        label: 'Choose the Gradient Colors',
        description:
          'Select each Color node and set its value. Try a deep blue for one and a bright pink for the other so the gradient is easy to see in the preview.',
        hint: 'Click each Color node, then use the color swatch in the Properties panel.',
        validate: (s) => {
          const colorNodes = s.nodes.filter((n) => n.data?.type === 'const/color');
          if (colorNodes.length < 2) return false;
          const values = colorNodes.map((n) => String(n.data?.values?.value ?? '').trim().toLowerCase());
          const nonWhite = values.filter((v) => v && v !== '#ffffff' && v !== '#fff');
          const unique = new Set(nonWhite);
          return nonWhite.length >= 2 && unique.size >= 2;
        },
      },
      {
        id: 't3_connect_colors_mix',
        label: 'Connect Colors to Mix',
        description: 'Connect one Color node to A and the other to B on the Mix node.', 
        hint: 'Wire color one to A and color two to B.',
        validate: (s) => {
          const mixNode = s.nodes.find((n) => n.data?.type === 'math/mix');
          const colorNodes = s.nodes.filter((n) => n.data?.type === 'const/color');
          if (!mixNode || colorNodes.length < 2) return false;
          const hasA = s.edges.some(
            (e) => e.target === mixNode.id && e.targetHandle === 'a' && colorNodes.some((cn) => cn.id === e.source)
          );
          const hasB = s.edges.some(
            (e) => e.target === mixNode.id && e.targetHandle === 'b' && colorNodes.some((cn) => cn.id === e.source)
          );
          return hasA && hasB;
        },
      },
      {
        id: 't3_connect_mix_material',
        label: 'Connect Mix Output to Material',
        description:
          'Connect the Mix output to the material Color input and finish the tutorial when the gradient looks right.',
        hint: 'Drag Mix output to the material Color input.',
        manualComplete: true,
        validate: (s) => {
          const mixNode = s.nodes.find((n) => n.data?.type === 'math/mix');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!mixNode || !matNode) return false;
          return s.edges.some(
            (e) => e.source === mixNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
        },
      },
    ],
  },
  {
    id: 'tutorial_6',
    title: 'Math & Arithmetic',
    description:
      'Math nodes let you transform, combine, and scale values. We will use Add and Multiply to build a layered color blend.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 500, y: 150 });
      store.addNode('const/color', { x: 50, y: 100 }, { values: { value: '#ff4400' } });
      store.addNode('const/color', { x: 50, y: 250 }, { values: { value: '#0044ff' } });
      deselectAll();
    },
    tasks: [
      {
        id: 't6_add_add_node',
        label: 'Add an Add Node',
        description: 'Open Math and add an Add node to the canvas.',
        hint: 'Left Panel -> Math -> Add.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'math/add'),
      },
      {
        id: 't6_connect_colors_to_add',
        label: 'Connect Both Colors to Add',
        description: 'Connect each Color node to the Add node inputs A and B.',
        hint: 'Wire the two color outputs into Add A and Add B.',
        validate: (s) => {
          const addNode = s.nodes.find((n) => n.data?.type === 'math/add');
          const colorNodes = s.nodes.filter((n) => n.data?.type === 'const/color');
          if (!addNode || colorNodes.length < 2) return false;
          const hasA = s.edges.some(
            (e) => e.target === addNode.id && e.targetHandle === 'a' && colorNodes.some((cn) => cn.id === e.source)
          );
          const hasB = s.edges.some(
            (e) => e.target === addNode.id && e.targetHandle === 'b' && colorNodes.some((cn) => cn.id === e.source)
          );
          return hasA && hasB;
        },
      },
      {
        id: 't6_connect_add_material',
        label: 'Connect Add to Material',
        description: 'Connect Add to the material Color input and look at the result.',
        hint: 'Wire Add output to material Color.',
        validate: (s) => {
          const addNode = s.nodes.find((n) => n.data?.type === 'math/add');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!addNode || !matNode) return false;
          return s.edges.some(
            (e) => e.source === addNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
        },
      },
      {
        id: 't6_add_multiply',
        label: 'Add a Multiply Node',
        description: 'Add a Multiply node from Math to scale the blended result down.',
        hint: 'Left Panel -> Math -> Multiply.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'math/mul'),
      },
      {
        id: 't6_insert_multiply',
        label: 'Scale Down with Multiply',
        description:
          'Rewire the graph so Add feeds Multiply A and Multiply feeds the material Color input. Set Multiply B to 0.5 either by typing it directly in the Properties panel or by connecting a Float node set to 0.5.',
        hint: 'Chain Add -> Multiply A and Multiply -> Material Color, then set Multiply B to 0.5 via the Properties panel or a Float node.',
        manualComplete: true,
        validate: (s) => {
          const addNode = s.nodes.find((n) => n.data?.type === 'math/add');
          const mulNode = s.nodes.find((n) => n.data?.type === 'math/mul');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!addNode || !mulNode || !matNode) return false;
          const addToMulA = s.edges.some(
            (e) => e.source === addNode.id && e.target === mulNode.id && e.targetHandle === 'a'
          );
          const floatNode = s.nodes.find(
            (n) => n.data?.type === 'const/float' && n.data.values?.value === 0.5
          );
          const hasFloatToMulB = floatNode
            ? s.edges.some(
                (e) => e.source === floatNode.id && e.target === mulNode.id && e.targetHandle === 'b'
              )
            : false;
          const hasMulBValue = mulNode.data.values?.b === 0.5;
          const mulToMat = s.edges.some(
            (e) => e.source === mulNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
          return addToMulA && (hasFloatToMulB || hasMulBValue) && mulToMat;
        },
      },
    ],
  },
  {
    id: 'tutorial_7',
    title: 'Animating with Time',
    description:
      'Shaders do not have to stay static. The Time node and a little math can create pulsing, flowing, animated effects.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 500, y: 150 });
      store.addNode('const/color', { x: 160, y: 150 }, { values: { value: '#4488ff' } });
      const currentState = useEditorStore.getState();
      const material = currentState.nodes.find((n) => n.data.type === 'material/standard');
      const color = currentState.nodes.find((n) => n.data.type === 'const/color');
      if (material && color) {
        currentState.onConnect({
          source: color.id,
          sourceHandle: 'out',
          target: material.id,
          targetHandle: 'colorNode',
        });
      }
      deselectAll();
    },
    tasks: [
      {
        id: 't7_add_time',
        label: 'Add a Time Node',
        description: 'Add a Time node from Geometry. It outputs the number of seconds since the page loaded.',
        hint: 'Left Panel -> Geometry -> Time.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'geo/time'),
      },
      {
        id: 't7_add_sin',
        label: 'Add a Sin Node',
        description: 'Add a Sin node from Math to turn a linearly increasing value into a wave.',
        hint: 'Left Panel -> Math -> Sin.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'math/sin'),
      },
      {
        id: 't7_connect_time_sin',
        label: 'Connect Time to Sin',
        description: 'Connect the Time output to the Sin input.',
        hint: 'Drag Time output to Sin input.',
        validate: (s) => {
          const timeNode = s.nodes.find((n) => n.data?.type === 'geo/time');
          const sinNode = s.nodes.find((n) => n.data?.type === 'math/sin');
          if (!timeNode || !sinNode) return false;
          return s.edges.some(
            (e) => e.source === timeNode.id && e.target === sinNode.id && e.targetHandle === 'x'
          );
        },
      },
      {
        id: 't7_add_remap',
        label: 'Remap to 0-1 Range',
        description:
          'Add a Remap node, then set In Low to -1 so the Sin wave maps from -1..1 into the 0..1 range that colors expect.',
        hint: 'Left Panel -> Math -> Remap, then change In Low to -1 in Properties.',
        validate: (s) => {
          const remapNode = s.nodes.find((n) => n.data?.type === 'math/remap');
          return !!remapNode && remapNode.data.values?.inLow === -1;
        },
      },
      {
        id: 't7_connect_to_material',
        label: 'Connect to Material Color',
        description:
          'Now connect the Remap output to the material Color input and watch the sphere pulse.',
        hint: 'Wire Remap output to Material Color and enjoy the animation.',
        manualComplete: true,
        validate: (s) => {
          const remapNode = s.nodes.find((n) => n.data?.type === 'math/remap');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!remapNode || !matNode) return false;
          return s.edges.some(
            (e) => e.source === remapNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
        },
      },
    ],
  },
  {
    id: 'tutorial_8',
    title: 'Working with Textures',
    description:
      'Textures let you paint detailed images onto 3D surfaces. You will load a texture, feed it UV coordinates, and apply it to the material.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 500, y: 150 });
      store.addNode('geo/uv', { x: 50, y: 150 });
      deselectAll();
    },
    tasks: [
      {
        id: 't8_add_texture',
        label: 'Add a Texture Node',
        description: 'Add the Texture node from the Texture category.',
        hint: 'Left Panel -> Texture -> Texture.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'texture/sample'),
      },
      {
        id: 't8_set_url',
        label: 'Upload a Texture Image',
        description:
          'Select the Texture node and upload an image from your computer using the Upload button in the Properties panel. The step will complete once the image is attached.',
        hint: 'Click the Texture node, then use the upload button next to the image field.',
        validate: (s) => {
          const textureNode = s.nodes.find((n) => n.data?.type === 'texture/sample');
          return !!textureNode && hasUploadedAssetValue(textureNode.data.values?.url);
        },
      },
      {
        id: 't8_connect_uv',
        label: 'Connect UV to Texture',
        description: 'Connect the UV node output to the Texture node UV input.',
        hint: 'Wire UV output to the Texture UV input.',
        validate: (s) => {
          const uvNode = s.nodes.find((n) => n.data?.type === 'geo/uv');
          const textureNode = s.nodes.find((n) => n.data?.type === 'texture/sample');
          if (!uvNode || !textureNode) return false;
          return s.edges.some(
            (e) => e.source === uvNode.id && e.target === textureNode.id && e.targetHandle === 'uv'
          );
        },
      },
      {
        id: 't8_connect_to_material',
        label: 'Apply the Texture',
        description: 'Connect the Texture output to the material Color input so the image shows on the sphere.',
        hint: 'Wire Texture output to Material Color.',
        validate: (s) => {
          const textureNode = s.nodes.find((n) => n.data?.type === 'texture/sample');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!textureNode || !matNode) return false;
          return s.edges.some(
            (e) => e.source === textureNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
        },
      },

    ],
  },
  {
    id: 'tutorial_10',
    title: 'Procedural Noise',
    description:
      'Noise can generate organic, natural-looking patterns entirely from math. We will use it to create a procedural surface pattern.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 550, y: 200 });
      store.addNode('geo/positionWorld', { x: 50, y: 180 });
      deselectAll();
    },
    tasks: [
      {
        id: 't10_add_noise',
        label: 'Add a Noise Node',
        description: 'Add a Noise (Float) node from the Noise category.',
        hint: 'Left Panel -> Noise -> Noise (Float).',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'noise/noise_float'),
      },
      {
        id: 't10_connect_position_noise',
        label: 'Connect Position to Noise',
        description: 'Connect the Position World node to the Noise position input.',
        hint: 'Wire Position World output to Noise position.',
        validate: (s) => {
          const positionNode = s.nodes.find((n) => n.data?.type === 'geo/positionWorld');
          const noiseNode = s.nodes.find((n) => n.data?.type === 'noise/noise_float');
          if (!positionNode || !noiseNode) return false;
          return s.edges.some(
            (e) => e.source === positionNode.id && e.target === noiseNode.id && e.targetHandle === 'position'
          );
        },
      },
      {
        id: 't10_connect_noise_material',
        label: 'Apply Noise to Material',
        description: 'Connect the Noise output to the material Color input to see the pattern.',
        hint: 'Wire Noise output to Material Color.',
        validate: (s) => {
          const noiseNode = s.nodes.find((n) => n.data?.type === 'noise/noise_float');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!noiseNode || !matNode) return false;
          return s.edges.some(
            (e) => e.source === noiseNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
        },
      },
      {
        id: 't10_add_mix_colors',
        label: 'Mix with Colors',
        description:
          'Add a Mix node and feed its A and B inputs with two different colors. You can use two Color nodes, or set the A and B colors directly in the Mix node Properties panel. Use the Noise output as the T input so the surface gets colorful variation.',
        hint: 'Wire Colors (or set A and B values) to Mix A and B, Noise to Mix T, then Mix to Material Color.',
        validate: (s) => {
          const noiseNode = s.nodes.find((n) => n.data?.type === 'noise/noise_float');
          const mixNode = s.nodes.find((n) => n.data?.type === 'math/mix');
          const matNode = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!noiseNode || !mixNode || !matNode) return false;
          const noiseToT = s.edges.some(
            (e) => e.source === noiseNode.id && e.target === mixNode.id && e.targetHandle === 't'
          );
          const hasA =
            s.edges.some((e) => e.target === mixNode.id && e.targetHandle === 'a') ||
            (mixNode.data.values?.a !== undefined && mixNode.data.values?.a !== 0);
          const hasB =
            s.edges.some((e) => e.target === mixNode.id && e.targetHandle === 'b') ||
            (mixNode.data.values?.b !== undefined && mixNode.data.values?.b !== 1);
          const mixToMaterial = s.edges.some(
            (e) => e.source === mixNode.id && e.target === matNode.id && e.targetHandle === 'colorNode'
          );
          return noiseToT && hasA && hasB && mixToMaterial;
        },
      },
      {
        id: 't10_tweak_noise',
        label: 'Tweak the Noise',
        description:
          'Select the Noise node and adjust the Amplitude property to change the pattern intensity.',
        hint: 'Click the Noise node and try a different Amplitude value.',
        manualComplete: true,
        validate: (s) => {
          const noiseNode = s.nodes.find((n) => n.data?.type === 'noise/noise_float');
          return !!noiseNode && noiseNode.data.values?.amplitude !== 1;
        },
      },
    ],
  },
  {
    id: 'tutorial_11',
    title: 'Color & Effects',
    description:
      'Shaders can do a lot with color. Here we will build an edge glow with Fresnel, then experiment with color adjustment nodes.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 500, y: 200 });
      store.addNode('const/color', { x: 80, y: 100 }, { values: { value: '#1a1a2e' } });
      const currentState = useEditorStore.getState();
      const material = currentState.nodes.find((n) => n.data?.type.startsWith('material/'));
      const color = currentState.nodes.find((n) => n.data?.type === 'const/color');
      if (material && color) {
        currentState.onConnect({
          source: color.id,
          sourceHandle: 'out',
          target: material.id,
          targetHandle: 'colorNode',
        });
      }
      deselectAll();
    },
    tasks: [
      {
        id: 't11_add_fresnel',
        label: 'Add a Fresnel Node',
        description: 'Add a Fresnel node from Utils. It brightens the edges of a surface.',
        hint: 'Left Panel -> Utils -> Fresnel.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'utils/fresnel'),
      },
      {
        id: 't11_connect_fresnel_vectors',
        label: 'Connect Fresnel Vectors',
        description:
          'Add Normal View and Position View Direction nodes, then connect them to the Fresnel Normal and View Dir inputs.',
        hint: 'Geometry -> Normal View and Position View Direction, then wire them into Fresnel.',
        validate: (s) => {
          const fresnel = s.nodes.find((n) => n.data?.type === 'utils/fresnel');
          const normal = s.nodes.find((n) => n.data?.type === 'geo/normalView');
          const viewDir = s.nodes.find((n) => n.data?.type === 'geo/positionViewDirection');
          if (!fresnel || !normal || !viewDir) return false;
          const normalToFresnel = s.edges.some(
            (e) => e.source === normal.id && e.target === fresnel.id && e.targetHandle === 'normal'
          );
          const viewDirToFresnel = s.edges.some(
            (e) => e.source === viewDir.id && e.target === fresnel.id && e.targetHandle === 'viewDir'
          );
          return normalToFresnel && viewDirToFresnel;
        },
      },
      {
        id: 't11_add_emissive_color',
        label: 'Prepare an Emissive Color',
        description: 'Add a bright Color node that will become the Fresnel glow color.',
        hint: 'Add a vivid Color node, like cyan or orange.',
        validate: (s) => s.nodes.filter((n) => n.data?.type === 'const/color').length >= 2,
      },
      {
        id: 't11_multiply_fresnel_color',
        label: 'Multiply Fresnel by Color',
        description: 'Combine Fresnel and your glow color with a Multiply node.',
        hint: 'Wire Fresnel and the bright color into Multiply. Either input order is fine.',
        validate: (s) => {
          const fresnel = s.nodes.find((n) => n.data?.type === 'utils/fresnel');
          const mul = s.nodes.find((n) => n.data?.type === 'math/mul');
          const colorNodes = s.nodes.filter((n) => n.data?.type === 'const/color');
          if (!fresnel || !mul || colorNodes.length < 1) return false;
          const multiplyInputs = s.edges.filter(
            (e) => e.target === mul.id && (e.targetHandle === 'a' || e.targetHandle === 'b')
          );
          const hasFresnel = multiplyInputs.some((e) => e.source === fresnel.id);
          const hasColor = multiplyInputs.some((e) => colorNodes.some((cn) => cn.id === e.source));
          return hasFresnel && hasColor;
        },
      },
      {
        id: 't11_enable_emissive',
        label: 'Apply as Emissive',
        description: 'Enable Emissive on the material and connect the Multiply result to it.',
        hint: 'Select the material, enable Emissive, then wire Multiply to Emissive.',
        validate: (s) => {
          const mat = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          const mul = s.nodes.find((n) => n.data?.type === 'math/mul');
          if (!mat || !mul) return false;
          return s.edges.some(
            (e) => e.source === mul.id && e.target === mat.id && e.targetHandle === 'emissiveNode'
          );
        },
      },
      {
        id: 't11_explore',
        label: 'Experiment with Saturation',
        description:
          'Add a Saturation node and try using it to make your colors softer or more vivid.',
        hint: 'Left Panel -> Utils -> Saturation.',
        manualComplete: true,
        validate: (s) => s.nodes.some((n) => n.data?.type === 'utils/saturation'),
      },
    ],
  },
  {
    id: 'tutorial_12',
    title: 'Vectors & Displacement',
    description:
      'Shaders can move geometry, not just color it. You will use position and normal vectors to push vertices outward.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 550, y: 200 });
      deselectAll();
    },
    tasks: [
      {
        id: 't12_add_position',
        label: 'Add a Position Node',
        description: 'Add a Position Local node from Geometry.',
        hint: 'Left Panel -> Geometry -> Position Local.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'geo/positionLocal'),
      },
      {
        id: 't12_add_normal',
        label: 'Add a Normal Node',
        description: 'Add a Normal Local node from Geometry.',
        hint: 'Left Panel -> Geometry -> Normal Local.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'geo/normalLocal'),
      },
      {
        id: 't12_multiply_normal',
        label: 'Scale the Normal',
        description:
          'Use Multiply to scale the normal down to 0.2. Wire Normal to Multiply A, then set Multiply B to 0.2 either by typing it in the Properties panel or by connecting a Float node set to 0.2.',
        hint: 'Wire Normal to Multiply A and set Multiply B to 0.2 via the Properties panel or a Float node.',
        validate: (s) => {
          const normal = s.nodes.find((n) => n.data?.type === 'geo/normalLocal');
          const mul = s.nodes.find((n) => n.data?.type === 'math/mul');
          if (!normal || !mul) return false;
          const normalToMul = s.edges.some(
            (e) => e.source === normal.id && e.target === mul.id && e.targetHandle === 'a'
          );
          const floatNode = s.nodes.find((n) => n.data?.type === 'const/float' && n.data.values?.value === 0.2);
          const hasFloatToMulB = floatNode
            ? s.edges.some(
                (e) => e.source === floatNode.id && e.target === mul.id && e.targetHandle === 'b'
              )
            : false;
          const hasMulBValue = mul.data.values?.b === 0.2;
          return normalToMul && (hasFloatToMulB || hasMulBValue);
        },
      },
      {
        id: 't12_add_positions',
        label: 'Offset the Position',
        description: 'Use Add to combine Position Local with the scaled normal offset.',
        hint: 'Wire Position to Add A and Multiply to Add B.',
        validate: (s) => {
          const position = s.nodes.find((n) => n.data?.type === 'geo/positionLocal');
          const mul = s.nodes.find((n) => n.data?.type === 'math/mul');
          const add = s.nodes.find((n) => n.data?.type === 'math/add');
          if (!position || !mul || !add) return false;
          const positionToAdd = s.edges.some(
            (e) => e.source === position.id && e.target === add.id && e.targetHandle === 'a'
          );
          const mulToAdd = s.edges.some(
            (e) => e.source === mul.id && e.target === add.id && e.targetHandle === 'b'
          );
          return positionToAdd && mulToAdd;
        },
      },
      {
        id: 't12_connect_position',
        label: 'Apply Displacement',
        description: 'Connect the Add output to the material Position input and finish the tutorial.',
        hint: 'Wire Add to Material Position.',
        manualComplete: true,
        validate: (s) => {
          const add = s.nodes.find((n) => n.data?.type === 'math/add');
          const mat = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!add || !mat) return false;
          return s.edges.some(
            (e) => e.source === add.id && e.target === mat.id && e.targetHandle === 'positionNode'
          );
        },
      },
    ],
  },
  {
    id: 'tutorial_13',
    title: 'Logic & Masking',
    description:
      'Sometimes you want different effects in different places. Split, Step, and Select make it easy to build masks and hard cutoffs.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 550, y: 200 });
      store.addNode('geo/uv', { x: 50, y: 200 });
      deselectAll();
    },
    tasks: [
      {
        id: 't13_add_step',
        label: 'Add a Step Node',
        description: 'Add a Step node and use the UV X output as its input so you get a hard edge mask.',
        hint: 'Wire UV X to Step X.',
        validate: (s) => {
          const uv = s.nodes.find((n) => n.data?.type === 'geo/uv');
          const step = s.nodes.find((n) => n.data?.type === 'math/step');
          if (!uv || !step) return false;
          return s.edges.some((e) => e.source === uv.id && e.target === step.id && e.targetHandle === 'x');
        },
      },
      {
        id: 't13_add_greater_than',
        label: 'Compare the Mask',
        description:
          'Add a Greater Than node and compare the Step output against 0.5 so the result becomes a boolean. Wire Step output to Greater Than A, then set B to 0.5 either by typing it in the Properties panel or by connecting a Float node set to 0.5.',
        hint: 'Wire Step output to Greater Than A and set Greater Than B to 0.5 via the Properties panel or a Float node.',
        validate: (s) => {
          const step = s.nodes.find((n) => n.data?.type === 'math/step');
          const gt = s.nodes.find((n) => n.data?.type === 'logic/greaterThan');
          if (!step || !gt) return false;
          const stepToGt = s.edges.some(
            (e) => e.source === step.id && e.target === gt.id && e.targetHandle === 'a'
          );
          const floatNode = s.nodes.find((n) => n.data?.type === 'const/float' && n.data.values?.value === 0.5);
          const hasFloatToGtB = floatNode
            ? s.edges.some(
                (e) => e.source === floatNode.id && e.target === gt.id && e.targetHandle === 'b'
              )
            : false;
          const hasGtBValue = gt.data.values?.b === 0.5;
          return stepToGt && (hasFloatToGtB || hasGtBValue);
        },
      },
      {
        id: 't13_setup_select',
        label: 'Wire the Conditional',
        description: 'Add a Select node and two Color nodes, then wire the boolean into the Select condition.',
        hint: 'Wire Greater Than to Condition, then colors to True and False.',
        validate: (s) => {
          const gt = s.nodes.find((n) => n.data?.type === 'logic/greaterThan');
          const select = s.nodes.find((n) => n.data?.type === 'logic/select');
          const colorNodes = s.nodes.filter((n) => n.data?.type === 'const/color');
          if (!gt || !select || colorNodes.length < 2) return false;
          const condition = s.edges.some(
            (e) => e.source === gt.id && e.target === select.id && e.targetHandle === 'cond'
          );
          const hasTrue = s.edges.some(
            (e) => e.target === select.id && e.targetHandle === 'trueVal' && colorNodes.some((cn) => cn.id === e.source)
          );
          const hasFalse = s.edges.some(
            (e) => e.target === select.id && e.targetHandle === 'falseVal' && colorNodes.some((cn) => cn.id === e.source)
          );
          return condition && hasTrue && hasFalse;
        },
      },
      {
        id: 't13_connect_material',
        label: 'Apply the Mask',
        description:
          'Connect the Select output to the material Color input, then finish the tutorial once the split looks right.',
        hint: 'Wire Select output to Material Color.',
        manualComplete: true,
        validate: (s) => {
          const select = s.nodes.find((n) => n.data?.type === 'logic/select');
          const mat = s.nodes.find((n) => n.data?.type.startsWith('material/'));
          if (!select || !mat) return false;
          return s.edges.some(
            (e) => e.source === select.id && e.target === mat.id && e.targetHandle === 'colorNode'
          );
        },
      },
    ],
  },
  {
    id: 'tutorial_14',
    title: 'Post-Processing',
    description:
      'Post-processing affects the rendered image after the material graph has run. We will switch to the Post graph and add a Gaussian blur.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 450, y: 200 });
      deselectAll();
      store.setActiveRootGraph('post');
      store.updatePreviewSettings({ postEnabled: false });
      deselectAll();
    },
    tasks: [
      {
        id: 't14_understand_post',
        label: 'Understand the Post Graph',
        description:
          'Connect Post Input Color straight into Post Output Color so the graph has a simple pass-through to begin with.',
        hint: 'Wire Post Input Color to Post Output Color.',
        validate: (s) => {
          const postInput = s.nodes.find((n) => n.data?.type === 'post/input');
          const postOutput = s.nodes.find((n) => n.data?.type === 'post/output');
          if (!postInput || !postOutput) return false;
          return s.edges.some(
            (e) => e.source === postInput.id && e.target === postOutput.id && e.targetHandle === 'color'
          );
        },
      },
      {
        id: 't14_add_blur',
        label: 'Add a Gaussian Blur',
        description: 'Add a Gaussian Blur node from Post FX.',
        hint: 'Left Panel -> Post FX -> Gaussian Blur.',
        validate: (s) => s.nodes.some((n) => n.data?.type === 'postfx/gaussianBlur'),
      },
      {
        id: 't14_insert_blur',
        label: 'Insert Gaussian Blur into the Chain',
        description:
          'Rewire the post graph so Gaussian Blur sits between Post Input and Post Output.',
        hint: 'Wire Post Input Color to Gaussian Blur input, then Gaussian Blur output to Post Output Color.',
        validate: (s) => {
          const postInput = s.nodes.find((n) => n.data?.type === 'post/input');
          const postOutput = s.nodes.find((n) => n.data?.type === 'post/output');
          const blur = s.nodes.find((n) => n.data?.type === 'postfx/gaussianBlur');
          if (!postInput || !postOutput || !blur) return false;
          const inToBlur = s.edges.some(
            (e) => e.source === postInput.id && e.target === blur.id && e.targetHandle === 'input'
          );
          const blurToOut = s.edges.some(
            (e) => e.source === blur.id && e.target === postOutput.id && e.targetHandle === 'color'
          );
          return inToBlur && blurToOut;
        },
      },
      {
        id: 't14_enable_post_preview',
        label: 'Enable Post-Processing in Preview',
        description: 'Turn on Post-Processing in the preview controls so the blur effect becomes visible.',
        hint: 'Find the Post-Processing toggle in the preview settings and turn it on.',
        validate: (s) => s.previewSettings.postEnabled === true,
      },
      {
        id: 't14_tweak_blur',
        label: 'Tweak the Gaussian Blur',
        description: 'Select the Gaussian Blur node and adjust its Sigma or Direction.',
        hint: 'Try changing Sigma or Direction in Properties.',
        manualComplete: true,
        validate: (s) => {
          const blur = s.nodes.find((n) => n.data?.type === 'postfx/gaussianBlur');
          if (!blur) return false;
          return blur.data.values?.sigma !== 4;
        },
      },
    ],
  },
  {
    id: 'tutorial_15',
    title: 'Custom Nodes with Subgraphs',
    description:
      'Package a reusable UV color gradient into a custom node you can drop into any material.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 600, y: 200 });
      store.addNode('math/mix', { x: 350, y: 200 });
      store.addNode('geo/uv', { x: 50, y: 200 });
      store.addNode('const/color', { x: 50, y: 50 }, { values: { value: '#ff0000' } });
      store.addNode('const/color', { x: 50, y: 350 }, { values: { value: '#0000ff' } });
      const afterAdd = useEditorStore.getState();
      const mat = afterAdd.nodes.find((n) => n.data?.type.startsWith('material/'));
      const mix = afterAdd.nodes.find((n) => n.data?.type === 'math/mix');
      const uv = afterAdd.nodes.find((n) => n.data?.type === 'geo/uv');
      const colorA = afterAdd.nodes.find((n) => n.data?.type === 'const/color' && n.position.y < 200);
      const colorB = afterAdd.nodes.find((n) => n.data?.type === 'const/color' && n.position.y > 200);
      if (mat && mix && uv && colorA && colorB) {
        store.onConnect({ source: uv.id, sourceHandle: 'x', target: mix.id, targetHandle: 't' });
        store.onConnect({ source: colorA.id, sourceHandle: 'out', target: mix.id, targetHandle: 'a' });
        store.onConnect({ source: colorB.id, sourceHandle: 'out', target: mix.id, targetHandle: 'b' });
        store.onConnect({ source: mix.id, sourceHandle: 'out', target: mat.id, targetHandle: 'colorNode' });
      }
      deselectAll();
    },
    tasks: [
      {
        id: 't15_select_uv_mix',
        label: 'Select UV and Mix',
        description: 'Select the UV and Mix nodes so they can be bundled into a reusable gradient subgraph.',
        hint: 'Hold Shift and click both the UV and Mix nodes, or switch to Select mode and box-select them.',
        validate: (s) => {
          if (s.selectedNodeIds.length < 2) return false;
          const selectedTypes = new Set(
            s.nodes.filter((n) => s.selectedNodeIds.includes(n.id)).map((n) => n.data?.type)
          );
          return selectedTypes.has('geo/uv') && selectedTypes.has('math/mix');
        },
      },
      {
        id: 't15_create_subgraph',
        label: 'Create a Subgraph',
        description: 'Use the Create Subgraph button to bundle the selected nodes into a reusable custom node.',
        hint: 'Click Create Subgraph in the bottom toolbar.',
        manualComplete: true,
        validate: (s) => s.editorMode === 'subgraph',
      },
      {
        id: 't15_name_subgraph',
        label: 'Name It "Simple Gradient"',
        description: 'Give the subgraph a descriptive name so it appears clearly in the Node Picker.',
        hint: 'Type "Simple Gradient" in the subgraph name field at the top.',
        manualComplete: true,
        validate: alwaysComplete,
      },
      {
        id: 't15_add_color_inputs',
        label: 'Add Color Inputs',
        description: 'Add two color inputs named color1 and color2 to the subgraph interface.',
        hint: 'Select the input anchor node on the left, add two ports, set their type to Color, and name them color1 and color2.',
        validate: (s) => {
          if (s.editorMode !== 'subgraph' || !s.editingSubgraphId) return false;
          const inputNode = s.nodes.find((n) => n.id === 'subgraph-input');
          const ports = inputNode?.data.dynamicPorts || s.subgraphs[s.editingSubgraphId]?.inputs || [];
          const colorPorts = ports.filter((p) => p.type === 'color');
          const labels = new Set(colorPorts.map((p) => p.label.toLowerCase()));
          return colorPorts.length >= 2 && labels.has('color1') && labels.has('color2');
        },
      },
      {
        id: 't15_wire_gradient',
        label: 'Wire the Gradient',
        description: 'Connect color1 to Mix A, color2 to Mix B, and Mix output to the subgraph output. UV should already feed Mix T.',
        hint: 'Inside the subgraph, wire the input anchor to Mix and Mix to the output anchor.',
        validate: (s) => {
          const mix = s.nodes.find((n) => n.data?.type === 'math/mix');
          const uv = s.nodes.find((n) => n.data?.type === 'geo/uv');
          if (!mix || !uv) return false;
          const mixA = s.edges.some(
            (e) => e.source === 'subgraph-input' && e.target === mix.id && e.targetHandle === 'a'
          );
          const mixB = s.edges.some(
            (e) => e.source === 'subgraph-input' && e.target === mix.id && e.targetHandle === 'b'
          );
          const mixT = s.edges.some(
            (e) => e.source === uv.id && e.target === mix.id && e.targetHandle === 't'
          );
          const mixToOutput = s.edges.some(
            (e) => e.source === mix.id && e.target === 'subgraph-output'
          );
          return mixA && mixB && mixT && mixToOutput;
        },
      },
      {
        id: 't15_save_exit',
        label: 'Save and Exit',
        description: 'Save the subgraph and return to the main graph.',
        hint: 'Click Save & Exit in the subgraph toolbar.',
        manualComplete: true,
        validate: (s) => {
          if (s.editorMode === 'subgraph') return false;
          const customNode = s.nodes.find((n) => n.data?.type.startsWith('custom/'));
          if (!customNode) return false;
          const subgraph = s.subgraphs[customNode.data.type];
          return subgraph?.name.toLowerCase() === 'simple gradient';
        },
      },
      {
        id: 't15_tweak_gradient',
        label: 'Tweak the Gradient',
        description: 'Play with your new Simple Gradient node. Try changing one of the color values to see the gradient update, then finish when you are happy.',
        hint: 'Select a Color node and change its value in the Properties panel.',
        manualComplete: true,
        validate: alwaysComplete,
      },
    ],
  },
  {
    id: 'tutorial_16',
    title: 'Viewing Your Code',
    description:
      'Everything you build in the graph compiles to real TSL code. This tutorial shows how the visual graph maps to generated code.',
    setup: () => {
      const store = useEditorStore.getState();
      resetTutorialWorkspace(store);
      store.addNode('material/standard', { x: 450, y: 200 });
      store.addNode('const/color', { x: 50, y: 100 }, { values: { value: '#ff6600' } });
      store.addNode('math/mul', { x: 250, y: 200 });
      store.addNode('const/float', { x: 50, y: 300 }, { values: { value: 0.5 } });
      const afterAdd = useEditorStore.getState();
      const material = afterAdd.nodes.find((n) => n.data?.type.startsWith('material/'));
      const color = afterAdd.nodes.find((n) => n.data?.type === 'const/color');
      const mul = afterAdd.nodes.find((n) => n.data?.type === 'math/mul');
      const floatNode = afterAdd.nodes.find((n) => n.data?.type === 'const/float');
      if (material && color && mul && floatNode) {
        store.onConnect({ source: color.id, sourceHandle: 'out', target: mul.id, targetHandle: 'a' });
        store.onConnect({ source: floatNode.id, sourceHandle: 'out', target: mul.id, targetHandle: 'b' });
        store.onConnect({ source: mul.id, sourceHandle: 'out', target: material.id, targetHandle: 'colorNode' });
      }
      deselectAll();
    },
    tasks: [
      {
        id: 't16_open_code_panel',
        label: 'Open the Code Panel',
        description: 'Open the View Code panel from the bottom toolbar.',
        hint: 'Click the </> or View Code button.',
        manualComplete: true,
        validate: alwaysComplete,
      },
      {
        id: 't16_read_code',
        label: 'Read the Generated Code',
        description: 'Take a moment to look at the compiled TSL output.',
        hint: 'Notice how the node chain becomes code.',
        manualComplete: true,
        validate: alwaysComplete,
      },
      {
        id: 't16_modify_and_observe',
        label: 'Modify and Watch',
        description: 'Change the Float value to 0.8 and watch the generated code update.',
        hint: 'Edit the Float node value in Properties.',
        validate: (s) => {
          const floatNode = s.nodes.find((n) => n.data?.type === 'const/float');
          return floatNode ? floatNode.data?.values?.value === 0.8 : false;
        },
      },
      {
        id: 't16_copy_code',
        label: 'Copy the Code',
        description: 'Copy the TSL code so you can paste it into a Three.js project later.',
        hint: 'Click the copy button in the code panel.',
        manualComplete: true,
        validate: alwaysComplete,
      },
    ],
  },
];
