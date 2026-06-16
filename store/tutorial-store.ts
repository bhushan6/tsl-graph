import { create } from 'zustand';
import { tutorialDefinitions, TutorialDefinition, TutorialTask } from '@/lib/tutorial-definitions';
import posthog from 'posthog-js';

const SESSION_STORAGE_KEY = 'tsl-tutorial-session';
const PROGRESS_STORAGE_KEY = 'tsl-tutorial-progress';

export interface TutorialState {
  isActive: boolean;
  activeTutorialId: string | null;
  activeTaskIndex: number;
  completedTutorials: string[];
  completedTasks: Record<string, boolean>;
  showLauncher: boolean;
  showCompleteModal: boolean;
}

export interface TutorialActions {
  startTutorial: (tutorialId: string) => void;
  completeTask: (taskId: string) => void;
  nextTutorial: () => void;
  previousTutorial: () => void;
  exitTutorial: () => void;
  resetProgress: () => void;
  setLauncherOpen: (open: boolean) => void;
  setShowCompleteModal: (show: boolean) => void;
  getCurrentTutorial: () => TutorialDefinition | null;
  getCurrentTask: () => TutorialTask | null;
}

export interface TutorialSessionData {
  isActive: boolean;
  activeTutorialId: string | null;
  activeTaskIndex: number;
  completedTutorials: string[];
  completedTasks: Record<string, boolean>;
  showCompleteModal: boolean;
}

const getStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const getStoredCompleted = (): string[] => {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const stored = storage.getItem(PROGRESS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to read tutorial progress from localStorage', e);
    return [];
  }
};

const saveStoredCompleted = (completed: string[]) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(completed));
  } catch (e) {
    console.error('Failed to save tutorial progress to localStorage', e);
  }
};

const getStoredSession = (): TutorialSessionData | null => {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<TutorialSessionData> | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const activeTutorialId = typeof parsed.activeTutorialId === 'string' ? parsed.activeTutorialId : null;
    if (activeTutorialId && !tutorialDefinitions.some((tutorial) => tutorial.id === activeTutorialId)) {
      return null;
    }

    return {
      isActive: parsed.isActive === true,
      activeTutorialId,
      activeTaskIndex: Number.isInteger(parsed.activeTaskIndex) ? Math.max(0, parsed.activeTaskIndex ?? 0) : 0,
      completedTutorials: Array.isArray(parsed.completedTutorials)
        ? parsed.completedTutorials.filter((item): item is string => typeof item === 'string')
        : [],
      completedTasks: parsed.completedTasks && typeof parsed.completedTasks === 'object' ? { ...parsed.completedTasks } : {},
      showCompleteModal: parsed.showCompleteModal === true,
    };
  } catch (e) {
    console.error('Failed to read tutorial session from localStorage', e);
    return null;
  }
};

const saveStoredSession = (state: TutorialState) => {
  const storage = getStorage();
  if (!storage) return;

  try {
    const session: TutorialSessionData = {
      isActive: state.isActive,
      activeTutorialId: state.activeTutorialId,
      activeTaskIndex: state.activeTaskIndex,
      completedTutorials: state.completedTutorials,
      completedTasks: state.completedTasks,
      showCompleteModal: state.showCompleteModal,
    };
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save tutorial session to localStorage', e);
  }
};

const removeStoredSession = () => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear tutorial session from localStorage', e);
  }
};

const sanitizeCompletedTasks = (tutorial: TutorialDefinition | undefined, completedTasks: Record<string, boolean>) => {
  if (!tutorial) return {};

  const taskIds = new Set(tutorial.tasks.map((task) => task.id));
  const nextTasks: Record<string, boolean> = {};
  for (const task of tutorial.tasks) {
    nextTasks[task.id] = Boolean(completedTasks[task.id]);
  }
  for (const [taskId, isComplete] of Object.entries(completedTasks)) {
    if (taskIds.has(taskId)) {
      nextTasks[taskId] = Boolean(isComplete);
    }
  }
  return nextTasks;
};

const getInitialSessionState = (): Partial<TutorialState> => {
  const stored = getStoredSession();
  if (!stored?.isActive || !stored.activeTutorialId) {
    return {};
  }

  const tutorial = tutorialDefinitions.find((item) => item.id === stored.activeTutorialId);
  if (!tutorial) {
    return {};
  }

  const maxTaskIndex = Math.max(0, tutorial.tasks.length - 1);
  return {
    isActive: true,
    activeTutorialId: stored.activeTutorialId,
    activeTaskIndex: Math.min(stored.activeTaskIndex, maxTaskIndex),
    completedTutorials: stored.completedTutorials,
    completedTasks: sanitizeCompletedTasks(tutorial, stored.completedTasks),
    showLauncher: false,
    showCompleteModal: stored.showCompleteModal,
  };
};

export const hasStoredActiveTutorial = (): boolean => {
  const stored = getStoredSession();
  return Boolean(stored?.isActive && stored.activeTutorialId);
};

export const useTutorialStore = create<TutorialState & TutorialActions>((set, get) => ({
  isActive: false,
  activeTutorialId: null,
  activeTaskIndex: 0,
  completedTutorials: getStoredCompleted(),
  completedTasks: {},
  showLauncher: false,
  showCompleteModal: false,
  ...getInitialSessionState(),

  getCurrentTutorial: () => {
    const { activeTutorialId } = get();
    if (!activeTutorialId) return null;
    return tutorialDefinitions.find((t) => t.id === activeTutorialId) || null;
  },

  getCurrentTask: () => {
    const { activeTaskIndex } = get();
    const tutorial = get().getCurrentTutorial();
    if (!tutorial || activeTaskIndex < 0 || activeTaskIndex >= tutorial.tasks.length) return null;
    return tutorial.tasks[activeTaskIndex];
  },

  startTutorial: (tutorialId: string) => {
    const tutorial = tutorialDefinitions.find((t) => t.id === tutorialId);
    if (!tutorial) return;

    // Reset task progress for this tutorial
    const initialCompleted: Record<string, boolean> = {};
    tutorial.tasks.forEach((t) => {
      initialCompleted[t.id] = false;
    });

    // Build the sandbox before the tutorial becomes active so validation
    // does not see intermediate node selections from setup.
    if (tutorial.setup) {
      tutorial.setup();
    }

    set({
      isActive: true,
      activeTutorialId: tutorialId,
      activeTaskIndex: 0,
      completedTasks: initialCompleted,
      showLauncher: false,
      showCompleteModal: false,
      completedTutorials: get().completedTutorials,
    });
    saveStoredSession(get());

    posthog.capture('tutorial_started', { tutorialId });
  },

  completeTask: (taskId: string) => {
    const { activeTutorialId, activeTaskIndex, completedTasks, completedTutorials } = get();
    if (!activeTutorialId) return;

    const tutorial = get().getCurrentTutorial();
    if (!tutorial) return;

    const task = tutorial.tasks[activeTaskIndex];
    if (!task || task.id !== taskId || completedTasks[taskId]) return;

    // Mark task as complete
    const updatedTasks = { ...completedTasks, [taskId]: true };
    
    // Check if there is a next task
    const nextIndex = activeTaskIndex + 1;
    const isTutorialComplete = nextIndex >= tutorial.tasks.length;

    if (isTutorialComplete) {
      // Tutorial completed!
      const updatedTutorials = completedTutorials.includes(activeTutorialId)
        ? completedTutorials
        : [...completedTutorials, activeTutorialId];
      
      saveStoredCompleted(updatedTutorials);

      set({
        completedTasks: updatedTasks,
        completedTutorials: updatedTutorials,
        isActive: true,
        showCompleteModal: true,
      });
      saveStoredSession(get());

      posthog.capture('tutorial_completed', { tutorialId: activeTutorialId });
    } else {
      // Move to next task
      set({
        completedTasks: updatedTasks,
        activeTaskIndex: nextIndex,
      });
      saveStoredSession(get());

      posthog.capture('tutorial_step_completed', {
        tutorialId: activeTutorialId,
        taskIndex: activeTaskIndex,
        taskId,
      });
    }
  },

  nextTutorial: () => {
    const { activeTutorialId } = get();
    if (!activeTutorialId) return;

    const currentIndex = tutorialDefinitions.findIndex((t) => t.id === activeTutorialId);
    if (currentIndex === -1 || currentIndex >= tutorialDefinitions.length - 1) {
      // No next tutorial
      return;
    }

    const nextTutorialId = tutorialDefinitions[currentIndex + 1].id;
    get().startTutorial(nextTutorialId);
  },

  previousTutorial: () => {
    const { activeTutorialId } = get();
    if (!activeTutorialId) return;

    const currentIndex = tutorialDefinitions.findIndex((t) => t.id === activeTutorialId);
    if (currentIndex <= 0) {
      // No previous tutorial
      return;
    }

    const prevTutorialId = tutorialDefinitions[currentIndex - 1].id;
    get().startTutorial(prevTutorialId);
  },

  exitTutorial: () => {
    const { activeTutorialId, completedTasks, activeTaskIndex } = get();
    if (activeTutorialId) {
      const tutorial = get().getCurrentTutorial();
      const totalTasks = tutorial?.tasks.length || 0;
      const isFinished = activeTaskIndex >= totalTasks || (tutorial && completedTasks[tutorial.tasks[totalTasks - 1]?.id]);
      
      if (!isFinished) {
        posthog.capture('tutorial_abandoned', {
          tutorialId: activeTutorialId,
          progress: `${activeTaskIndex}/${totalTasks}`,
        });
      }
    }

    set({
      isActive: false,
      activeTutorialId: null,
      activeTaskIndex: 0,
      completedTasks: {},
      showLauncher: false,
      showCompleteModal: false,
    });
    saveStoredSession(get());
  },

  resetProgress: () => {
    const storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(PROGRESS_STORAGE_KEY);
      } catch (e) {
        console.error(e);
      }
    }
    removeStoredSession();
    set({
      completedTutorials: [],
    });
  },

  setLauncherOpen: (open: boolean) => {
    set({ showLauncher: open });
    saveStoredSession(get());
  },

  setShowCompleteModal: (show: boolean) => {
    set({ showCompleteModal: show });
    saveStoredSession(get());
  },
}));
