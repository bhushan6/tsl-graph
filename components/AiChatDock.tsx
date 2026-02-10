'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Send, Loader2, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChat } from '@ai-sdk/react';
import { runToolCall } from '@/lib/ai/tool-runner';
import type { ToolName, ToolResult } from '@/lib/ai/types';
import { DefaultChatTransport } from 'ai';
import { logTrace, setTraceContext } from '@/lib/ai/trace';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

export function AiChatDock({ onOpenToolbar }: { onOpenToolbar?: () => void }) {
  const makeId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const traceId = useMemo(() => makeId(), []);
  const chatId = useMemo(() => makeId(), []);

  const [input, setInput] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const debug = process.env.NEXT_PUBLIC_AI_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
  const log = (...args: unknown[]) => {
    if (debug) console.log('[AI Chat]', ...args);
  };

  const [lastToolResults, setLastToolResults] = useState<ToolResult[]>([]);
  const lastAutoSendSignatureRef = useRef<string | null>(null);
  const pendingPreviewStorageIdsRef = useRef<string[]>([]);
  const deletePreviewImage = useMutation(api.ai.deletePreviewImage);

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/ai', body: { traceId, chatId } }), [traceId, chatId]);

  const cleanupPreviewImages = useCallback(async () => {
    const ids = pendingPreviewStorageIdsRef.current;
    if (!ids.length) return;
    pendingPreviewStorageIdsRef.current = [];
    try {
      await Promise.all(
        ids.map((storageId) =>
          deletePreviewImage({ storageId: storageId as Id<'_storage'> })
        )
      );
    } catch (err) {
      log('preview cleanup error', err);
    }
  }, [deletePreviewImage]);

  const chatOptions = {
    transport: transport as unknown,
    id: chatId,
    async onToolCall({ toolCall }: { toolCall: { toolCallId: string; toolName: string; input?: unknown; args?: unknown } }) {
      log('tool call', { tool: toolCall.toolName, toolCallId: toolCall.toolCallId });
      const input = (toolCall as { input?: unknown; args?: unknown }).input ?? (toolCall as { args?: unknown }).args;
      const result = await runToolCall({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName as ToolName,
        input,
      });
      log('tool result', { tool: toolCall.toolName, toolCallId: toolCall.toolCallId, result });

      setLastToolResults((prev) => [...prev, result]);

      if (!result.isError && toolCall.toolName === 'capturePreviewImage') {
        const storageId = (result.output as { storageId?: string } | undefined)?.storageId;
        if (typeof storageId === 'string') {
          pendingPreviewStorageIdsRef.current = [...pendingPreviewStorageIdsRef.current, storageId];
        }
      }

      if (result.isError) {
        const errorText =
          typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? { error: 'Tool failed' });
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText,
        });
      } else {
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result.output,
        });
      }
    },
    onError: (err: Error) => {
      log('error', err);
      setLastError(err.message ?? 'AI request failed.');
      void logTrace('error', { message: err.message });
      void cleanupPreviewImages();
    },
    onFinish: ({ message }: { message: { id: string } }) => {
      log('finish', { messageId: message.id });
      void logTrace('final_response', { messageId: message.id });
      void cleanupPreviewImages();
    },
    sendAutomaticallyWhen: (options: { messages: Array<{ id?: string; role?: string; parts?: Array<{ type?: string; state?: string }> }> }) => {
      const last = options.messages[options.messages.length - 1];
      if (!last || last.role !== 'assistant') return false;
      const parts = last.parts ?? [];
      const toolParts = parts.filter((part) => {
        if (!part || typeof part.type !== 'string') return false;
        const isTool = part.type.startsWith('tool-') || part.type === 'dynamic-tool';
        return isTool && (part.state === 'output-available' || part.state === 'output-error');
      });
      if (toolParts.length === 0) return false;
      const signature = `${last.id ?? `idx-${options.messages.length - 1}`}:${toolParts.length}`;
      if (lastAutoSendSignatureRef.current === signature) {
        return false;
      }
      lastAutoSendSignatureRef.current = signature;
      log('auto-send after tool outputs', { signature });
      return true;
    },
  } as unknown as Parameters<typeof useChat>[0];

  const { messages, sendMessage, status, addToolOutput, error } = useChat(chatOptions);

  useEffect(() => {
    if (!error) return;
    setLastError(error.message ?? 'AI request failed.');
  }, [error]);

  useEffect(() => {
    setTraceContext({ traceId, chatId });
  }, [traceId, chatId]);

  const isRunning = status === 'submitted' || status === 'streaming';

  const displayMessages = useMemo(
    () =>
      messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => {
          const parts = Array.isArray(message.parts) ? message.parts : [];
          const text = parts.reduce((acc, part) => {
            if (!part || part.type !== 'text' || typeof part.text !== 'string') {
              return acc;
            }
            return acc + part.text;
          }, '');
          return { id: message.id, role: message.role, text };
        })
        .filter((message) => message.text.trim().length > 0),
    [messages]
  );

  const handleSend = async () => {
    if (!input.trim() || isRunning) return;
    const nextInput = input.trim();
    setInput('');
    setLastToolResults([]);
    setLastError(null);
    lastAutoSendSignatureRef.current = null;
    pendingPreviewStorageIdsRef.current = [];
    log('send message', { text: nextInput });
    void logTrace('user_message', { text: nextInput });
    await sendMessage({ text: nextInput });
  };

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2">
      <div className="w-[min(720px,calc(100vw-2rem))] h-64 overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-sm flex flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          AI Assistant
        </div>
        <ScrollArea className="flex-1 min-h-0 px-4 py-3">
          <div className="space-y-3">
            {displayMessages.length === 0 && !lastError && (
              <div className="text-sm text-muted-foreground">
                Try: &quot;Create a yellow-blue gradient&quot; or &quot;Visualize UV&quot;.
              </div>
            )}
            {lastError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {lastError}
              </div>
            )}
            {displayMessages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-muted text-foreground'
                  }`}
              >
                {message.text}
              </div>
            ))}

            {lastToolResults.length > 0 && (
              <div className="rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground mb-1">Applied changes</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(lastToolResults.map((r) => r.toolName))).map((name) => (
                    <span key={name} className="rounded-full bg-muted px-2 py-0.5">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-sm px-3 py-2">
        <div className="flex items-center gap-2">
          {onOpenToolbar && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenToolbar}
              className="h-9 w-9"
              title="Show Toolbar"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          )}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you want to build..."
            className="flex-1 h-10 border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={isRunning} size="sm" className="gap-2">
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
