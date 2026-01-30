"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignInCard } from "./sign-in-card";
import { Loader2 } from "lucide-react";

function SignInContent() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect");
    const callbackUrl = redirect ? decodeURIComponent(redirect) : "/dashboard";

    return <SignInCard callbackUrl={callbackUrl} />;
}

export function SignIn() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-primary" />}>
                <SignInContent />
            </Suspense>
        </div>
    );
}
