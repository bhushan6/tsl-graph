'use client';

import { useEffect, useState } from 'react';
import { Check, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TutorialTask } from '@/lib/tutorial-definitions';
import { useEditorStore } from '@/store/editor';
import { Button } from '@/components/ui/button';

interface TutorialTaskItemProps {
  task: TutorialTask;
  isActive: boolean;
  isCompleted: boolean;
  isLastTask?: boolean;
  onComplete?: () => void;
}

export function TutorialTaskItem({ task, isActive, isCompleted, isLastTask = false, onComplete }: TutorialTaskItemProps) {
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [showHintButton, setShowHintButton] = useState(false);
  const [revealHint, setRevealHint] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const isOpen = isActive || isExpanded;

  // Monitor validation state dynamically for active task
  useEffect(() => {
    if (!isActive || isCompleted) {
      return;
    }

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (!cancelled) {
        setIsValid(task.validate(useEditorStore.getState()));
      }
    });

    const unsubscribe = useEditorStore.subscribe((state) => {
      setIsValid(task.validate(state));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      unsubscribe();
    };
  }, [isActive, isCompleted, task]);

  // Timer to reveal hint button after 15 seconds of inactivity on this active task
  useEffect(() => {
    const resetFrameId = requestAnimationFrame(() => {
      setShowHintButton(false);
      setRevealHint(false);
    });

    if (!isActive || isCompleted || !task.hint) {
      return () => cancelAnimationFrame(resetFrameId);
    }

    const timer = setTimeout(() => {
      setShowHintButton(true);
    }, 15000); // 15 seconds

    return () => {
      cancelAnimationFrame(resetFrameId);
      clearTimeout(timer);
    };
  }, [isActive, isCompleted, task.hint, task.id]);

  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-colors duration-150',
        isActive
          ? 'border-primary/40 bg-primary/5'
          : isCompleted
            ? 'border-border bg-muted/30'
            : 'border-border/70 bg-background/40 opacity-70'
      )}
    >
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Checkbox Icon */}
        <div
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors duration-150',
            isCompleted
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : isActive
                ? 'border-primary bg-background'
                : 'border-muted-foreground/30 bg-background/20'
          )}
        >
          {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </div>

        {/* Task Label */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'block truncate text-xs font-medium transition-colors duration-150',
              isCompleted
                ? 'line-through decoration-emerald-500/70 text-muted-foreground'
                : isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground'
            )}
          >
            {task.label}
          </span>
        </div>

        {/* Toggle Expand Icon */}
        <div className="text-muted-foreground/60 hover:text-foreground">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded Description */}
      {isOpen && (
        <div className="mt-2 space-y-2 pl-8 text-[11px] leading-relaxed text-muted-foreground">
          <p>{task.description}</p>

          {task.manualComplete && isValid && !isCompleted && (
            <div className="pt-2">
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onComplete) onComplete();
                }}
                className="h-7 px-3 text-xs font-medium pointer-events-auto"
              >
                {isLastTask ? 'Finish' : 'Continue'}
              </Button>
            </div>
          )}

          {task.hint && (isActive && !isCompleted) && (
            <div className="pt-1">
              {!revealHint ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRevealHint(true);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 text-[11px] font-medium transition-colors duration-150',
                    showHintButton
                      ? 'text-foreground hover:text-primary'
                      : 'text-muted-foreground/40 hover:text-muted-foreground/70'
                  )}
                >
                  <HelpCircle className="w-3 h-3" />
                  Need a hint?
                </button>
              ) : (
                <div className="flex items-start gap-1.5 rounded-md border border-border bg-muted/30 p-2 font-medium text-foreground">
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{task.hint}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
