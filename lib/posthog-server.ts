import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient() {
    if (!posthogClient) {
        posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
            host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
            // flushAt: 1 ensures events are sent immediately in serverless environments
            flushAt: 1,
            flushInterval: 0,
        });

        if (process.env.NODE_ENV === "development") {
            posthogClient.debug(true);
        }
    }
    return posthogClient;
}

export async function shutdownPostHog() {
    if (posthogClient) {
        await posthogClient.shutdown();
    }
}
