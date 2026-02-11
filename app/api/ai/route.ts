import { NextResponse } from 'next/server';
import { createGateway, streamText, convertToModelMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { TOOL_SET } from '@/lib/ai/tool-schema';
import { appendTraceEvent } from '@/lib/ai/trace-store';

const DEFAULT_PROVIDER = 'openai';
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4.1',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-1.5-pro',
  gateway: 'openai/gpt-4.1',
};
const SYSTEM_PROMPT = [
  'You are an assistant for a shader node editor.',
  'Use tools to read the graph and make changes only when the user asks.',
  'Tool protocol: 1) getGraphSnapshot + getAvailableNodes, 2) getNodeDefinition for any node you will touch, 3) add nodes, 4) set values, 5) connect nodes, 6) validateGraph and fix errors, 7) compileGraph (for verification), 8) capturePreviewImage only if visual verification is requested, 9) summarize.',
  'Do not invent ids or port names; rely on tool outputs.',
  'Do not mutate the graph for purely explanatory questions.',
  'Keep edits minimal; do not delete nodes unless asked.',
  'When changing material type, delete the existing material node and reconnect outputs to the new one.',
  'Adding nodes does not require positions unless the user provides coordinates.',
  'For color inputs, pass hex strings like #ff00ff.',
  'Call autoLayout only if the user asks for it, and it must be the last tool call.',
  'capturePreviewImage is expensive; call it only when visual verification is needed and only in main editor mode.',
  'If intent is unclear, ask a brief clarifying question instead of guessing.',
  'After any mutations, call validateGraph and compileGraph before your final response.',
  'If validateGraph reports errors, fix them and run validateGraph again.',
  'Include a short validation + compile summary in the final response.',
  'Reply with a brief summary or answer after tool calls are done.',
].join(' ');
const DEBUG = process.env.AI_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[AI API]', ...args);
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const userKey = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    if (!userKey) {
      log('missing user api key');
      return NextResponse.json({ error: 'Missing user API key' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const traceId = typeof body?.traceId === 'string' ? body.traceId : 'unknown';
    const chatId = typeof body?.chatId === 'string' ? body.chatId : undefined;
    const provider = typeof body?.provider === 'string' ? body.provider.toLowerCase() : DEFAULT_PROVIDER;
    const providerKey = provider in DEFAULT_MODEL_BY_PROVIDER ? provider : DEFAULT_PROVIDER;
    const rawModel = typeof body?.model === 'string' && body.model.trim().length > 0
      ? body.model
      : DEFAULT_MODEL_BY_PROVIDER[providerKey];
    const model = providerKey === 'gateway'
      ? (rawModel.includes('/') ? rawModel : `openai/${rawModel}`)
      : rawModel.startsWith(`${providerKey}/`)
        ? rawModel.slice(providerKey.length + 1)
        : rawModel;

    log('request', { messageCount: messages.length, model, provider: providerKey, tools: Object.keys(TOOL_SET), traceId, chatId });
    void appendTraceEvent({
      ts: new Date().toISOString(),
      traceId,
      chatId,
      source: 'server',
      event: 'agent_request',
      payload: {
        messageCount: messages.length,
        model,
        provider: providerKey,
        tools: Object.keys(TOOL_SET),
      },
    });

    const modelProvider =
      providerKey === 'gateway'
        ? createGateway({ apiKey: userKey })(model)
        : providerKey === 'anthropic'
          ? createAnthropic({ apiKey: userKey })(model)
          : providerKey === 'google'
            ? createGoogleGenerativeAI({ apiKey: userKey })(model)
            : createOpenAI({ apiKey: userKey })(model);
    const result = streamText({
      model: modelProvider,
      messages: await convertToModelMessages(messages, { tools: TOOL_SET }),
      system: SYSTEM_PROMPT,
      tools: TOOL_SET,
      onFinish: (event) => {
        void appendTraceEvent({
          ts: new Date().toISOString(),
          traceId,
          chatId,
          source: 'server',
          event: 'agent_response',
          payload: {
            finishReason: event.finishReason,
            textLength: event.text?.length ?? 0,
          },
        });
      },
      onError: (err) => {
        void appendTraceEvent({
          ts: new Date().toISOString(),
          traceId,
          chatId,
          source: 'server',
          event: 'error',
          payload: {
            message: err instanceof Error ? err.message : String(err),
          },
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    console.error('[AI API] error', error);
    void appendTraceEvent({
      ts: new Date().toISOString(),
      traceId: 'unknown',
      source: 'server',
      event: 'error',
      payload: {
        message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
