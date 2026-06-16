"use client";

import { useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { hasStoredActiveTutorial, useTutorialStore } from '@/store/tutorial-store';
import { useSearchParams } from 'next/navigation';

const TutorialEditorClient = dynamic(() => import('./tutorial-editor-client'), {
    ssr: false,
});

function TutorialPageContent() {
    const setLauncherOpen = useTutorialStore((s) => s.setLauncherOpen);
    const startTutorial = useTutorialStore((s) => s.startTutorial);
    const searchParams = useSearchParams();

    useEffect(() => {
        const startId = searchParams.get('start');
        if (startId) {
            startTutorial(startId);
        } else if (!hasStoredActiveTutorial()) {
            // Automatically open the tutorial welcome/launcher screen on mount
            setLauncherOpen(true);
        }
    }, [setLauncherOpen, startTutorial, searchParams]);

    return <TutorialEditorClient />;
}

export default function TutorialPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading tutorial sandbox...</div>}>
            <TutorialPageContent />
        </Suspense>
    );
}
