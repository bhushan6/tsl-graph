import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}));

describe('Tutorial session persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('restores an active tutorial session from localStorage', async () => {
    const storage = new Map<string, string>();
    const localStorageMock = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
      key: vi.fn(),
      length: 0,
    };

    storage.set(
      'tsl-tutorial-session',
      JSON.stringify({
        isActive: true,
        activeTutorialId: 'tutorial_8',
        activeTaskIndex: 1,
        completedTutorials: ['tutorial_1'],
        completedTasks: {
          t8_add_texture: true,
          t8_set_url: false,
        },
        showCompleteModal: false,
      })
    );

    vi.stubGlobal('localStorage', localStorageMock);

    const { hasStoredActiveTutorial, useTutorialStore } = await import('./tutorial-store');

    expect(hasStoredActiveTutorial()).toBe(true);

    const state = useTutorialStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.activeTutorialId).toBe('tutorial_8');
    expect(state.activeTaskIndex).toBe(1);
    expect(state.completedTutorials).toContain('tutorial_1');
    expect(state.completedTasks.t8_add_texture).toBe(true);
    expect(state.completedTasks.t8_set_url).toBe(false);
  });
});
