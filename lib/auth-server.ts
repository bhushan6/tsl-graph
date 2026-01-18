import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
console.log({ NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL });

export const {
    handler,
    preloadAuthQuery,
    isAuthenticated,
    getToken,
    fetchAuthQuery,
    fetchAuthMutation,
    fetchAuthAction,
} = convexBetterAuthNextJs({
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
    convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});