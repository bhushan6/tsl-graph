import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTutorialStore } from './tutorial-store';
import { useEditorStore } from './editor';
import { tutorialDefinitions } from '@/lib/tutorial-definitions';

// Mock posthog to prevent issues during testing
vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}));

describe('Tutorial System Store', () => {
  const getTutorial = (id: string) => {
    const tutorial = tutorialDefinitions.find((item) => item.id === id);
    if (!tutorial) {
      throw new Error(`Missing tutorial: ${id}`);
    }
    return tutorial;
  };

  beforeEach(() => {
    useTutorialStore.getState().exitTutorial();
    useTutorialStore.getState().resetProgress();
    useEditorStore.getState().resetEditor();
  });

  it('starts with tutorials inactive', () => {
    const state = useTutorialStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.activeTutorialId).toBeNull();
    expect(state.completedTutorials).toEqual([]);
  });

  it('starts tutorial correctly and calls setup', () => {
    const store = useTutorialStore.getState();
    const definition = getTutorial('tutorial_1');
    
    // Spy on setup function
    const setupSpy = vi.spyOn(definition, 'setup');

    store.startTutorial(definition.id);

    const updatedState = useTutorialStore.getState();
    expect(updatedState.isActive).toBe(true);
    expect(updatedState.activeTutorialId).toBe(definition.id);
    expect(updatedState.activeTaskIndex).toBe(0);
    expect(updatedState.completedTasks[definition.tasks[0].id]).toBe(false);
    expect(setupSpy).toHaveBeenCalledOnce();
  });

  it('completes tasks sequentially and finishes tutorial', () => {
    const store = useTutorialStore.getState();
    const definition = getTutorial('tutorial_1');
    
    store.startTutorial(definition.id);

    // Complete the first task
    const firstTaskId = definition.tasks[0].id;
    store.completeTask(firstTaskId);

    let updatedState = useTutorialStore.getState();
    expect(updatedState.completedTasks[firstTaskId]).toBe(true);
    expect(updatedState.activeTaskIndex).toBe(1);
    expect(updatedState.showCompleteModal).toBe(false);

    // Complete all remaining tasks
    for (let i = 1; i < definition.tasks.length; i++) {
      store.completeTask(definition.tasks[i].id);
    }

    updatedState = useTutorialStore.getState();
    expect(updatedState.showCompleteModal).toBe(true);
    expect(updatedState.completedTutorials).toContain(definition.id);
  });

  it('restores state correctly on exit', () => {
    const store = useTutorialStore.getState();
    const definition = getTutorial('tutorial_1');
    
    store.startTutorial(definition.id);
    store.exitTutorial();

    const updatedState = useTutorialStore.getState();
    expect(updatedState.isActive).toBe(false);
    expect(updatedState.activeTutorialId).toBeNull();
    expect(updatedState.completedTasks).toEqual({});
  });
});
