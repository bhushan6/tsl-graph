import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run garbage collection daily at 3 AM UTC
// This cleans up:
// 1. Deleted asset references older than 7 days
// 2. Orphaned assets with no remaining references
crons.daily(
    "garbage-collect-assets",
    { hourUTC: 3, minuteUTC: 0 },
    internal.assets.garbageCollectAssets
);

// Expire upload grants and delete uploads that were never claimed.
crons.hourly(
    "storage-maintenance",
    { minuteUTC: 15 },
    internal.files.runStorageMaintenance
);

export default crons;
