'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Send, Loader2, Sparkles, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Input as TextInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useChat } from '@ai-sdk/react';
import { runToolCall } from '@/lib/ai/tool-runner';
import type { ToolName, ToolResult } from '@/lib/ai/types';
import { getToolLabel } from '@/lib/ai/tool-labels';
import { DefaultChatTransport } from 'ai';
import { logTrace, setTraceContext } from '@/lib/ai/trace';
import {
  clearSettings,
  getDefaultModel,
  getSettings,
  saveSettings,
  type AIProvider,
  type UserAISettings,
} from '@/lib/ai/user-ai-settings';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

interface AiChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export function AiChatPanel({ open, onOpenChange }: AiChatPanelProps) {


  const traceId = useMemo(() => makeId(), []);
  const chatId = useMemo(() => makeId(), []);

  const [input, setInput] = useState('');
  const [settings, setSettings] = useState<UserAISettings>(() => getSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const modelAnchor = useComboboxAnchor();
  const debug = process.env.NEXT_PUBLIC_AI_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
  const log = (...args: unknown[]) => {
    if (debug) console.log('[AI Chat]', ...args);
  };

  const [lastToolResults, setLastToolResults] = useState<ToolResult[]>([]);
  const lastAutoSendSignatureRef = useRef<string | null>(null);
  const pendingPreviewStorageIdsRef = useRef<string[]>([]);
  const deletePreviewImage = useMutation(api.ai.deletePreviewImage);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai',
        prepareSendMessagesRequest: (options) => {
          const current = getSettings();
          const baseHeaders =
            options.headers instanceof Headers
              ? Object.fromEntries(options.headers.entries())
              : (options.headers ?? {});
          const apiKey = current.apiKey.trim();
          return {
            headers: apiKey
              ? { ...baseHeaders, Authorization: `Bearer ${apiKey}` }
              : baseHeaders,
            body: {
              ...options.body,
              id: options.id,
              messages: options.messages,
              trigger: options.trigger,
              messageId: options.messageId,
              traceId,
              chatId,
              provider: current.provider,
              model: current.model,
            },
          };
        },
      }),
    [traceId, chatId]
  );

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

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const isRunning = status === 'submitted' || status === 'streaming';
  const apiKeyMissing = settings.apiKey.trim().length === 0;
  const modelOptions: Record<AIProvider, string[]> = {
    openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o'],
    anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
    google: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    gateway: [
      'openai/gpt-4.1',
      'openai/gpt-4.1-mini',
      'openai/gpt-4o',
      'anthropic/claude-3-5-sonnet-latest',
      'anthropic/claude-3-5-haiku-latest',
      'google/gemini-1.5-pro',
      'google/gemini-1.5-flash',
    ],
  };
  const availableModels = modelOptions[settings.provider];
  const modelItems = availableModels.includes(settings.model)
    ? availableModels
    : [settings.model, ...availableModels].filter(Boolean);

  useEffect(() => {
    if (apiKeyMissing) {
      setShowSettings(true);
    }
  }, [apiKeyMissing]);

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
    if (!input.trim() || isRunning || apiKeyMissing) {
      if (apiKeyMissing) {
        setShowSettings(true);
      }
      return;
    }
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

  const handleProviderChange = (provider: AIProvider) => {
    setSettings((prev) => {
      const nextDefault = getDefaultModel(provider);
      const nextModel = modelOptions[provider].includes(prev.model)
        ? prev.model
        : nextDefault;
      return {
        ...prev,
        provider,
        model: nextModel,
      };
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI Chat
            <div className="ml-auto flex items-center gap-2">
              <div className="min-w-[180px]">
              <Combobox
                items={modelItems}
                value={settings.model}
                onValueChange={(value) => {
                  if (!value) return;
                  setSettings((prev) => ({ ...prev, model: value as string }));
                }}
                itemToStringLabel={(value) => String(value)}
                itemToStringValue={(value) => String(value)}
              >
                <div ref={modelAnchor} className="w-full">
                  <ComboboxInput
                    placeholder="Select model"
                    className="h-7 bg-transparent border border-border/60 rounded-md text-[11px] [&_[data-slot=input-group-control]]:h-7 [&_[data-slot=input-group-control]]:text-[11px] [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:py-0"
                    showClear={false}
                  />
                </div>
                <ComboboxContent anchor={modelAnchor} align="end" sideOffset={4}>
                  <ComboboxEmpty>No models found.</ComboboxEmpty>
                  <ComboboxList>
                    {(item) => (
                        <ComboboxItem key={String(item)} value={item} className="text-[11px]">
                          {String(item)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
              <Popover open={showSettings} onOpenChange={setShowSettings}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" />
                    Settings
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">AI Setup</div>
                    {settings.apiKey.trim().length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          clearSettings();
                          setSettings((prev) => ({
                            ...prev,
                            apiKey: '',
                          }));
                        }}
                      >
                        Clear key
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-1">
                      <Label className="text-[11px] text-muted-foreground">Provider</Label>
                      <Select
                        value={settings.provider}
                        onValueChange={(value) => handleProviderChange(value as AIProvider)}
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue placeholder="Provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="gateway">Vercel Gateway</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[11px] text-muted-foreground">API Key</Label>
                      <TextInput
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, apiKey: e.target.value }))
                        }
                        placeholder="Paste your provider API key"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Keys are stored locally in your browser (localStorage). Avoid using
                      untrusted scripts or shared devices.
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </SheetTitle>
          <SheetDescription>
            Ask questions about shaders or describe what you want to build.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
            <div className="space-y-3">
              {displayMessages.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Try: &quot;Create a yellow-blue gradient&quot; or &quot;Explain what this node does.&quot;
                </div>
              )}
              {lastError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive max-w-[450px]">
                  {lastError}
                </div>
              )}
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg px-3 py-2 text-sm ${message.role === 'user'
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
                    {Array.from(
                      new Set(lastToolResults.map((r) => getToolLabel(r.toolName)))
                    ).map((label) => (
                      <span key={label} className="rounded-full bg-muted px-2 py-0.5">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border p-4 space-y-3 shrink-0">
            {apiKeyMissing && (
              <div className="text-xs text-amber-600">
                Add an API key from Settings to enable AI chat.
              </div>
            )}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the assistant..."
              className="min-h-[90px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex items-center justify-end">
              <Button onClick={handleSend} disabled={isRunning || apiKeyMissing} className="gap-2">
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
