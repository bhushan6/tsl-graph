import { NextResponse } from 'next/server';
import { streamText, createGateway, convertToModelMessages } from 'ai';
import { TOOL_SET } from '@/lib/ai/tool-schema';
import { fetchAuthQuery } from '@/lib/auth-server';
import { api } from '@/convex/_generated/api';
import { aiLog, aiError } from '@/lib/ai/logger';

// const gatewayApiKey = process.env.AI_GATEWAY_API_KEY;
const gateway = createGateway({
  apiKey: "vck_56aztJkxC65S4mEBBiSFagiDxBP7zAXIniGvPd388PL2rOXY6j19845s",
})





const DEFAULT_MODEL = 'google/gemini-3-pro-preview';

(async () => {
  console.log(await gateway.getAvailableModels());
})()

export async function POST(req: Request) {
  const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  aiLog(requestId, 'Incoming AI request');

  try {
    if (!gateway) {
      aiError(requestId, 'Missing AI_GATEWAY_API_KEY');
      return NextResponse.json({ error: 'Missing AI gateway API key' }, { status: 500 });
    }

    const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
    if (!user) {
      aiLog(requestId, 'Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const messages = body.messages ?? [];
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined;
    const model = typeof body.model === 'string' ? body.model : DEFAULT_MODEL;

    aiLog(requestId, 'Auth OK', { model, messageCount: messages.length });

    const result = streamText({
      model: gateway(model),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: TOOL_SET,
      onStepFinish: (step) => {
        aiLog(requestId, 'AI step finished', {
          finishReason: step.finishReason,
          textLength: step.text?.length ?? 0,
          toolCalls: step.toolCalls?.map((call) => call.toolName) ?? [],
        });
      },
      onFinish: (event) => {
        aiLog(requestId, 'AI response', {
          finishReason: event.finishReason,
          toolCalls: event.toolCalls?.length ?? 0,
          textLength: event.text?.length ?? 0,
        });
      },
      onError: (error) => {
        aiError(requestId, 'AI stream error', error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    aiError(requestId, 'AI request failed', error);
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
