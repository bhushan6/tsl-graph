'use client';

// Error boundaries must be Client Components
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error
        console.error('Global error:', error);
    }, [error]);

    return (
        // global-error must include html and body tags
        <html>
            <body>
                <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4 text-foreground">
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-10 w-10 text-destructive" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Critical Error</h1>
                    <p className="text-muted-foreground mb-8 text-center max-w-md">
                        A critical application error occurred. We apologize for the inconvenience.
                    </p>

                    <div className="rounded-md bg-muted/50 p-4 mb-8 text-xs font-mono text-left overflow-auto max-h-[200px] w-full max-w-lg border border-border">
                        {error.message || 'Unknown error'}
                    </div>

                    <div className="flex gap-4">
                        <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Reload Application
                        </Button>
                        <Button onClick={() => reset()} className="gap-2">
                            Try Again
                        </Button>
                    </div>
                </div>
            </body>
        </html>
    );
}
