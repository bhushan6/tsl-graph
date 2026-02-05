import type { AIChatMessage, ToolCall, ToolResult, ToolResultPart } from './types';
import { runToolCalls } from './tool-runner';
import { aiLog, aiError } from './logger';

export interface AiRequestOptions {
  model?: string;
  systemPrompt?: string;
}

export interface AiLoopResult {
  messages: AIChatMessage[];
  toolResults: ToolResult[];
}

const MAX_TOOL_LOOPS = 5;

export async function runAiLoop(
  messages: AIChatMessage[],
  options: AiRequestOptions = {}
): Promise<AiLoopResult> {
  const accumulatedResults: ToolResult[] = [];
  let currentMessages = [...messages];

  aiLog('AI loop start', { messageCount: currentMessages.length });

  for (let step = 0; step < MAX_TOOL_LOOPS; step++) {
    aiLog('AI loop step', step + 1);
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: currentMessages,
        systemPrompt: options.systemPrompt,
        model: options.model,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      aiError('AI request failed', response.status, errorText);
      throw new Error(errorText || 'AI request failed');
    }

    const data = (await response.json()) as {
      text?: string | null;
      toolCalls?: ToolCall[];
      finishReason?: string | null;
    };

    aiLog('AI response received', {
      finishReason: data.finishReason ?? null,
      toolCalls: data.toolCalls?.length ?? 0,
      textLength: data.text?.length ?? 0,
    });

    const hasToolCalls = Boolean(data.toolCalls && data.toolCalls.length > 0);

    if (data.text) {
      currentMessages = [...currentMessages, { role: 'assistant', content: data.text }];
      aiLog('AI assistant message appended', { textLength: data.text.length, hasToolCalls });
    }

    if (hasToolCalls) {
      aiLog('Running tool calls', data.toolCalls!.map((call) => call.toolName));
      const results = await runToolCalls(data.toolCalls!);
      accumulatedResults.push(...results);

      const toolParts: ToolResultPart[] = results.map((result) => ({
        type: 'tool-result',
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        output: result.isError
          ? { type: 'error-json', value: result.output }
          : { type: 'json', value: result.output },
      }));

      aiLog('Tool calls complete', results.map((result) => ({ name: result.toolName, isError: result.isError })));
      currentMessages = [...currentMessages, { role: 'tool', content: toolParts }];
      continue;
    }

    if (data.text) {
      aiLog('AI loop complete (text only)');
      return { messages: currentMessages, toolResults: accumulatedResults };
    }

    aiLog('AI loop complete (no tool calls)');
    return { messages: currentMessages, toolResults: accumulatedResults };
  }

  aiLog('AI loop stopped (max steps reached)');
  return { messages: currentMessages, toolResults: accumulatedResults };
}
