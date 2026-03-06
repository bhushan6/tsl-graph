"use client";
import dynamic from 'next/dynamic';

const StandaloneEditorClient = dynamic(() => import('./standalone-editor-client'), {
    ssr: false,
});

export default function StandaloneEditorPage() {
    return <StandaloneEditorClient />;
}
