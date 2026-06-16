'use client';

import { ArrowRight, CheckCircle2, LayoutDashboard, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTutorialStore } from '@/store/tutorial-store';
import { tutorialDefinitions } from '@/lib/tutorial-definitions';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';

const coveredByTutorial: Record<string, string[]> = {
  tutorial_4: [
    'Panning and zooming the canvas',
    'Moving, deleting, and undoing node changes',
    'Recovering from mistakes quickly',
  ],
  tutorial_5: [
    'Changing preview geometry',
    'Switching HDRI environments',
    'Toggling the preview background',
  ],
  tutorial_1: [
    'Adding Float and Color nodes',
    'Selecting nodes from the canvas',
    'Editing node values from Properties',
  ],
  tutorial_2: [
    'Connecting node outputs to material inputs',
    'Replacing an existing connection',
    'Creating nodes from a dropped handle',
  ],
  tutorial_3: [
    'Using UV coordinates',
    'Mixing two colors',
    'Sending a custom chain into the material',
  ],
  tutorial_6: [
    'Using Add and Multiply',
    'Scaling values with Float',
    'Chaining math operations',
  ],
  tutorial_7: [
    'Using the Time node',
    'Creating wave motion with Sin',
    'Remapping animated values',
  ],
  tutorial_8: [
    'Uploading a texture image',
    'Feeding UV coordinates into a texture',
    'Applying an image to the material',
  ],
  tutorial_9: [
    'Enabling material inputs',
    'Using metalness and emissive',
    'Creating a metallic glow',
  ],
  tutorial_10: [
    'Using procedural noise',
    'Combining noise with color mixing',
    'Tuning noise amplitude',
  ],
  tutorial_11: [
    'Using Fresnel for edge glow',
    'Combining glow with Multiply',
    'Adjusting color with Saturation',
  ],
  tutorial_12: [
    'Using Position and Normal nodes',
    'Building vertex displacement',
    'Driving the Position material input',
  ],
  tutorial_13: [
    'Splitting vectors into components',
    'Using Step as a mask',
    'Selecting between two colors',
  ],
  tutorial_14: [
    'Switching to the Post graph',
    'Inserting Bloom into the chain',
    'Enabling post-processing preview',
  ],
  tutorial_15: [
    'Creating a subgraph from selected nodes',
    'Adding named color inputs',
    'Tweaking a reusable gradient node',
  ],
  tutorial_16: [
    'Opening the code panel',
    'Reading generated TSL',
    'Copying code for a Three.js project',
  ],
};

export function TutorialComplete() {
  const router = useRouter();
  const activeTutorialId = useTutorialStore((s) => s.activeTutorialId);
  const showCompleteModal = useTutorialStore((s) => s.showCompleteModal);
  const nextTutorial = useTutorialStore((s) => s.nextTutorial);
  const exitTutorial = useTutorialStore((s) => s.exitTutorial);
  const setShowCompleteModal = useTutorialStore((s) => s.setShowCompleteModal);

  if (!showCompleteModal || !activeTutorialId) return null;

  const currentTutorial = tutorialDefinitions.find((t) => t.id === activeTutorialId);
  const nextIndex = tutorialDefinitions.findIndex((t) => t.id === activeTutorialId) + 1;
  const hasNext = nextIndex < tutorialDefinitions.length;
  const nextTutorialTitle = hasNext ? tutorialDefinitions[nextIndex].title : '';
  const covered = coveredByTutorial[activeTutorialId] ?? [];
  const displayOrder = tutorialDefinitions.findIndex((t) => t.id === activeTutorialId) + 1;

  const captureCompletionEvent = (event: string, extra?: Record<string, unknown>) => {
    posthog.capture(event, {
      tutorialId: activeTutorialId,
      tutorialTitle: currentTutorial?.title,
      displayOrder,
      totalTasks: currentTutorial?.tasks.length,
      hasNext,
      ...extra,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex pointer-events-auto items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-lg">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Tutorial complete
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {currentTutorial?.title}
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            The sandbox is still open, so you can keep editing the graph or move to the next exercise.
          </p>

          {covered.length > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-3 text-left">
              <div className="mb-2 text-xs font-medium text-foreground">Covered</div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {covered.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
          {hasNext ? (
            <Button
              onClick={() => {
                captureCompletionEvent('tutorial_completion_next_clicked', {
                  nextTutorialId: tutorialDefinitions[nextIndex]?.id,
                  nextTutorialTitle,
                });
                nextTutorial();
              }}
              className="h-9 w-full text-xs font-medium"
            >
              Next: {nextTutorialTitle}
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <div className="mb-1 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-center text-xs font-medium text-primary">
              All tutorials are complete.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                captureCompletionEvent('tutorial_completion_keep_editing_clicked');
                setShowCompleteModal(false);
                exitTutorial();
              }}
              className="h-9 text-xs font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              Keep editing
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                captureCompletionEvent('tutorial_completion_dashboard_clicked');
                exitTutorial();
                router.replace('/dashboard');
              }}
              className="h-9 text-xs font-medium"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
