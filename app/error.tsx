'use client';

import { useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorCodes } from '@/convex/errors';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useLayoutEffect(() => {
        // Log the error to an error reporting service
        console.error('Application error:', error);

        // Check for authentication errors and redirect to sign-in
        // ConvexError wraps the error data - check for NOT_AUTHENTICATED code
        const errorMessage = error.message || '';

        // ConvexError messages contain the JSON data, so we check for the error code
        if (
            errorMessage.includes(`"code":${ErrorCodes.NOT_AUTHENTICATED}`) ||
            errorMessage.includes(`"code": ${ErrorCodes.NOT_AUTHENTICATED}`)
        ) {
            window.location.href = '/sign-in';
        }
    }, [error]);

    return (
        <div className="flex h-screen w-full items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md shadow-lg border-destructive/20 bg-card">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                    </div>
                    <CardTitle className="text-xl">Something went wrong!</CardTitle>
                    <CardDescription>
                        An unexpected error occurred while running the application.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center pt-2 pb-6">
                    <div className="rounded-md bg-muted/50 p-3 mb-4 text-xs font-mono text-left overflow-auto max-h-[150px] border border-border">
                        {error.message || 'Unknown error'}
                        {error.digest && (
                            <div className="mt-2 text-muted-foreground">
                                Digest: {error.digest}
                            </div>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        We&apos;ve been notified of the issue. Please try refreshing the page.
                    </p>
                </CardContent>
                <CardFooter className="flex justify-center gap-2">
                    <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Reload Page
                    </Button>
                    <Button onClick={() => reset()} className="gap-2">
                        Try Again
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
