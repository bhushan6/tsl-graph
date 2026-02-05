'use client';

import { useEditorStore } from '@/store/editor';
import { usePreviewStore } from '@/store/preview';
import type { ToolCall, ToolResult } from './types';
import type { NodeType, TSLValueType } from '@/lib/types';
import { compileAndValidate, getAvailableNodes, getGraphSnapshot, getNodeDefinition, validateGraph } from './graph';
import { aiLog, aiError } from './logger';

const singleBulk = (operation: import('./types').BulkOperationOp) => {
  return useEditorStore.getState().bulkOperation([operation]);
};

export async function runToolCall(call: ToolCall): Promise<ToolResult> {
  try {
    aiLog('Tool call', call.toolName, call.input);
    switch (call.toolName) {
      case 'getGraphSnapshot':
        const snapshot = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: getGraphSnapshot(),
        };
        aiLog('Tool result', call.toolName);
        return snapshot;
      case 'getAvailableNodes':
        const available = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: getAvailableNodes(),
        };
        aiLog('Tool result', call.toolName);
        return available;
      case 'getNodeDefinition':
        const definition = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: getNodeDefinition((call.input as { type: string }).type),
        };
        aiLog('Tool result', call.toolName, definition.output);
        return definition;
      case 'bulkOperation': {
        const result = useEditorStore.getState().bulkOperation((call.input as { operations: import('./types').BulkOperationOp[] }).operations);
        aiLog('Tool result', call.toolName, { success: result.success, error: result.error });
        return { toolCallId: call.toolCallId, toolName: call.toolName, output: result, isError: !result.success };
      }
      case 'addNode': {
        const input = call.input as { type: string; position: { x: number; y: number }; values?: Record<string, TSLValueType> };
        const tempId = `temp-${Date.now()}`;
        const result = singleBulk({
          op: 'addNode',
          tempId,
          type: input.type as NodeType,
          position: input.position,
          values: input.values,
        });
        const response = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { success: result.success, nodeId: result.idMap[tempId] ?? null, error: result.error },
          isError: !result.success,
        };
        aiLog('Tool result', call.toolName, response.output);
        return response;
      }
      case 'deleteNode': {
        const input = call.input as { nodeId: string };
        const result = singleBulk({ op: 'deleteNode', nodeId: input.nodeId });
        aiLog('Tool result', call.toolName, { success: result.success });
        return { toolCallId: call.toolCallId, toolName: call.toolName, output: result, isError: !result.success };
      }
      case 'connectNodes': {
        const input = call.input as { source: string; sourcePort?: string | null; target: string; targetPort?: string | null };
        const result = singleBulk({
          op: 'connect',
          source: input.source,
          sourcePort: input.sourcePort ?? null,
          target: input.target,
          targetPort: input.targetPort ?? null,
        });
        aiLog('Tool result', call.toolName, { success: result.success });
        return { toolCallId: call.toolCallId, toolName: call.toolName, output: result, isError: !result.success };
      }
      case 'disconnectNodes': {
        const input = call.input as { source?: string; sourcePort?: string | null; target?: string; targetPort?: string | null; edgeId?: string; id?: string };
        const edgeId = input.edgeId ?? input.id;
        const result = edgeId
          ? singleBulk({ op: 'removeEdge', edgeId })
          : singleBulk({
              op: 'disconnect',
              source: input.source ?? '',
              sourcePort: input.sourcePort ?? null,
              target: input.target ?? '',
              targetPort: input.targetPort ?? null,
            });
        aiLog('Tool result', call.toolName, { success: result.success });
        return { toolCallId: call.toolCallId, toolName: call.toolName, output: result, isError: !result.success };
      }
      case 'setNodeValue': {
        const input = call.input as { nodeId: string; input: string; value: TSLValueType };
        const result = singleBulk({
          op: 'setValue',
          nodeId: input.nodeId,
          input: input.input,
          value: input.value,
        });
        aiLog('Tool result', call.toolName, { success: result.success });
        return { toolCallId: call.toolCallId, toolName: call.toolName, output: result, isError: !result.success };
      }
      case 'moveNode': {
        const input = call.input as { nodeId: string; position: { x: number; y: number } };
        const result = singleBulk({
          op: 'move',
          nodeId: input.nodeId,
          position: input.position,
        });
        aiLog('Tool result', call.toolName, { success: result.success });
        return { toolCallId: call.toolCallId, toolName: call.toolName, output: result, isError: !result.success };
      }
      case 'validateGraph':
        const validation = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: validateGraph(),
        };
        aiLog('Tool result', call.toolName, validation.output);
        return validation;
      case 'compileAndValidate':
        const compiled = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: compileAndValidate(),
        };
        aiLog('Tool result', call.toolName, compiled.output);
        return compiled;
      case 'getPreviewStatus':
        const status = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: usePreviewStore.getState().getPreviewStatus(),
        };
        aiLog('Tool result', call.toolName, status.output);
        return status;
      case 'capturePreview':
        const dataUrl = usePreviewStore.getState().capturePreview();
        if (!dataUrl) {
          const capture = {
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: { hasImage: false },
          };
          aiLog('Tool result', call.toolName, capture.output);
          return capture;
        }

        try {
          const blobResponse = await fetch(dataUrl);
          const blob = await blobResponse.blob();
          const uploadResponse = await fetch('/api/ai/preview', {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'image/png' },
            body: blob,
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(errorText || 'Preview upload failed');
          }

          const upload = (await uploadResponse.json()) as {
            url: string;
            storageId: string;
            bytes: number;
            contentType: string;
          };

          const capture = {
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: {
              hasImage: true,
              url: upload.url,
              storageId: upload.storageId,
              bytes: upload.bytes,
              contentType: upload.contentType,
            },
          };
          aiLog('Tool result', call.toolName, { hasImage: true, bytes: upload.bytes });
          return capture;
        } catch (error) {
          aiError('capturePreview upload failed', error);
          return {
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: { hasImage: false, error: error instanceof Error ? error.message : String(error) },
            isError: true,
          };
        }
      default:
        const unknown = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { error: `Unknown tool: ${call.toolName}` },
          isError: true,
        };
        aiError('Tool error', unknown);
        return unknown;
    }
  } catch (error) {
    aiError('Tool call failed', call.toolName, error);
    return {
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: { error: error instanceof Error ? error.message : String(error) },
      isError: true,
    };
  }
}

export async function runToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    results.push(await runToolCall(call));
  }
  return results;
}
