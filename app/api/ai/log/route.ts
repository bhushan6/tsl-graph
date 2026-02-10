import { NextResponse } from 'next/server';
import { appendTraceEvent } from '@/lib/ai/trace-store';
import type { TraceEvent } from '@/lib/ai/trace-types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Missing body' }, { status: 400 });
    }
    await appendTraceEvent(body as TraceEvent);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Log failed' }, { status: 500 });
  }
}
