'use client';

import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Minimize2, Maximize2, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTutorialStore } from '@/store/tutorial-store';
import { useEditorStore } from '@/store/editor';
import { TutorialTaskItem } from './TutorialTaskItem';
import { tutorialDefinitions } from '@/lib/tutorial-definitions';
import posthog from 'posthog-js';

export function TutorialOverlay() {
  const isActive = useTutorialStore((s) => s.isActive);
  const activeTutorialId = useTutorialStore((s) => s.activeTutorialId);
  const activeTaskIndex = useTutorialStore((s) => s.activeTaskIndex);
  const completedTasks = useTutorialStore((s) => s.completedTasks);
  const exitTutorial = useTutorialStore((s) => s.exitTutorial);
  const completeTask = useTutorialStore((s) => s.completeTask);
  const previousTutorial = useTutorialStore((s) => s.previousTutorial);
  const nextTutorial = useTutorialStore((s) => s.nextTutorial);
  
  const currentTutorial = useTutorialStore((s) => s.getCurrentTutorial());
  const currentTask = useTutorialStore((s) => s.getCurrentTask());

  const [isMinimized, setIsMinimized] = useState(false);
  const [isTasksListOpen, setIsTasksListOpen] = useState(true);

  // Subscribe to the editor store to validate task goals on every change
  useEffect(() => {
    if (!isActive || !currentTask) return;

    // Run initial validation check
    const initialState = useEditorStore.getState();
    if (!currentTask.manualComplete && currentTask.validate(initialState)) {
      completeTask(currentTask.id);
    }

    // Subscribe to editor store changes
    const unsubscribe = useEditorStore.subscribe((state) => {
      // Fetch the latest active task dynamically from the tutorial store state
      const latestTask = useTutorialStore.getState().getCurrentTask();
      if (latestTask && !latestTask.manualComplete && latestTask.validate(state)) {
        useTutorialStore.getState().completeTask(latestTask.id);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isActive, currentTask, completeTask]);

  if (!isActive || !currentTutorial) return null;

  const totalTasks = currentTutorial.tasks.length;
  const completedCount = currentTutorial.tasks.filter((t) => completedTasks[t.id]).length;
  const progressPercent = (completedCount / totalTasks) * 100;
  const displayOrder = tutorialDefinitions.findIndex((t) => t.id === activeTutorialId) + 1;

  const isFirstTutorial = tutorialDefinitions[0].id === activeTutorialId;
  const isLastTutorial = tutorialDefinitions[tutorialDefinitions.length - 1].id === activeTutorialId;
  const isCurrentTutorialFullyCompleted = completedCount === totalTasks;

  const captureTutorialEvent = (event: string, extra?: Record<string, unknown>) => {
    posthog.capture(event, {
      tutorialId: activeTutorialId,
      tutorialTitle: currentTutorial.title,
      displayOrder,
      taskIndex: activeTaskIndex,
      taskLabel: currentTutorial.tasks[activeTaskIndex]?.label,
      completedTasks: completedCount,
      totalTasks,
      progressPercent: Math.round(progressPercent),
      ...extra,
    });
  };

  if (isMinimized) {
    return (
      <div className="absolute top-4 left-4 z-40 pointer-events-auto">
        <button
          onClick={() => {
            captureTutorialEvent('tutorial_overlay_restored');
            setIsMinimized(false);
          }}
          className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-xs font-medium text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent"
        >
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-48 truncate">{currentTutorial.title}</span>
          <span className="text-muted-foreground">{completedCount}/{totalTasks}</span>
          <Maximize2 className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-4 z-40 flex max-h-[80vh] w-80 pointer-events-auto flex-col overflow-hidden rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md">
      <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border px-3 py-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="truncate text-xs font-semibold text-foreground">
            {currentTutorial.title}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              captureTutorialEvent('tutorial_overlay_minimized');
              setIsMinimized(true);
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            title="Minimize tutorial"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              captureTutorialEvent('tutorial_exit_clicked');
              exitTutorial();
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            title="Exit tutorial"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="h-1 w-full shrink-0 bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {currentTutorial.description}
        </p>

        <div className="space-y-2">
          <button
            onClick={() => setIsTasksListOpen(!isTasksListOpen)}
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Tasks ({completedCount}/{totalTasks})</span>
            {isTasksListOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {isTasksListOpen && (
            <div className="space-y-2.5 pt-1">
              {currentTutorial.tasks.map((task, index) => {
                const isCompleted = !!completedTasks[task.id];
                const isTaskActive = activeTaskIndex === index && !isCompleted;
                return (
                  <TutorialTaskItem
                    key={task.id}
                    task={task}
                    isActive={isTaskActive}
                    isCompleted={isCompleted}
                    isLastTask={index === totalTasks - 1}
                    onComplete={() => completeTask(task.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-sidebar-border px-3 py-2.5">
        <button
          onClick={() => {
            captureTutorialEvent('tutorial_exit_clicked');
            exitTutorial();
          }}
          className="rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          Exit
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              captureTutorialEvent('tutorial_previous_clicked');
              previousTutorial();
            }}
            disabled={isFirstTutorial}
            className="h-7 w-7 rounded-md"
            title="Previous tutorial"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <span className="text-[10px] font-semibold text-muted-foreground px-1">
            {displayOrder} / {tutorialDefinitions.length}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              captureTutorialEvent('tutorial_next_clicked');
              nextTutorial();
            }}
            disabled={isLastTutorial || !isCurrentTutorialFullyCompleted}
            className="h-7 w-7 rounded-md"
            title="Next tutorial"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
