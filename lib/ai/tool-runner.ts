'use client';

import { useEditorStore } from '@/store/editor';
import type {
  ToolCall,
  ToolResult,
  AddNodeInput,
  CompileGraphInput,
  ConnectNodesInput,
  SetNodeValueInput,
  DeleteNodeInput,
  CapturePreviewImageInput,
} from './types';
import type { NodeType } from '@/lib/types';
import { autoLayoutNodes } from './auto-layout';
import { getAvailableNodes, getGraphSnapshot, getNodeDefinition, validateGraph } from './graph';
import { compileGraph, getRequiredImports } from '@/lib/compiler';
import { logTrace } from '@/lib/ai/trace';

const DEFAULT_POSITION = { x: 0, y: 0 };
const DEFAULT_MAX_CHARS = 8000;
const DEBUG = process.env.NEXT_PUBLIC_AI_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[AI Tools]', ...args);
};

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const toByte = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? clampByte(value * 255) : clampByte(value);
};
const rgbToHex = (r: number, g: number, b: number) =>
  `#${[toByte(r), toByte(g), toByte(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const normalizeColorValue = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value as number[];
    return rgbToHex(Number(r), Number(g), Number(b));
  }
  if (value && typeof value === 'object') {
    const maybe = value as { r?: number; g?: number; b?: number };
    if (typeof maybe.r === 'number' && typeof maybe.g === 'number' && typeof maybe.b === 'number') {
      return rgbToHex(maybe.r, maybe.g, maybe.b);
    }
  }
  return null;
};

export async function runToolCall(call: ToolCall): Promise<ToolResult> {
  try {
    log('run', { tool: call.toolName, toolCallId: call.toolCallId, input: call.input });
    void logTrace('tool_call', {
      toolName: call.toolName,
      toolCallId: call.toolCallId,
      input: call.input,
    });

    const finalize = (result: ToolResult) => {
      void logTrace('tool_result', {
        toolName: result.toolName,
        toolCallId: result.toolCallId,
        output: result.output,
        isError: Boolean(result.isError),
      });
      return result;
    };

    switch (call.toolName) {
      case 'getGraphSnapshot':
        return finalize({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: getGraphSnapshot(),
        });
      case 'getAvailableNodes':
        return finalize({ toolCallId: call.toolCallId, toolName: call.toolName, output: getAvailableNodes() });
      case 'getNodeDefinition':
        return finalize({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: getNodeDefinition((call.input as { type: string }).type),
        });
      case 'compileGraph': {
        const input = call.input as CompileGraphInput;
        const state = useEditorStore.getState();
        const imports = getRequiredImports(state.nodes, state.subgraphs, state.codeNodes, state.globals);
        const codeBody = compileGraph(state.nodes, state.edges, state.subgraphs, state.codeNodes, { globals: state.globals });
        const includeImports = input.includeImports !== false;
        const header = includeImports && imports.length > 0
          ? `import { ${imports.join(', ')} } from 'three/tsl';\n\n`
          : '';
        const combined = `${header}${codeBody}`;
        const maxChars = Number.isFinite(input.maxChars) ? Math.max(0, input.maxChars as number) : DEFAULT_MAX_CHARS;
        const truncated = combined.length > maxChars;
        const code = truncated ? combined.slice(0, maxChars) : combined;
        return finalize({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: {
            code,
            imports,
            truncated,
            nodeCount: state.nodes.length,
          },
        });
      }
      case 'validateGraph': {
        const report = validateGraph();
        return finalize({ toolCallId: call.toolCallId, toolName: call.toolName, output: report });
      }
      case 'addNode': {
        const input = call.input as AddNodeInput;
        const before = useEditorStore.getState().nodes.map((node) => node.id);
        const ok = useEditorStore.getState().addNode(
          input.type as NodeType,
          input.position ?? DEFAULT_POSITION,
          { values: input.values ?? {} }
        );
        if (!ok) {
          return finalize({
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: { success: false, error: 'Failed to add node.' },
            isError: true,
          });
        }
        const after = useEditorStore.getState().nodes;
        const newNode = after.find((node) => !before.includes(node.id));
        return finalize({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { success: true, nodeId: newNode?.id ?? null },
        });
      }
      case 'connectNodes': {
        const input = call.input as ConnectNodesInput;
        const connection = {
          source: input.source,
          target: input.target,
          sourceHandle: input.sourcePort ?? null,
          targetHandle: input.targetPort ?? null,
        };
        useEditorStore.getState().onConnect(connection);
        return finalize({ toolCallId: call.toolCallId, toolName: call.toolName, output: { success: true } });
      }
      case 'setNodeValue': {
        const input = call.input as SetNodeValueInput;
        const state = useEditorStore.getState();
        const node = state.nodes.find((item) => item.id === input.nodeId);
        const definition = node ? getNodeDefinition(node.data.type) : null;
        const inputDef = definition?.inputs?.[input.input];
        let nextValue = input.value;
        if (inputDef?.type === 'color') {
          const normalized = normalizeColorValue(input.value);
          if (normalized) {
            log('normalized color', { from: input.value, to: normalized });
            nextValue = normalized;
          }
        }
        state.updateNodeValue(input.nodeId, input.input, nextValue);
        return finalize({ toolCallId: call.toolCallId, toolName: call.toolName, output: { success: true } });
      }
      case 'deleteNode': {
        const input = call.input as DeleteNodeInput;
        useEditorStore.getState().deleteNode(input.nodeId);
        return finalize({ toolCallId: call.toolCallId, toolName: call.toolName, output: { success: true } });
      }
      case 'autoLayout': {
        const state = useEditorStore.getState();
        state.takeSnapshot();
        const layoutedNodes = autoLayoutNodes(state.nodes, state.edges);
        useEditorStore.setState({ nodes: layoutedNodes });
        state.markDirty();
        return finalize({ toolCallId: call.toolCallId, toolName: call.toolName, output: { success: true } });
      }
      case 'capturePreviewImage': {
        const input = call.input as CapturePreviewImageInput;
        const state = useEditorStore.getState();
        if (state.editorMode !== 'main') {
          return finalize({
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: { error: 'Preview capture is only available in main editor mode.' },
            isError: true,
          });
        }
        const provider = state.previewSnapshotProvider;
        if (!provider) {
          return finalize({
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: { error: 'Preview renderer is not ready.' },
            isError: true,
          });
        }
        const output = await provider({ format: input.format, quality: input.quality });
        return finalize({ toolCallId: call.toolCallId, toolName: call.toolName, output });
      }
      default:
        return finalize({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { error: `Unknown tool: ${call.toolName}` },
          isError: true,
        });
    }
  } catch (error) {
    console.error('[AI Tools] error', error);
    const result = {
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: { error: error instanceof Error ? error.message : String(error) },
      isError: true,
    };
    void logTrace('tool_result', {
      toolName: result.toolName,
      toolCallId: result.toolCallId,
      output: result.output,
      isError: true,
    });
    return result;
  }
}
