import posthog from "posthog-js";

// Analytics are optional: without a key, posthog.capture calls are silent no-ops.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (posthogKey) {
    posthog.init(posthogKey, {
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        // Include the defaults option as required by PostHog
        defaults: "2025-05-24" as any,
        capture_exceptions: true,
        debug: process.env.NODE_ENV === "development",
        // Direct initialization without cookie banner as requested by user
    });
}
