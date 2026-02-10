import { NextResponse } from 'next/server';
import { createGateway, streamText, convertToModelMessages } from 'ai';
import { fetchAuthQuery } from '@/lib/auth-server';
import { api } from '@/convex/_generated/api';
import { TOOL_SET } from '@/lib/ai/tool-schema';

const DEFAULT_MODEL = 'openai/gpt-4.1';
const SYSTEM_PROMPT = [
  'You are an assistant for a shader node editor.',
  'Use tools to read the graph and make changes only when the user asks.',
  'Tool protocol: 1) getGraphSnapshot + getAvailableNodes, 2) getNodeDefinition for any node you will touch, 3) add nodes, 4) set values, 5) connect nodes, 6) validateGraph and fix errors, 7) compileGraph (for verification), 8) capturePreviewImage only if visual verification is requested, 9) summarize.',
  'After any mutations, call validateGraph and compileGraph before your final response.',
  'If validateGraph reports errors, fix them and run validateGraph again.',
  'Include a short validation + compile summary in the final response.',
  'Do not invent ids or port names; rely on tool outputs.',
  'Do not mutate the graph for purely explanatory questions.',
  'Keep edits minimal; do not delete nodes unless asked.',
  'When changing material type, delete the existing material node and reconnect outputs to the new one.',
  'Adding nodes does not require positions unless the user provides coordinates.',
  'For color inputs, pass hex strings like #ff00ff.',
  'Call autoLayout only if the user asks for it, and it must be the last tool call.',
  'capturePreviewImage is expensive; call it only when visual verification is needed and only in main editor mode.',
  'If intent is unclear, ask a brief clarifying question instead of guessing.',
  'Reply with a brief summary or answer after tool calls are done.',
].join(' ');
const DEBUG = process.env.AI_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[AI API]', ...args);
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      log('missing api key');
      return NextResponse.json({ error: 'Missing AI_GATEWAY_API_KEY' }, { status: 500 });
    }

    const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
    if (!user) {
      log('unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const model = typeof body?.model === 'string' && body.model.trim().length > 0
      ? body.model
      : (process.env.AI_MODEL || DEFAULT_MODEL);

    log('request', { messageCount: messages.length, model, tools: Object.keys(TOOL_SET) });

    const gateway = createGateway({ apiKey });
    const result = streamText({
      model: gateway(model),
      messages: await convertToModelMessages(messages, { tools: TOOL_SET }),
      system: SYSTEM_PROMPT,
      tools: TOOL_SET,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    console.error('[AI API] error', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
