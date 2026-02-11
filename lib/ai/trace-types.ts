export type TraceEvent = {
  ts: string;
  traceId: string;
  chatId?: string;
  source: 'client' | 'server';
  event: string;
  payload?: unknown;
};
