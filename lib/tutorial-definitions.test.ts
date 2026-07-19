import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/editor';
import { initializeNodes } from '@/lib/nodes';
import { registry } from '@/lib/registry';
import { getMaterialActiveInputsSet } from '@/lib/material-inputs';
import { tutorialDefinitions } from './tutorial-definitions';

const getTutorial = (id: string) => {
  const tutorial = tutorialDefinitions.find((item) => item.id === id);
  if (!tutorial) {
    throw new Error(`Missing tutorial: ${id}`);
  }
  return tutorial;
};

describe('Tutorial Definitions Validators', () => {
  beforeAll(() => {
    initializeNodes();
  });

  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  it('keeps the tutorial order anchored by the new canvas and preview lessons', () => {
    expect(tutorialDefinitions[0].id).toBe('tutorial_4');
    expect(tutorialDefinitions[1].id).toBe('tutorial_5');
    expect(tutorialDefinitions[2].id).toBe('tutorial_1');
    expect(tutorialDefinitions.some((tutorial) => tutorial.id === 'tutorial_16')).toBe(true);
  });

  it('resets preview settings when a tutorial starts', () => {
    const tutorial = getTutorial('tutorial_10');
    const store = useEditorStore.getState();

    store.updatePreviewSettings({
      mesh: 'torus',
      environment: 'studio',
      showEnvironmentBackground: true,
    });

    tutorial.setup?.();

    const previewSettings = useEditorStore.getState().previewSettings;
    expect(previewSettings.mesh).toBe('sphere');
    expect(previewSettings.environment).toBe('none');
    expect(previewSettings.showEnvironmentBackground).toBe(false);
  });

  describe('Tutorial 1: Your First Nodes', () => {
    const tutorial = getTutorial('tutorial_1');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('validates adding a float node', () => {
      const task = tutorial.tasks[0];
      const store = useEditorStore.getState();

      expect(task.validate(store)).toBe(false);

      store.addNode('const/float', { x: 0, y: 0 });
      expect(task.validate(useEditorStore.getState())).toBe(true);
    });

    it('validates float value update to 0.5', () => {
      const task = tutorial.tasks[1];
      const store = useEditorStore.getState();

      store.addNode('const/float', { x: 0, y: 0 });
      const addedFloat = useEditorStore.getState().nodes.find((n) => n.data.type === 'const/float')!;
      expect(task.validate(useEditorStore.getState())).toBe(false);

      store.updateNodeValue(addedFloat.id, 'value', 0.5);
      expect(task.validate(useEditorStore.getState())).toBe(true);
    });

    it('validates adding a color node', () => {
      const task = tutorial.tasks[2];
      const store = useEditorStore.getState();

      expect(task.validate(store)).toBe(false);

      store.addNode('const/color', { x: 0, y: 0 });
      expect(task.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 4: Navigating the Canvas', () => {
    const tutorial = getTutorial('tutorial_4');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('validates moving a node', () => {
      const task = tutorial.tasks[2];
      const store = useEditorStore.getState();

      const floatNode = store.nodes.find((n) => n.data.type === 'const/float')!;
      expect(task.validate(store)).toBe(false);

      useEditorStore.setState({
        nodes: store.nodes.map((node) =>
          node.id === floatNode.id ? { ...node, position: { x: 220, y: 420 } } : node
        ),
      });
      expect(task.validate(useEditorStore.getState())).toBe(true);
    });

    it('validates deleting and undoing a node', () => {
      const deleteTask = tutorial.tasks[3];
      const undoTask = tutorial.tasks[4];
      const store = useEditorStore.getState();

      const floatNode = store.nodes.find((n) => n.data.type === 'const/float')!;
      store.deleteNode(floatNode.id);
      expect(deleteTask.validate(useEditorStore.getState())).toBe(true);

      store.undo();
      expect(undoTask.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 5: Customizing the Preview', () => {
    const tutorial = getTutorial('tutorial_5');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('starts with the blue color connected to the material preview', () => {
      const state = useEditorStore.getState();
      const colorNode = state.nodes.find((n) => n.data.type === 'const/color');
      const materialNode = state.nodes.find((n) => n.data.type.startsWith('material/'));

      expect(colorNode?.data.values.value).toBe('#4488ff');
      expect(materialNode).toBeDefined();
      expect(
        state.edges.some(
          (edge) =>
            edge.source === colorNode?.id &&
            edge.target === materialNode?.id &&
            edge.targetHandle === 'colorNode'
        )
      ).toBe(true);
    });

    it('validates geometry and environment changes', () => {
      const geometryTask = tutorial.tasks[1];
      const environmentTask = tutorial.tasks[2];
      const backgroundTask = tutorial.tasks[3];
      const store = useEditorStore.getState();

      expect(geometryTask.validate(store)).toBe(false);
      expect(environmentTask.validate(store)).toBe(false);
      expect(backgroundTask.validate(store)).toBe(false);

      store.updatePreviewSettings({
        mesh: 'torus',
        environment: 'studio',
        showEnvironmentBackground: true,
      });

      const updatedState = useEditorStore.getState();
      expect(geometryTask.validate(updatedState)).toBe(true);
      expect(environmentTask.validate(updatedState)).toBe(true);
      expect(backgroundTask.validate(updatedState)).toBe(true);
    });
  });

  describe('Tutorial 10: Procedural Noise', () => {
    const tutorial = getTutorial('tutorial_10');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('validates noise wiring', () => {
      const store = useEditorStore.getState();

      const noiseTask = tutorial.tasks[0];
      const connectTask = tutorial.tasks[1];

      store.addNode('noise/noise_float', { x: 0, y: 0 });
      const noiseNode = useEditorStore.getState().nodes.find((n) => n.data.type === 'noise/noise_float')!;

      expect(noiseTask.validate(useEditorStore.getState())).toBe(true);
      expect(connectTask.validate(useEditorStore.getState())).toBe(false);

      const positionNode = store.nodes.find((n) => n.data.type === 'geo/positionWorld')!;
      store.onConnect({
        source: positionNode.id,
        sourceHandle: 'out',
        target: noiseNode.id,
        targetHandle: 'position',
      });

      expect(connectTask.validate(useEditorStore.getState())).toBe(true);
    });

    it('accepts mix colors set directly on the mix node', () => {
      const task = tutorial.tasks[3];
      const store = useEditorStore.getState();

      store.addNode('math/mix', { x: 300, y: 200 });
      store.addNode('noise/noise_float', { x: 100, y: 200 });
      const state = useEditorStore.getState();
      const mixNode = state.nodes.find((n) => n.data.type === 'math/mix')!;
      const noiseNode = state.nodes.find((n) => n.data.type === 'noise/noise_float')!;
      const matNode = state.nodes.find((n) => n.data.type.startsWith('material/'))!;

      expect(task.validate(state)).toBe(false);

      store.updateNodeValue(mixNode.id, 'a', '#ff4400');
      store.updateNodeValue(mixNode.id, 'b', '#0044ff');
      store.onConnect({
        source: noiseNode.id,
        sourceHandle: 'out',
        target: mixNode.id,
        targetHandle: 't',
      });
      store.onConnect({
        source: mixNode.id,
        sourceHandle: 'out',
        target: matNode.id,
        targetHandle: 'colorNode',
      });

      expect(task.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 7: Animating with Time', () => {
    const tutorial = getTutorial('tutorial_7');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('starts with the color node connected to the material color input', () => {
      const state = useEditorStore.getState();

      const material = state.nodes.find((n) => n.data.type === 'material/standard');
      const color = state.nodes.find((n) => n.data.type === 'const/color');

      expect(material).toBeDefined();
      expect(color).toBeDefined();
      expect(
        getMaterialActiveInputsSet(material!.data, registry.get(material!.data.type)).has('colorNode')
      ).toBe(true);
      expect(state.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: color?.id,
            sourceHandle: 'out',
            target: material?.id,
            targetHandle: 'colorNode',
          }),
        ])
      );
    });

    it('requires remap inLow to be set to -1', () => {
      const task = tutorial.tasks[3];
      const store = useEditorStore.getState();

      store.addNode('math/remap', { x: 200, y: 200 });
      const remapNode = useEditorStore.getState().nodes.find((n) => n.data.type === 'math/remap')!;

      expect(task.validate(useEditorStore.getState())).toBe(false);

      store.updateNodeValue(remapNode.id, 'inLow', -1);
      expect(task.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 8: Working with Textures', () => {
    const tutorial = getTutorial('tutorial_8');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('requires an uploaded asset id instead of the default texture url', () => {
      const task = tutorial.tasks[1];
      const store = useEditorStore.getState();

      store.addNode('texture/sample', { x: 240, y: 180 });
      const textureNode = useEditorStore.getState().nodes.find((n) => n.data.type === 'texture/sample')!;

      useEditorStore.setState({
        nodes: useEditorStore.getState().nodes.map((node) =>
          node.id === textureNode.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  values: {
                    ...node.data.values,
                    url: '/uv.png',
                  },
                },
              }
            : node
        ),
      });

      expect(useEditorStore.getState().nodes.find((n) => n.id === textureNode.id)?.data.values.url).toBe('/uv.png');
      expect(task.validate(useEditorStore.getState())).toBe(false);

      useEditorStore.setState({
        nodes: useEditorStore.getState().nodes.map((node) =>
          node.id === textureNode.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  values: {
                    ...node.data.values,
                    url: {
                      url: 'blob:uploaded-texture',
                      assetId: 'tutorial:tutorial-sandbox:asset-1',
                    },
                  },
                },
              }
            : node
        ),
      });

      expect(task.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 11: Color & Effects', () => {
    const tutorial = getTutorial('tutorial_11');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('starts with the base color connected to the material color input', () => {
      const state = useEditorStore.getState();

      const material = state.nodes.find((n) => n.data.type === 'material/standard');
      const color = state.nodes.find((n) => n.data.type === 'const/color');

      expect(material).toBeDefined();
      expect(color?.data.values.value).toBe('#1a1a2e');
      expect(
        getMaterialActiveInputsSet(material!.data, registry.get(material!.data.type)).has('colorNode')
      ).toBe(true);
      expect(state.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: color?.id,
            sourceHandle: 'out',
            target: material?.id,
            targetHandle: 'colorNode',
          }),
        ])
      );
    });

    it('requires real normal and view direction connections for Fresnel', () => {
      const task = tutorial.tasks[1];
      const store = useEditorStore.getState();

      store.addNode('utils/fresnel', { x: 240, y: 180 });
      store.addNode('geo/normalView', { x: 40, y: 120 });
      store.addNode('geo/positionViewDirection', { x: 40, y: 240 });

      const state = useEditorStore.getState();
      const fresnel = state.nodes.find((n) => n.data.type === 'utils/fresnel')!;
      const normal = state.nodes.find((n) => n.data.type === 'geo/normalView')!;
      const viewDir = state.nodes.find((n) => n.data.type === 'geo/positionViewDirection')!;

      expect(task.validate(state)).toBe(false);

      store.onConnect({ source: normal.id, sourceHandle: 'out', target: fresnel.id, targetHandle: 'normal' });
      store.onConnect({ source: viewDir.id, sourceHandle: 'out', target: fresnel.id, targetHandle: 'viewDir' });

      expect(task.validate(useEditorStore.getState())).toBe(true);
    });

    it('accepts Fresnel multiplied by any connected Color node', () => {
      const task = tutorial.tasks[3];
      const store = useEditorStore.getState();

      store.addNode('utils/fresnel', { x: 240, y: 180 });
      store.addNode('math/mul', { x: 440, y: 180 });
      store.addNode('const/color', { x: 240, y: 320 }, { values: { value: '#00ffff' } });

      const state = useEditorStore.getState();
      const fresnel = state.nodes.find((n) => n.data.type === 'utils/fresnel')!;
      const mul = state.nodes.find((n) => n.data.type === 'math/mul')!;
      const colorNodes = state.nodes.filter((n) => n.data.type === 'const/color');
      const glowColor = colorNodes[colorNodes.length - 1];

      store.onConnect({ source: fresnel.id, sourceHandle: 'out', target: mul.id, targetHandle: 'a' });
      store.onConnect({ source: glowColor.id, sourceHandle: 'out', target: mul.id, targetHandle: 'b' });

      expect(task.validate(useEditorStore.getState())).toBe(true);
    });

    it('accepts Color and Fresnel connected to Multiply in reverse order', () => {
      const task = tutorial.tasks[3];
      const store = useEditorStore.getState();

      store.addNode('utils/fresnel', { x: 240, y: 180 });
      store.addNode('math/mul', { x: 440, y: 180 });
      store.addNode('const/color', { x: 240, y: 320 }, { values: { value: '#00ffff' } });

      const state = useEditorStore.getState();
      const fresnel = state.nodes.find((n) => n.data.type === 'utils/fresnel')!;
      const mul = state.nodes.find((n) => n.data.type === 'math/mul')!;
      const colorNodes = state.nodes.filter((n) => n.data.type === 'const/color');
      const glowColor = colorNodes[colorNodes.length - 1];

      store.onConnect({ source: glowColor.id, sourceHandle: 'out', target: mul.id, targetHandle: 'a' });
      store.onConnect({ source: fresnel.id, sourceHandle: 'out', target: mul.id, targetHandle: 'b' });

      expect(task.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 13: Logic & Masking', () => {
    const tutorial = getTutorial('tutorial_13');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('validates step and select wiring', () => {
      const store = useEditorStore.getState();

      const uv = store.nodes.find((n) => n.data.type === 'geo/uv')!;

      store.addNode('math/step', { x: 350, y: 200 });
      const step = useEditorStore.getState().nodes.find((n) => n.data.type === 'math/step')!;
      store.onConnect({ source: uv.id, sourceHandle: 'x', target: step.id, targetHandle: 'x' });

      store.addNode('logic/greaterThan', { x: 500, y: 200 });
      const greaterThan = useEditorStore.getState().nodes.find((n) => n.data.type === 'logic/greaterThan')!;
      store.addNode('const/float', { x: 470, y: 320 }, { values: { value: 0.5 } });
      const threshold = useEditorStore.getState().nodes.find(
        (n) => n.data.type === 'const/float' && n.data.values.value === 0.5
      )!;
      store.onConnect({ source: step.id, sourceHandle: 'out', target: greaterThan.id, targetHandle: 'a' });
      store.onConnect({ source: threshold.id, sourceHandle: 'out', target: greaterThan.id, targetHandle: 'b' });

      store.addNode('logic/select', { x: 650, y: 200 });
      const select = useEditorStore.getState().nodes.find((n) => n.data.type === 'logic/select')!;
      store.addNode('const/color', { x: 620, y: 320 }, { values: { value: '#ff0000' } });
      store.addNode('const/color', { x: 760, y: 320 }, { values: { value: '#0000ff' } });
      const colors = useEditorStore.getState().nodes.filter((n) => n.data.type === 'const/color');
      const falseColor = colors.find((n) => n.position.x < 700)!;
      const trueColor = colors.find((n) => n.position.x > 700)!;
      store.onConnect({ source: greaterThan.id, sourceHandle: 'out', target: select.id, targetHandle: 'cond' });
      store.onConnect({ source: trueColor.id, sourceHandle: 'out', target: select.id, targetHandle: 'trueVal' });
      store.onConnect({ source: falseColor.id, sourceHandle: 'out', target: select.id, targetHandle: 'falseVal' });

      const stepTask = tutorial.tasks[0];
      const compareTask = tutorial.tasks[1];
      const selectTask = tutorial.tasks[2];

      expect(stepTask.validate(useEditorStore.getState())).toBe(true);
      expect(compareTask.validate(useEditorStore.getState())).toBe(true);
      expect(selectTask.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 15: Custom Nodes with Subgraphs', () => {
    const tutorial = getTutorial('tutorial_15');

    beforeEach(() => {
      vi.useFakeTimers();
      tutorial.setup?.();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('validates the gradient subgraph flow', async () => {
      const store = useEditorStore.getState();
      const selectTask = tutorial.tasks[0];
      const createTask = tutorial.tasks[1];
      const inputsTask = tutorial.tasks[3];
      const wireTask = tutorial.tasks[4];
      const saveTask = tutorial.tasks[5];
      const tweakTask = tutorial.tasks[6];

      expect(selectTask.validate(store)).toBe(false);

      const uv = store.nodes.find((n) => n.data.type === 'geo/uv')!;
      const mix = store.nodes.find((n) => n.data.type === 'math/mix')!;
      store.setSelectedNodes([uv.id, mix.id]);
      expect(selectTask.validate(useEditorStore.getState())).toBe(true);

      const subgraphId = store.createSubgraph('Subgraph', [uv.id, mix.id]);
      expect(subgraphId).not.toBeNull();
      store.enterSubgraphEditor(subgraphId!, { createInstanceOnSave: true });
      expect(createTask.validate(useEditorStore.getState())).toBe(true);

      const inputNode = useEditorStore.getState().nodes.find((n) => n.id === 'subgraph-input')!;
      const mixInSubgraph = useEditorStore.getState().nodes.find((n) => n.data.type === 'math/mix')!;

      store.addDynamicPort(inputNode.id, { id: 'color1', label: 'color1', type: 'color' });
      store.addDynamicPort(inputNode.id, { id: 'color2', label: 'color2', type: 'color' });
      expect(inputsTask.validate(useEditorStore.getState())).toBe(true);

      store.onConnect({ source: 'subgraph-input', sourceHandle: 'color1', target: mixInSubgraph.id, targetHandle: 'a' });
      store.onConnect({ source: 'subgraph-input', sourceHandle: 'color2', target: mixInSubgraph.id, targetHandle: 'b' });
      store.onConnect({ source: mixInSubgraph.id, sourceHandle: 'out', target: 'subgraph-output', targetHandle: 'out_0' });
      expect(wireTask.validate(useEditorStore.getState())).toBe(true);

      await store.exitSubgraphEditor(true, 'Simple Gradient');
      await vi.advanceTimersByTimeAsync(0);

      const state = useEditorStore.getState();
      expect(saveTask.validate(state)).toBe(true);
      expect(tweakTask.manualComplete).toBe(true);

      const customNode = state.nodes.find((n) => n.data.type.startsWith('custom/'))!;
      const colorNodes = state.nodes.filter((n) => n.data.type === 'const/color');
      const mat = state.nodes.find((n) => n.data.type.startsWith('material/'))!;

      expect(colorNodes.length).toBe(2);
      expect(state.edges.some((e) => e.source === customNode.id && e.target === mat.id && e.targetHandle === 'colorNode')).toBe(true);
      expect(colorNodes.every((cn) => state.edges.some((e) => e.source === cn.id && e.target === customNode.id))).toBe(true);
    });
  });

  describe('Tutorial 17: Multi-op Nodes', () => {
    const tutorial = getTutorial('tutorial_17');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('starts with the time-driven math chain connected to the material', () => {
      const state = useEditorStore.getState();
      const timeNode = state.nodes.find((n) => n.data.type === 'geo/time');
      const sinNode = state.nodes.find((n) => n.data.type === 'math/sin');
      const mulNode = state.nodes.find((n) => n.data.type === 'math/mul');
      const addNode = state.nodes.find((n) => n.data.type === 'math/add');
      const matNode = state.nodes.find((n) => n.data.type.startsWith('material/'));

      expect(timeNode && sinNode && mulNode && addNode && matNode).toBeTruthy();
      expect(mulNode?.data.values.b).toBe(0.5);
      expect(addNode?.data.values.b).toBe(0.5);
      expect(
        state.edges.some(
          (e) => e.source === addNode?.id && e.target === matNode?.id && e.targetHandle === 'colorNode'
        )
      ).toBe(true);
    });

    it('validates the select, convert, edit, and expand flow', () => {
      const store = useEditorStore.getState();
      const selectTask = tutorial.tasks[0];
      const convertTask = tutorial.tasks[1];
      const addOpTask = tutorial.tasks[2];
      const changeOpTask = tutorial.tasks[3];
      const expandTask = tutorial.tasks[4];

      const sinNode = store.nodes.find((n) => n.data.type === 'math/sin')!;
      const mulNode = store.nodes.find((n) => n.data.type === 'math/mul')!;
      const addNode = store.nodes.find((n) => n.data.type === 'math/add')!;

      expect(selectTask.validate(useEditorStore.getState())).toBe(false);
      store.setSelectedNodes([sinNode.id, mulNode.id, addNode.id]);
      expect(selectTask.validate(useEditorStore.getState())).toBe(true);
      expect(convertTask.validate(useEditorStore.getState())).toBe(false);

      store.convertChainToMultiOp([sinNode.id, mulNode.id, addNode.id]);
      expect(convertTask.validate(useEditorStore.getState())).toBe(true);
      expect(addOpTask.validate(useEditorStore.getState())).toBe(false);

      const multiOp = useEditorStore.getState().nodes.find((n) => n.data.type === 'math/multiOp')!;
      store.addMultiOp(multiOp.id, 'add');
      expect(addOpTask.validate(useEditorStore.getState())).toBe(true);
      expect(changeOpTask.validate(useEditorStore.getState())).toBe(false);

      const operations = useEditorStore.getState().nodes.find((n) => n.data.type === 'math/multiOp')!
        .data.operations!;
      const newOp = operations[operations.length - 1];
      store.updateMultiOp(multiOp.id, newOp.id, 'mul');
      expect(changeOpTask.validate(useEditorStore.getState())).toBe(false);

      store.updateNodeValue(multiOp.id, `op_${newOp.id}_b`, 2);
      expect(changeOpTask.validate(useEditorStore.getState())).toBe(true);
      expect(expandTask.validate(useEditorStore.getState())).toBe(false);

      store.convertMultiOpToChain(multiOp.id);
      expect(expandTask.validate(useEditorStore.getState())).toBe(true);
      expect(useEditorStore.getState().nodes.some((n) => n.data.type === 'math/multiOp')).toBe(false);
    });
  });

  describe('Tutorial 18: Quick Create with Expressions', () => {
    const tutorial = getTutorial('tutorial_18');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('validates expression-built graphs end to end', () => {
      const store = useEditorStore.getState();
      const simpleTask = tutorial.tasks[0];
      const fullTask = tutorial.tasks[1];
      const connectTask = tutorial.tasks[2];
      const dollarTask = tutorial.tasks[3];
      const rewireTask = tutorial.tasks[4];

      // "1 + 1" folds both literals into a single Add node
      expect(simpleTask.validate(store)).toBe(false);
      store.addNode('math/add', { x: 100, y: 100 }, { values: { a: 1, b: 1 } });
      expect(simpleTask.validate(useEditorStore.getState())).toBe(true);

      // "sin(time) * 0.5 + 0.5" builds the wired chain with folded constants
      expect(fullTask.validate(useEditorStore.getState())).toBe(false);
      store.addNode('geo/time', { x: 0, y: 250 });
      store.addNode('math/sin', { x: 150, y: 250 });
      store.addNode('math/mul', { x: 300, y: 250 }, { values: { b: 0.5 } });
      store.addNode('math/add', { x: 450, y: 250 }, { values: { b: 0.5 } });
      const state = useEditorStore.getState();
      const timeNode = state.nodes.find((n) => n.data.type === 'geo/time')!;
      const sinNode = state.nodes.find((n) => n.data.type === 'math/sin')!;
      const mulNode = state.nodes.find((n) => n.data.type === 'math/mul')!;
      const addNode = state.nodes.find((n) => n.data.type === 'math/add' && n.data.values.b === 0.5)!;
      const matNode = state.nodes.find((n) => n.data.type.startsWith('material/'))!;
      store.onConnect({ source: timeNode.id, sourceHandle: 'out', target: sinNode.id, targetHandle: 'x' });
      store.onConnect({ source: sinNode.id, sourceHandle: 'out', target: mulNode.id, targetHandle: 'a' });
      store.onConnect({ source: mulNode.id, sourceHandle: 'out', target: addNode.id, targetHandle: 'a' });
      expect(fullTask.validate(useEditorStore.getState())).toBe(true);

      expect(connectTask.validate(useEditorStore.getState())).toBe(false);
      store.onConnect({ source: addNode.id, sourceHandle: 'out', target: matNode.id, targetHandle: 'colorNode' });
      expect(connectTask.validate(useEditorStore.getState())).toBe(true);

      // "$ * 2" dragged from the Add output
      expect(dollarTask.validate(useEditorStore.getState())).toBe(false);
      store.addNode('math/mul', { x: 600, y: 250 }, { values: { b: 2 } });
      const doubledMul = useEditorStore.getState().nodes.find(
        (n) => n.data.type === 'math/mul' && n.data.values.b === 2
      )!;
      store.onConnect({ source: addNode.id, sourceHandle: 'out', target: doubledMul.id, targetHandle: 'a' });
      expect(dollarTask.validate(useEditorStore.getState())).toBe(true);

      expect(rewireTask.validate(useEditorStore.getState())).toBe(false);
      store.onConnect({ source: doubledMul.id, sourceHandle: 'out', target: matNode.id, targetHandle: 'colorNode' });
      expect(rewireTask.validate(useEditorStore.getState())).toBe(true);
    });
  });

  describe('Tutorial 14: Post-Processing', () => {
    const tutorial = getTutorial('tutorial_14');

    beforeEach(() => {
      tutorial.setup?.();
    });

    it('sets up the post graph and validates gaussian blur insertion', () => {
      const store = useEditorStore.getState();
      const connectTask = tutorial.tasks[0];
      const blurTask = tutorial.tasks[1];
      const insertTask = tutorial.tasks[2];
      const previewTask = tutorial.tasks[3];

      expect(store.activeRootGraph).toBe('post');
      expect(previewTask.validate(store)).toBe(false);

      const postInput = store.nodes.find((n) => n.data.type === 'post/input')!;
      const postOutput = store.nodes.find((n) => n.data.type === 'post/output')!;
      store.onConnect({
        source: postInput.id,
        sourceHandle: 'color',
        target: postOutput.id,
        targetHandle: 'color',
      });
      expect(connectTask.validate(useEditorStore.getState())).toBe(true);

      store.addNode('postfx/gaussianBlur', { x: 300, y: 200 });
      const blur = useEditorStore.getState().nodes.find((n) => n.data.type === 'postfx/gaussianBlur')!;
      expect(blurTask.validate(useEditorStore.getState())).toBe(true);

      store.onConnect({
        source: postInput.id,
        sourceHandle: 'color',
        target: blur.id,
        targetHandle: 'input',
      });
      store.onConnect({
        source: blur.id,
        sourceHandle: 'out',
        target: postOutput.id,
        targetHandle: 'color',
      });
      expect(insertTask.validate(useEditorStore.getState())).toBe(true);

      store.updatePreviewSettings({ postEnabled: true });
      expect(previewTask.validate(useEditorStore.getState())).toBe(true);
    });
  });
});
