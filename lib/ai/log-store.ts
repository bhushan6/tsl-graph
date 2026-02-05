export type AiLogLevel = 'log' | 'error';

export type AiLogEntry = {
  id: string;
  ts: string;
  level: AiLogLevel;
  args: string[];
};

const STORAGE_KEY = 'tsl-ai-logs';
const MAX_ENTRIES = 500;
const MAX_ARG_LENGTH = 2000;

const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

const safeStringify = (value: unknown) => {
  const seen = new WeakSet();
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'bigint') {
          return `${val.toString()}n`;
        }
        if (typeof val === 'function') {
          return `[Function ${val.name || 'anonymous'}]`;
        }
        if (typeof val === 'symbol') {
          return val.toString();
        }
        if (val && typeof val === 'object') {
          if (seen.has(val as object)) {
            return '[Circular]';
          }
          seen.add(val as object);
        }
        return val;
      },
      2
    );
  } catch (error) {
    return `"[Unserializable: ${error instanceof Error ? error.message : String(error)}]"`;
  }
};

const truncate = (value: string) => {
  if (value.length <= MAX_ARG_LENGTH) return value;
  return `${value.slice(0, MAX_ARG_LENGTH)}…`;
};

const formatArg = (arg: unknown) => {
  if (arg instanceof Error) {
    const stack = arg.stack ? `\n${arg.stack}` : '';
    return truncate(`${arg.name}: ${arg.message}${stack}`);
  }
  if (typeof arg === 'string') {
    return truncate(arg);
  }
  if (arg === undefined) {
    return 'undefined';
  }
  if (arg === null) {
    return 'null';
  }
  return truncate(safeStringify(arg));
};

const loadEntries = (): AiLogEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveEntries = (entries: AiLogEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures (quota, private mode, etc.)
  }
};

export const appendAiLogEntry = (level: AiLogLevel, args: unknown[]) => {
  if (typeof window === 'undefined') return;
  const entry: AiLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    level,
    args: args.map(formatArg),
  };
  const entries = loadEntries();
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  saveEntries(entries);
  notify();
};

export const getAiLogEntries = (): AiLogEntry[] => loadEntries();

export const clearAiLogEntries = () => {
  saveEntries([]);
  notify();
};

export const subscribeAiLogs = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const formatAiLogEntries = (entries: AiLogEntry[]) =>
  entries.map((entry) => `[${entry.ts}] ${entry.level.toUpperCase()} ${entry.args.join(' ')}`).join('\n');
