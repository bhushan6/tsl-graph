import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createErrorData, ErrorCodes } from "./errors";
import { uploadPurpose } from "./schema";

// File ownership. Convex upload URLs return a storage ID to whoever uploads, and
// any caller can name any storage ID, so a storage ID never proves ownership.
// Instead the server records a binding (owner + purpose) when an upload is
// claimed, and only the bound owner may attach or delete that file.
//
// A claim cannot prove *which* grant holder uploaded a file, only that the file
// is fresh and unclaimed. Clients claim immediately after uploading, and until
// then the random storage ID is known only to the uploader's client. Files that
// predate the caller's grant (all legacy files) can never be claimed.

export type FilePurpose = Infer<typeof uploadPurpose>;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MB = 1024 * 1024;
/** Convex upload URLs expire after an hour; grants and claims match that. */
const GRANT_TTL_MS = HOUR;
/** Tolerance between mutation time and storage creation time. */
const CLOCK_SKEW_MS = 5 * 1000;
/** Unclaimed uploads older than this are abandoned (or rejected) and may be swept. */
const ORPHAN_GRACE_MS = 24 * HOUR;
const BACKFILL_KEY = "storage-bindings-backfill";

interface FilePolicy {
    maxBytes: number;
    contentTypes: RegExp;
    uploadsPerHour: number;
}

export const FILE_POLICIES: Record<FilePurpose, FilePolicy> = {
    asset: { maxBytes: 50 * MB, contentTypes: /^(image\/[\w.+-]+|application\/octet-stream)$/, uploadsPerHour: 100 },
    thumbnail: { maxBytes: 5 * MB, contentTypes: /^image\/(png|jpeg|webp)$/, uploadsPerHour: 120 },
};

/** Issue an upload URL backed by a one-use, rate-limited grant for `purpose`. */
export async function issueUploadUrl(ctx: MutationCtx, userId: string, purpose: FilePurpose) {
    const now = Date.now();
    const { uploadsPerHour } = FILE_POLICIES[purpose];
    const recent = await ctx.db
        .query("uploadGrants")
        .withIndex("by_user_purpose", (q) => q.eq("userId", userId).eq("purpose", purpose).gt("createdAt", now - HOUR))
        .take(uploadsPerHour);
    if (recent.length >= uploadsPerHour) {
        throw new ConvexError(createErrorData(ErrorCodes.LIMIT_EXCEEDED, "Too many uploads. Please try again later."));
    }
    await ctx.db.insert("uploadGrants", { userId, purpose, createdAt: now, expiresAt: now + GRANT_TTL_MS });
    return await ctx.storage.generateUploadUrl();
}

/**
 * Bind a just-uploaded file to its uploader. Requires an unconsumed grant of
 * this user and purpose that predates the file, so legacy or leaked storage
 * IDs (created before any grant the caller holds) cannot be adopted.
 */
export async function claimUpload(
    ctx: MutationCtx,
    { storageId, userId, purpose }: { storageId: Id<"_storage">; userId: string; purpose: FilePurpose },
) {
    const existing = await ctx.db
        .query("storageBindings")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .first();
    if (existing) {
        throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED, "This file is already registered."));
    }

    const file = await ctx.db.system.get("_storage", storageId);
    if (!file) {
        throw new ConvexError(createErrorData(ErrorCodes.NOT_FOUND, "Uploaded file not found."));
    }
    const now = Date.now();
    if (now - file._creationTime > GRANT_TTL_MS) {
        throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED, "Upload expired. Please upload the file again."));
    }

    const grants = await ctx.db
        .query("uploadGrants")
        .withIndex("by_user_purpose", (q) => q
            .eq("userId", userId)
            .eq("purpose", purpose)
            .lte("createdAt", file._creationTime + CLOCK_SKEW_MS))
        .order("desc")
        .take(25);
    const grant = grants.find((candidate) => candidate.consumedAt === undefined && candidate.expiresAt >= file._creationTime);
    if (!grant) {
        throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED, "Upload was not authorized."));
    }

    const policy = FILE_POLICIES[purpose];
    const contentType = file.contentType ?? "application/octet-stream";
    if (file.size > policy.maxBytes || !policy.contentTypes.test(contentType)) {
        // Left unbound; the orphan sweep removes it.
        throw new ConvexError(createErrorData(ErrorCodes.INVALID_INPUT, "Unsupported file type or size."));
    }

    await ctx.db.patch(grant._id, { consumedAt: now });
    await ctx.db.insert("storageBindings", { storageId, userId, purpose, createdAt: now });
    return { size: file.size, contentType };
}

/** The caller's binding for a file; disputed files belong to no one. */
export async function getOwnedBinding(
    ctx: QueryCtx | MutationCtx,
    storageId: Id<"_storage">,
    userId: string,
    purpose: FilePurpose,
) {
    const binding = await ctx.db
        .query("storageBindings")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .first();
    if (!binding || binding.disputed || binding.userId !== userId || binding.purpose !== purpose) return null;
    return binding;
}

/** Delete a file only when the caller's binding proves ownership. Returns whether it was deleted. */
export async function deleteOwnedFile(
    ctx: MutationCtx,
    storageId: Id<"_storage">,
    userId: string,
    purpose: FilePurpose,
) {
    const binding = await getOwnedBinding(ctx, storageId, userId, purpose);
    if (!binding) {
        console.warn("[files] Refusing to delete a file without an owner binding", { storageId, purpose });
        return false;
    }
    await ctx.db.delete(binding._id);
    try {
        await ctx.storage.delete(storageId);
    } catch (error) {
        console.error("[files] Failed to delete file", storageId, error);
    }
    return true;
}

/** Guest → account linking: move file ownership and revoke the guest's outstanding upload grants. */
export async function transferFileOwnership(ctx: MutationCtx, fromUserId: string, toUserId: string) {
    const bindings = await ctx.db
        .query("storageBindings")
        .withIndex("by_user", (q) => q.eq("userId", fromUserId))
        .collect();
    for (const binding of bindings) {
        await ctx.db.patch(binding._id, { userId: toUserId });
    }
    await deleteUploadGrants(ctx, fromUserId);
}

/** Account deletion: delete every file the user owns (disputed files are kept) and their grants. */
export async function deleteUserFiles(ctx: MutationCtx, userId: string) {
    const bindings = await ctx.db
        .query("storageBindings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    for (const binding of bindings) {
        if (binding.disputed) continue;
        await ctx.db.delete(binding._id);
        try {
            await ctx.storage.delete(binding.storageId);
        } catch (error) {
            console.error("[files] Failed to delete file", binding.storageId, error);
        }
    }
    await deleteUploadGrants(ctx, userId);
}

async function deleteUploadGrants(ctx: MutationCtx, userId: string) {
    const grants = await ctx.db
        .query("uploadGrants")
        .withIndex("by_user_purpose", (q) => q.eq("userId", userId))
        .collect();
    for (const grant of grants) {
        await ctx.db.delete(grant._id);
    }
}

// ========== Legacy backfill ==========

/** Record ownership of a pre-binding file; a second claimant makes it disputed (never deletable). */
async function bindLegacyFile(ctx: MutationCtx, storageId: Id<"_storage">, userId: string, purpose: FilePurpose) {
    const existing = await ctx.db
        .query("storageBindings")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .first();
    if (existing) {
        if (existing.userId !== userId && !existing.disputed) {
            await ctx.db.patch(existing._id, { disputed: true });
        }
        return;
    }
    if (!(await ctx.db.system.get("_storage", storageId))) return;
    await ctx.db.insert("storageBindings", { storageId, userId, purpose, createdAt: Date.now() });
}

const backfillTable = v.union(v.literal("assets"), v.literal("projects"));
const BACKFILL_ORDER = ["assets", "projects"] as const;
const BACKFILL_PAGE_SIZE = 100;

/**
 * One-off: bind files referenced by existing assets and project thumbnails.
 * Run once after deploying with `npx convex run files:backfillStorageBindings`;
 * it reschedules itself page by page, then enables the orphan sweep for files
 * created from that point on.
 */
export const backfillStorageBindings = internalMutation({
    args: {
        table: v.optional(backfillTable),
        cursor: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const table = args.table ?? "assets";
        const paginationOpts = { cursor: args.cursor ?? null, numItems: BACKFILL_PAGE_SIZE };
        let isDone: boolean;
        let continueCursor: string;

        if (table === "assets") {
            const page = await ctx.db.query("assets").paginate(paginationOpts);
            for (const asset of page.page) await bindLegacyFile(ctx, asset.storageId, asset.userId, "asset");
            ({ isDone, continueCursor } = page);
        } else {
            const page = await ctx.db.query("projects").paginate(paginationOpts);
            for (const project of page.page) {
                if (project.thumbnailStorageId) await bindLegacyFile(ctx, project.thumbnailStorageId, project.userId, "thumbnail");
            }
            ({ isDone, continueCursor } = page);
        }

        if (!isDone) {
            await ctx.scheduler.runAfter(0, internal.files.backfillStorageBindings, { table, cursor: continueCursor });
            return { table, done: false };
        }
        const next = BACKFILL_ORDER[BACKFILL_ORDER.indexOf(table) + 1];
        if (next) {
            await ctx.scheduler.runAfter(0, internal.files.backfillStorageBindings, { table: next, cursor: null });
            return { table, done: false };
        }

        const state = await ctx.db
            .query("storageMaintenance")
            .withIndex("by_key", (q) => q.eq("key", BACKFILL_KEY))
            .unique();
        if (!state) {
            await ctx.db.insert("storageMaintenance", { key: BACKFILL_KEY, orphanSweepSince: Date.now() });
        } else if (state.orphanSweepSince === undefined) {
            await ctx.db.patch(state._id, { orphanSweepSince: Date.now() });
        }
        return { table, done: true };
    },
});

// ========== Maintenance (cron) ==========

const SWEEP_BATCH = 200;

/**
 * Hourly: drop expired upload grants, and delete uploads that were never
 * claimed (abandoned, rejected or abusive). Only files created after the
 * legacy backfill finished are swept; until then nothing is deleted.
 */
export const runStorageMaintenance = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const expired = await ctx.db
            .query("uploadGrants")
            .withIndex("by_expires", (q) => q.lt("expiresAt", now))
            .take(500);
        for (const grant of expired) await ctx.db.delete(grant._id);

        const state = await ctx.db
            .query("storageMaintenance")
            .withIndex("by_key", (q) => q.eq("key", BACKFILL_KEY))
            .unique();
        if (!state || state.orphanSweepSince === undefined) {
            return { expiredGrants: expired.length, sweptFiles: 0 };
        }

        const after = Math.max(state.orphanSweepSince, state.orphanSweptUntil ?? 0);
        const files = await ctx.db.system
            .query("_storage")
            .withIndex("by_creation_time", (q) => q.gt("_creationTime", after).lt("_creationTime", now - ORPHAN_GRACE_MS))
            .take(SWEEP_BATCH);
        let sweptFiles = 0;
        for (const file of files) {
            const binding = await ctx.db
                .query("storageBindings")
                .withIndex("by_storage", (q) => q.eq("storageId", file._id))
                .first();
            if (binding) continue;
            await ctx.storage.delete(file._id);
            sweptFiles += 1;
        }
        if (files.length > 0) {
            await ctx.db.patch(state._id, { orphanSweptUntil: files[files.length - 1]._creationTime });
        }
        if (files.length === SWEEP_BATCH || expired.length === 500) {
            await ctx.scheduler.runAfter(0, internal.files.runStorageMaintenance, {});
        }
        return { expiredGrants: expired.length, sweptFiles };
    },
});
