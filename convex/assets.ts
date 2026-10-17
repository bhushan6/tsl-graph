import { v } from "convex/values";
import { mutation, query, internalMutation, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";
import { claimUpload, deleteOwnedFile, issueUploadUrl } from "./files";

// ========== Upload Helpers ==========

// Generate upload URL for client-side file upload
export const generateUploadUrl = mutation({
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }
        return await issueUploadUrl(ctx, user._id, "asset");
    },
});

// Register uploaded asset in the database
export const registerAsset = mutation({
    args: {
        storageId: v.id("_storage"),
        filename: v.string(),
        mimeType: v.string(),
        size: v.number(),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        // Proves the caller uploaded this file; another user's storage ID is rejected.
        const file = await claimUpload(ctx, { storageId: args.storageId, userId: user._id, purpose: "asset" });

        const now = Date.now();
        const assetId = await ctx.db.insert("assets", {
            userId: user._id,
            storageId: args.storageId,
            filename: args.filename.slice(0, 255),
            mimeType: file.contentType,
            size: file.size,
            createdAt: now,
            lastAccessedAt: now,
        });

        // Get the URL immediately so client doesn't need separate query
        const url = await ctx.storage.getUrl(args.storageId);

        return { assetId, url };
    },
});

// ========== Reference Management ==========

// Link an asset to a node
export const linkAssetToNode = mutation({
    args: {
        assetId: v.id("assets"),
        nodeId: v.string(),
        graphId: v.id("projects"),
        propertyName: v.string(),
    },
    handler: async (ctx, args) => {
        console.log("[linkAssetToNode] Called with:", args);

        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        // Verify user owns the project
        const project = await ctx.db.get(args.graphId);
        if (!project || project.userId !== user._id) {
            throw new Error("Not authorized");
        }

        // Verify user owns the asset
        const asset = await ctx.db.get(args.assetId);
        if (!asset || asset.userId !== user._id) {
            throw new Error("Asset not found or not authorized");
        }

        // Check if there's a deleted reference to restore (same asset being re-linked, e.g. undo)
        // Only clean up deleted refs that are for THIS SAME asset - preserve refs to other assets
        const deletedRefs = await ctx.db
            .query("deletedAssetReferences")
            .withIndex("by_node", (q) =>
                q.eq("graphId", args.graphId).eq("nodeId", args.nodeId)
            )
            .filter((q) =>
                q.and(
                    q.eq(q.field("propertyName"), args.propertyName),
                    q.eq(q.field("assetId"), args.assetId) // Only same asset!
                )
            )
            .collect();
        console.log("[linkAssetToNode] Found deletedRefs for SAME asset to clean:", deletedRefs.length);

        // Remove deleted references only for the same asset (undo/restore scenario)
        for (const ref of deletedRefs) {
            await ctx.db.delete(ref._id);
        }

        // Check if this exact reference already exists
        const existingRefs = await ctx.db
            .query("assetReferences")
            .withIndex("by_node", (q) =>
                q.eq("graphId", args.graphId).eq("nodeId", args.nodeId)
            )
            .filter((q) => q.eq(q.field("propertyName"), args.propertyName))
            .collect();
        console.log("[linkAssetToNode] Found existingRefs:", existingRefs.length);

        if (existingRefs.length > 0) {
            // Reference already exists, just update last accessed time on asset
            console.log("[linkAssetToNode] Reference exists, updating access time");
            await ctx.db.patch(args.assetId, {
                lastAccessedAt: Date.now(),
            });
            return existingRefs[0]._id;
        }

        // Create new reference
        console.log("[linkAssetToNode] Creating new reference");
        const referenceId = await ctx.db.insert("assetReferences", {
            assetId: args.assetId,
            nodeId: args.nodeId,
            graphId: args.graphId,
            propertyName: args.propertyName,
            createdAt: Date.now(),
        });
        console.log("[linkAssetToNode] Created reference:", referenceId);

        // Update asset last accessed time
        await ctx.db.patch(args.assetId, {
            lastAccessedAt: Date.now(),
        });

        return referenceId;
    },
});

// Unlink an asset from a node (soft delete for undo support)
export const unlinkAssetFromNode = mutation({
    args: {
        nodeId: v.string(),
        graphId: v.id("projects"),
        propertyName: v.string(),
    },
    handler: async (ctx, args) => {
        console.log("[unlinkAssetFromNode] Called with:", args);

        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        // Verify user owns the project
        const project = await ctx.db.get(args.graphId);
        if (!project || project.userId !== user._id) {
            throw new Error("Not authorized");
        }

        // Find the reference
        const refs = await ctx.db
            .query("assetReferences")
            .withIndex("by_node", (q) =>
                q.eq("graphId", args.graphId).eq("nodeId", args.nodeId)
            )
            .filter((q) => q.eq(q.field("propertyName"), args.propertyName))
            .collect();
        console.log("[unlinkAssetFromNode] Found refs to delete:", refs.length, refs);

        // Move to deleted references
        for (const ref of refs) {
            console.log("[unlinkAssetFromNode] Moving ref to deleted:", ref._id);
            await ctx.db.insert("deletedAssetReferences", {
                assetId: ref.assetId,
                nodeId: ref.nodeId,
                graphId: ref.graphId,
                propertyName: ref.propertyName,
                deletedAt: Date.now(),
            });
            await ctx.db.delete(ref._id);
        }

        console.log("[unlinkAssetFromNode] Deleted count:", refs.length);
        return { deleted: refs.length };
    },
});

// Handle full node deletion - unlink all assets
export const handleNodeDelete = mutation({
    args: {
        nodeId: v.string(),
        graphId: v.id("projects"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        // Verify user owns the project
        const project = await ctx.db.get(args.graphId);
        if (!project || project.userId !== user._id) {
            throw new Error("Not authorized");
        }

        // Find all references for this node
        const refs = await ctx.db
            .query("assetReferences")
            .withIndex("by_node", (q) =>
                q.eq("graphId", args.graphId).eq("nodeId", args.nodeId)
            )
            .collect();

        // Move all to deleted references
        for (const ref of refs) {
            await ctx.db.insert("deletedAssetReferences", {
                assetId: ref.assetId,
                nodeId: ref.nodeId,
                graphId: ref.graphId,
                propertyName: ref.propertyName,
                deletedAt: Date.now(),
            });
            await ctx.db.delete(ref._id);
        }

        return { deleted: refs.length };
    },
});

// ========== Queries ==========

/** Owners, plus anyone who can open a project that references the asset. */
async function canReadAsset(ctx: QueryCtx, asset: Doc<"assets">, userId: string | undefined) {
    if (userId !== undefined && asset.userId === userId) return true;
    const refs = await ctx.db
        .query("assetReferences")
        .withIndex("by_asset", (q) => q.eq("assetId", asset._id))
        .take(100);
    for (const ref of refs) {
        const project = await ctx.db.get(ref.graphId);
        if (project && (project.isPublic || project.userId === userId)) return true;
    }
    return false;
}

// Get asset URL for rendering
export const getAssetUrl = query({
    args: { assetId: v.id("assets") },
    handler: async (ctx, args) => {
        const asset = await ctx.db.get(args.assetId);
        if (!asset) {
            return null;
        }
        const user = await authComponent.safeGetAuthUser(ctx);
        if (!(await canReadAsset(ctx, asset, user?._id))) {
            return null;
        }

        const url = await ctx.storage.getUrl(asset.storageId);
        return {
            url,
            filename: asset.filename,
            mimeType: asset.mimeType,
            size: asset.size,
        };
    },
});

// Get all assets for a node
export const getNodeAssets = query({
    args: {
        nodeId: v.string(),
        graphId: v.id("projects"),
    },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args.graphId);
        const user = await authComponent.safeGetAuthUser(ctx);
        if (!project || (!project.isPublic && project.userId !== user?._id)) {
            return [];
        }

        const refs = await ctx.db
            .query("assetReferences")
            .withIndex("by_node", (q) =>
                q.eq("graphId", args.graphId).eq("nodeId", args.nodeId)
            )
            .collect();

        const assets = await Promise.all(
            refs.map(async (ref) => {
                const asset = await ctx.db.get(ref.assetId);
                if (!asset) return null;

                const url = await ctx.storage.getUrl(asset.storageId);
                return {
                    referenceId: ref._id,
                    assetId: ref.assetId,
                    propertyName: ref.propertyName,
                    url,
                    filename: asset.filename,
                    mimeType: asset.mimeType,
                    size: asset.size,
                };
            })
        );

        return assets.filter(Boolean);
    },
});

// Get asset stats for monitoring
export const getAssetStats = query({
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            return null;
        }

        const assets = await ctx.db
            .query("assets")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();

        const totalSize = assets.reduce((sum, a) => sum + a.size, 0);
        const count = assets.length;

        // Count pending deletions
        const deletedRefs = await ctx.db
            .query("deletedAssetReferences")
            .collect();

        // Filter to only count user's assets
        const userAssetIds = new Set(assets.map(a => a._id));
        const pendingDeletions = deletedRefs.filter(
            ref => userAssetIds.has(ref.assetId)
        ).length;

        return {
            assetCount: count,
            totalSizeBytes: totalSize,
            totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
            pendingDeletions,
        };
    },
});

// ========== Garbage Collection ==========

// Internal mutation for cron job - garbage collect old deleted references
export const garbageCollectAssets = internalMutation({
    handler: async (ctx) => {
        const gracePeriodMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        const cutoffTime = Date.now() - gracePeriodMs;

        // Find all expired deleted references
        const expiredRefs = await ctx.db
            .query("deletedAssetReferences")
            .withIndex("by_deleted_at", (q) => q.lt("deletedAt", cutoffTime))
            .collect();

        const expiredByAsset = new Map<Id<"assets">, Id<"deletedAssetReferences">[]>();
        for (const ref of expiredRefs) {
            expiredByAsset.set(ref.assetId, [...(expiredByAsset.get(ref.assetId) ?? []), ref._id]);
        }

        let deletedAssets = 0;
        let deletedReferences = 0;
        for (const [assetId, expiredIds] of expiredByAsset) {
            const expired = new Set(expiredIds);
            const activeRefs = await ctx.db
                .query("assetReferences")
                .withIndex("by_asset", (q) => q.eq("assetId", assetId))
                .first();
            const otherDeletedRefs = await ctx.db
                .query("deletedAssetReferences")
                .withIndex("by_asset", (q) => q.eq("assetId", assetId))
                .collect();
            const asset = await ctx.db.get(assetId);
            const unreferenced = !activeRefs && otherDeletedRefs.every((ref) => expired.has(ref._id));

            if (asset && unreferenced) {
                // Delete the file only when the asset's owner provably owns it and no
                // other asset row points at it. A legacy file without a binding is left,
                // with its expired references, until the binding backfill has run.
                const binding = await ctx.db
                    .query("storageBindings")
                    .withIndex("by_storage", (q) => q.eq("storageId", asset.storageId))
                    .first();
                if (!binding) continue;
                const sharedWith = await ctx.db
                    .query("assets")
                    .withIndex("by_storage", (q) => q.eq("storageId", asset.storageId))
                    .take(2);
                if (sharedWith.length === 1) {
                    await deleteOwnedFile(ctx, asset.storageId, asset.userId, "asset");
                }
                await ctx.db.delete(assetId);
                deletedAssets++;
            }

            for (const id of expiredIds) {
                await ctx.db.delete(id);
                deletedReferences++;
            }
        }

        return {
            expiredReferences: deletedReferences,
            deletedAssets,
        };
    },
});
