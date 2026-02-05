import { appendAiLogEntry } from './log-store';

export function aiLog(...args: unknown[]) {
  // Always log for now to make debugging easier.
  if (typeof window === 'undefined') {
    console.log('[AI]', ...args);
  } else {
    console.log('[AI]', ...args);
  }
  appendAiLogEntry('log', args);
}

export function aiError(...args: unknown[]) {
  if (typeof window === 'undefined') {
    console.error('[AI]', ...args);
  } else {
    console.error('[AI]', ...args);
  }
  appendAiLogEntry('error', args);
}
