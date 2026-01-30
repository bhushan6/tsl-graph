"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Loader2 } from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";

function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
            />
        </svg>
    )
}

function GithubIcon({ className }: { className?: string }) {
    return (
        <svg width="98" height="96" viewBox="0 0 98 96" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
            <g clip-path="url(#clip0_730_27126)">
                <path d="M41.4395 69.3848C28.8066 67.8535 19.9062 58.7617 19.9062 46.9902C19.9062 42.2051 21.6289 37.0371 24.5 33.5918C23.2559 30.4336 23.4473 23.7344 24.8828 20.959C28.7109 20.4805 33.8789 22.4902 36.9414 25.2656C40.5781 24.1172 44.4062 23.543 49.0957 23.543C53.7852 23.543 57.6133 24.1172 61.0586 25.1699C64.0254 22.4902 69.2891 20.4805 73.1172 20.959C74.457 23.543 74.6484 30.2422 73.4043 33.4961C76.4668 37.1328 78.0937 42.0137 78.0937 46.9902C78.0937 58.7617 69.1934 67.6621 56.3691 69.2891C59.623 71.3945 61.8242 75.9883 61.8242 81.252L61.8242 91.2051C61.8242 94.0762 64.2168 95.7031 67.0879 94.5547C84.4102 87.9512 98 70.6289 98 49.1914C98 22.1074 75.9883 6.69539e-07 48.9043 4.309e-07C21.8203 1.92261e-07 -1.9479e-07 22.1074 -4.3343e-07 49.1914C-6.20631e-07 70.4375 13.4941 88.0469 31.6777 94.6504C34.2617 95.6074 36.75 93.8848 36.75 91.3008L36.75 83.6445C35.4102 84.2188 33.6875 84.6016 32.1562 84.6016C25.8398 84.6016 22.1074 81.1563 19.4277 74.7441C18.375 72.1602 17.2266 70.6289 15.0254 70.3418C13.877 70.2461 13.4941 69.7676 13.4941 69.1934C13.4941 68.0449 15.4082 67.1836 17.3223 67.1836C20.0977 67.1836 22.4902 68.9063 24.9785 72.4473C26.8926 75.2227 28.9023 76.4668 31.2949 76.4668C33.6875 76.4668 35.2187 75.6055 37.4199 73.4043C39.0469 71.7773 40.291 70.3418 41.4395 69.3848Z" fill="white" />
            </g>
        </svg>

    )
}

interface SignInCardProps {
    hideAnonymous?: boolean;
    callbackUrl?: string;
}

export function SignInCard({ hideAnonymous, callbackUrl = "/dashboard" }: SignInCardProps) {
    const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | "anonymous" | null>(null);

    const handleSignIn = async (provider: "google" | "github") => {
        setLoadingProvider(provider);
        try {
            await authClient.signIn.social({
                provider,
                callbackURL: callbackUrl,
                fetchOptions: {
                    onSuccess: () => {
                        posthog.capture('user_signed_in', { provider });
                    }
                }
            });
        } catch {
            setLoadingProvider(null);
        }
    };

    return (
        <Card className="w-full max-w-sm border-border bg-card shadow-lg mx-auto">
            <CardHeader className="space-y-4 flex flex-col items-center text-center">
                <div className="flex items-center justify-center">
                    <Logo size="xl" />
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <Button
                    onClick={() => handleSignIn("google")}
                    variant="outline"
                    className="h-11"
                    disabled={loadingProvider !== null}
                >
                    {loadingProvider === "google" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <GoogleIcon className="h-4 w-4" />
                    )}
                    <span>Continue with Google</span>
                </Button>
                <Button
                    onClick={() => handleSignIn("github")}
                    variant="outline"
                    className="h-11"
                    disabled={loadingProvider !== null}
                >
                    {loadingProvider === "github" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <GithubIcon className="h-4 w-4" />
                    )}
                    Continue with GitHub
                </Button>

                {!hideAnonymous && (
                    <>
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">Or</span>
                            </div>
                        </div>
                        <Button
                            onClick={async () => {
                                setLoadingProvider("anonymous");
                                try {
                                    await authClient.signIn.anonymous({
                                        fetchOptions: {
                                            onSuccess: () => {
                                                posthog.capture('user_signed_in', { provider: 'anonymous' });
                                                window.location.href = callbackUrl;
                                            }
                                        }
                                    });
                                } catch {
                                    setLoadingProvider(null);
                                }
                            }}
                            variant="ghost"
                            className="h-11"
                            disabled={loadingProvider !== null}
                        >
                            {loadingProvider === "anonymous" && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Continue as Guest
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
