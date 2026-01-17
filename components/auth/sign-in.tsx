"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Github, Chrome } from "lucide-react";

export function SignIn() {
    const handleSignIn = async (provider: "google" | "github") => {
        await authClient.signIn.social({
            provider,
            callbackURL: "/dashboard",
        });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-background">
            <h1 className="text-3xl font-bold">Sign In to TSL Editor</h1>
            <div className="flex flex-col gap-4 w-full max-w-sm">
                <Button onClick={() => handleSignIn("google")} variant="outline" className="w-full">
                    <Chrome className="mr-2 h-4 w-4" />
                    Sign in with Google
                </Button>
                <Button onClick={() => handleSignIn("github")} variant="outline" className="w-full">
                    <Github className="mr-2 h-4 w-4" />
                    Sign in with GitHub
                </Button>
            </div>
        </div>
    );
}
