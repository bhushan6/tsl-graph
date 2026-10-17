"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignInCard } from "./sign-in-card";
import { Loader2 } from "lucide-react";
import { safeRedirectPath } from "@/lib/safe-redirect";

function SignInContent() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect");
    // Only same-origin paths: this value ends up in window.location.href.
    const callbackUrl = safeRedirectPath(redirect);

    return <SignInCard callbackUrl={callbackUrl} />;
}

import { GrainGradient } from '@paper-design/shaders-react';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

export function SignIn() {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const isDark = resolvedTheme === "dark";

    // Colorful "Aurora" gradient for sign-in background
    const colors = isDark
        ? ["#2A7B9B", "#57C785", "#EDDD53", "#E95E4F"] // Deep vibrant colors
        : ["#79C7E3", "#96E8B6", "#FBEA89", "#FFA69E"]; // Softer pastel colors
    const colorBack = isDark ? "#0A0A0A" : "#FDFCFD";

    return (
        <div className="relative flex min-h-screen items-center justify-center p-4 bg-background overflow-hidden">
            {mounted && (
                <div className="absolute inset-0 z-0">
                    <GrainGradient
                        width="100%"
                        height="100%"
                        colors={colors}
                        colorBack={colorBack}
                        softness={0.5}
                        intensity={0.4}
                        noise={0.2}
                        shape="corners"
                        speed={1.5}
                    />
                </div>
            )}

            <div className="z-10 relative">
                <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-muted" />}>
                    <SignInContent />
                </Suspense>
            </div>
        </div>
    );
}
