"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { getErrorMessage } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
                    <ShieldAlert className="h-12 w-12 text-destructive" />
                    <h2 className="text-xl font-semibold">Something went wrong</h2>
                    <p className="text-muted-foreground max-w-sm">
                        {getErrorMessage(this.state.error)}
                    </p>
                    <button
                        className="text-sm text-blue-500 hover:underline"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
