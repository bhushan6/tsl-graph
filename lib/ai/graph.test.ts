import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { initializeNodes } from '@/lib/nodes';
import type { NodeType, TSLNodeData } from '@/lib/types';
import { useEditorStore } from '@/store/editor';
import { validateGraph } from './graph';

const createNode = (
  id: string,
  type: string,
  dataOverrides: Partial<TSLNodeData> = {},
  nodeOverrides: Partial<Node<TSLNodeData>> = {}
): Node<TSLNodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    type: type as NodeType,
    values: {},
    connected: {},
    ...dataOverrides,
  },
  ...nodeOverrides,
});

describe('ai validateGraph local issues', () => {
  beforeAll(() => {
    initializeNodes();
  });

  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  it('reports missing localSourceId for Get Local', () => {
    useEditorStore.setState({
      nodes: [createNode('get-1', 'local/get')],
      edges: [],
      activeRootGraph: 'material',
    });

    const report = validateGraph();
    expect(report.errors.some((issue) => issue.type === 'local-missing-source-id')).toBe(true);
  });

  it('reports dangling local reference for Get Local', () => {
    useEditorStore.setState({
      nodes: [createNode('get-1', 'local/get', { values: { localSourceId: 'set-missing' } })],
      edges: [],
      activeRootGraph: 'material',
    });

    const report = validateGraph();
    expect(report.errors.some((issue) => issue.type === 'local-missing-set')).toBe(true);
  });

  it('reports loop scope violations for local references', () => {
    const loopNode = createNode('loop-1', 'loop');
    const setNode = createNode(
      'set-1',
      'local/set',
      { values: { localName: 'inside' } },
      { parentId: 'loop-1' }
    );
    const getNode = createNode('get-1', 'local/get', { values: { localSourceId: 'set-1' } });

    useEditorStore.setState({
      nodes: [loopNode, setNode, getNode],
      edges: [],
      activeRootGraph: 'material',
    });

    const report = validateGraph();
    expect(report.errors.some((issue) => issue.type === 'local-scope-invalid')).toBe(true);
  });

  it('reports duplicate Set Local names', () => {
    useEditorStore.setState({
      nodes: [
        createNode('set-1', 'local/set', { values: { localName: 'dup' } }),
        createNode('set-2', 'local/set', { values: { localName: 'dup' } }),
      ],
      edges: [],
      activeRootGraph: 'material',
    });

    const report = validateGraph();
    const duplicateErrors = report.errors.filter((issue) => issue.type === 'local-duplicate-name');
    expect(duplicateErrors.length).toBe(2);
  });
});
