import 'server-only';

import path from 'path';
import { promises as fs } from 'fs';
import type { TraceEvent } from './trace-types';

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'logs', 'ai-flow.ndjson');

const getLogPath = () => process.env.AI_LOG_PATH || DEFAULT_LOG_PATH;
const isEnabled = () => process.env.NODE_ENV !== 'production' || Boolean(process.env.AI_LOG_PATH);

let ensuredDir = false;

async function ensureDir() {
  if (ensuredDir) return;
  const dir = path.dirname(getLogPath());
  await fs.mkdir(dir, { recursive: true });
  ensuredDir = true;
}

export async function appendTraceEvent(event: TraceEvent) {
  if (!isEnabled()) return;
  try {
    await ensureDir();
    await fs.appendFile(getLogPath(), `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Swallow logging errors to avoid breaking the app.
  }
}
