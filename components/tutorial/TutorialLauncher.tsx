'use client';

import { X, Play, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTutorialStore } from '@/store/tutorial-store';
import { tutorialDefinitions } from '@/lib/tutorial-definitions';
import { cn } from '@/lib/utils';
import { useRouter, usePathname } from 'next/navigation';

interface TutorialLauncherProps {
  onClose?: () => void;
}

export function TutorialLauncher({ onClose }: TutorialLauncherProps) {
  const showLauncher = useTutorialStore((s) => s.showLauncher);
  const startTutorial = useTutorialStore((s) => s.startTutorial);
  const completedTutorials = useTutorialStore((s) => s.completedTutorials);
  const resetProgress = useTutorialStore((s) => s.resetProgress);
  const setLauncherOpen = useTutorialStore((s) => s.setLauncherOpen);

  const pathname = usePathname();
  const router = useRouter();

  if (!showLauncher) return null;

  const handleClose = () => {
    setLauncherOpen(false);
    if (onClose) onClose();
  };

  const handleStart = (id: string) => {
    if (pathname !== '/editor/tutorial') {
      setLauncherOpen(false);
      router.push(`/editor/tutorial?start=${id}`);
    } else {
      startTutorial(id);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex pointer-events-auto items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
        <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div className="text-left">
            <div className="text-sm font-semibold text-foreground">
              Tutorials
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Practice the editor basics in a disposable sandbox.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Close tutorials"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {tutorialDefinitions.map((tutorial, index) => {
            const isCompleted = completedTutorials.includes(tutorial.id);
            return (
              <div
                key={tutorial.id}
                className={cn(
                  'flex flex-col items-start justify-between gap-3 rounded-md border p-3 transition-colors md:flex-row md:items-center',
                  isCompleted ? 'border-primary/30 bg-primary/5' : 'border-border bg-background hover:border-primary/40'
                )}
              >
                <div className="flex gap-3 text-left">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
                      isCompleted
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-border bg-muted/30 text-muted-foreground'
                    )}
                  >
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : `0${index + 1}`}
                  </div>

                  <div className="space-y-1 pr-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {tutorial.title}
                      {isCompleted && (
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                      {tutorial.description}
                    </p>
                    <div className="pt-1 text-[11px] font-medium text-muted-foreground">
                      {tutorial.tasks.length} tasks
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleStart(tutorial.id)}
                  className="h-8 w-full shrink-0 text-xs font-medium md:w-auto"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {isCompleted ? 'Restart' : 'Start'}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
          {completedTutorials.length > 0 ? (
            <button
              onClick={resetProgress}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="w-3 h-3" />
              Reset progress
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs font-medium">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
