'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Send, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import { runToolCall } from '@/lib/ai/tool-runner';
import type { ToolName, ToolResult } from '@/lib/ai/types';
import { useEditorStore } from '@/store/editor';
import { aiLog, aiError } from '@/lib/ai/logger';
import { clearAiLogEntries, formatAiLogEntries, getAiLogEntries, subscribeAiLogs } from '@/lib/ai/log-store';

const SYSTEM_PROMPT = `You are an AI shader assistant for a node-based editor.\n\nRules:\n- Always start by calling getGraphSnapshot and getAvailableNodes.\n- Use tools to modify the graph; avoid guessing node IDs or ports.\n- Prefer bulkOperation when making multiple changes.\n- After edits, call validateGraph and compileAndValidate.\n- Only call capturePreview at most once per user request.\n- After tool calls, respond with a short, action-focused summary.`;

interface AiChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiChatPanel({ open, onOpenChange }: AiChatPanelProps) {
  const [input, setInput] = useState('');
  const [lastToolResults, setLastToolResults] = useState<ToolResult[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logEntries, setLogEntries] = useState(() => getAiLogEntries());
  const undo = useEditorStore((s) => s.undo);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai',
        body: {
          systemPrompt: SYSTEM_PROMPT,
        },
      }),
    []
  );

  const { messages, sendMessage, status, addToolOutput } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      aiLog('AI tool call received', { toolName: toolCall.toolName, toolCallId: toolCall.toolCallId });
      const input = (toolCall as { input?: unknown; args?: unknown }).input ?? (toolCall as { args?: unknown }).args;
      const result = await runToolCall({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName as ToolName,
        input,
      });

      setLastToolResults((prev) => [...prev, result]);

      if (result.isError) {
        const errorText =
          typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? { error: 'Tool failed' });
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText,
        });
        aiError('AI tool output error', { toolName: toolCall.toolName, errorText });
      } else {
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result.output,
        });
        aiLog('AI tool output queued', { toolName: toolCall.toolName });
      }
    },
    onError(error) {
      aiError('AI chat error', error);
    },
    onFinish({ finishReason, message }) {
      const text = message.parts.filter(isTextUIPart).map((part) => part.text).join('');
      aiLog('AI response finished', { finishReason, textLength: text.length });
    },
  });

  const isRunning = status === 'submitted' || status === 'streaming';

  const lastMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.id === lastMessageIdRef.current) {
      return;
    }
    lastMessageIdRef.current = lastMessage.id;
    const partSummaries = lastMessage.parts.map((part) => {
      if (isToolUIPart(part)) {
        return `tool:${getToolName(part)}:${part.state}`;
      }
      return part.type;
    });
    aiLog('AI message received', {
      role: lastMessage.role,
      partTypes: partSummaries,
    });
  }, [messages]);

  useEffect(() => {
    aiLog('AI status', status);
  }, [status]);

  useEffect(() => {
    setLogEntries(getAiLogEntries());
    return subscribeAiLogs(() => {
      setLogEntries(getAiLogEntries());
    });
  }, []);

  const displayMessages = useMemo(
    () =>
      messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          id: message.id,
          role: message.role,
          text: message.parts
            .filter(isTextUIPart)
            .map((part) => part.text)
            .join(''),
        }))
        .filter((message) => message.text.trim().length > 0),
    [messages]
  );

  const handleSend = async () => {
    if (!input.trim() || isRunning) return;
    const nextInput = input.trim();
    setInput('');
    setLastToolResults([]);
    aiLog('AI chat send', nextInput);
    try {
      await sendMessage({ text: nextInput });
    } catch (error) {
      aiError('AI chat send failed', error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI Shader Assistant
          </SheetTitle>
          <SheetDescription>
            Describe the shader or ask for edits. Changes apply automatically with one undo step.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
            <div className="space-y-3">
              {displayMessages.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Try: "Make a glossy blue material" or "Add animated noise to color."
                </div>
              )}
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-8'
                      : 'bg-muted text-foreground mr-8'
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

          <div className="border-t border-border p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {logEntries.length} log entries saved
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = formatAiLogEntries(getAiLogEntries());
                    navigator.clipboard.writeText(text).catch(() => {
                      // clipboard might be blocked
                    });
                  }}
                >
                  Copy logs
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearAiLogEntries()}
                >
                  Clear logs
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogs((prev) => !prev)}
                >
                  {showLogs ? 'Hide logs' : 'Show logs'}
                </Button>
              </div>
            </div>

            {showLogs && (
              <ScrollArea className="max-h-56 rounded-md border border-border bg-muted/40 p-2">
                <pre className="text-[11px] leading-4 whitespace-pre-wrap text-muted-foreground">
                  {formatAiLogEntries(logEntries) || 'No logs yet.'}
                </pre>
              </ScrollArea>
            )}

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe a shader or ask for a change..."
              className="min-h-[90px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={isRunning}
                className="gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Undo last AI batch
              </Button>
              <Button onClick={handleSend} disabled={isRunning} className="gap-2">
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
