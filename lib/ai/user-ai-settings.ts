export type AIProvider = 'openai' | 'anthropic' | 'google' | 'gateway';

export interface UserAISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

const STORAGE_KEY = 'tsl-ai-settings';

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4.1',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-1.5-pro',
  gateway: 'openai/gpt-4.1',
};

const DEFAULT_PROVIDER: AIProvider = 'openai';

export const getDefaultModel = (provider: AIProvider) => DEFAULT_MODELS[provider];

export const getDefaultSettings = (provider: AIProvider = DEFAULT_PROVIDER): UserAISettings => ({
  provider,
  model: DEFAULT_MODELS[provider],
  apiKey: '',
});

const normalizeProvider = (value: unknown): AIProvider => {
  if (value === 'openai' || value === 'anthropic' || value === 'google' || value === 'gateway') {
    return value;
  }
  return DEFAULT_PROVIDER;
};

const normalizeSettings = (value: unknown): UserAISettings => {
  if (!value || typeof value !== 'object') {
    return getDefaultSettings();
  }
  const record = value as Partial<UserAISettings>;
  const provider = normalizeProvider(record.provider);
  const model =
    typeof record.model === 'string' && record.model.trim().length > 0
      ? record.model
      : DEFAULT_MODELS[provider];
  const apiKey = typeof record.apiKey === 'string' ? record.apiKey : '';
  return { provider, model, apiKey };
};

export const getSettings = (): UserAISettings => {
  if (typeof window === 'undefined') {
    return getDefaultSettings();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultSettings();
    }
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return getDefaultSettings();
  }
};

export const saveSettings = (settings: UserAISettings) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors (quota/private mode).
  }
};

export const clearSettings = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};
