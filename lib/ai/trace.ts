import type { TraceEvent } from './trace-types';

type TraceContext = {
  traceId: string;
  chatId?: string;
};

let context: TraceContext | null = null;

const isEnabled = () =>
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_AI_LOGGING === 'true';

export const setTraceContext = (next: TraceContext) => {
  context = next;
};

export const logTrace = async (event: string, payload?: unknown) => {
  if (!isEnabled() || !context?.traceId) return;
  const entry: TraceEvent = {
    ts: new Date().toISOString(),
    traceId: context.traceId,
    chatId: context.chatId,
    source: 'client',
    event,
    payload,
  };

  try {
    await fetch('/api/ai/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Ignore logging failures in the client.
  }
};
