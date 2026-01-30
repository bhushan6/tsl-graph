"use client";

import { useSearchParams } from "next/navigation";
import { SignInCard } from "./sign-in-card";

export function SignIn() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect");
    const callbackUrl = redirect ? decodeURIComponent(redirect) : "/dashboard";

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <SignInCard callbackUrl={callbackUrl} />
        </div>
    );
}
