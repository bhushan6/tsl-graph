"use client";

import { type PropsWithChildren } from "react";
import { ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// The component's AuthClient type rejects better-auth >=1.6.18 clients
// (get-convex/better-auth#452). It's declaration-only: the provider just
// calls useSession, getSession and convex.token, which our client has.
const providerAuthClient = authClient as unknown as AuthClient;

export function ConvexClientProvider({
    children,
    initialToken,
}: PropsWithChildren<{ initialToken?: string | null }>) {
    return (
        <ConvexBetterAuthProvider
            client={convex}
            authClient={providerAuthClient}
            initialToken={initialToken}
        >
            {children}
        </ConvexBetterAuthProvider>
    );
}