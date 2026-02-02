import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // Include the defaults option as required by PostHog
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaults: "2025-05-24" as any,
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    // Direct initialization without cookie banner as requested by user
});
