import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { authComponent } from "./auth";
import { Id } from "./_generated/dataModel";

// ========== Upload Helpers ==========

// Generate upload URL for client-side file upload
export const generateUploadUrl = mutation({
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }
        return await ctx.storage.generateUploadUrl();
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

        const now = Date.now();
        const assetId = await ctx.db.insert("assets", {
            userId: user._id,
            storageId: args.storageId,
            filename: args.filename,
            mimeType: args.mimeType,
            size: args.size,
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

        if (existingRefs.length > 0) {
            // Reference already exists, just update last accessed time on asset
            await ctx.db.patch(args.assetId, {
                lastAccessedAt: Date.now(),
            });
            return existingRefs[0]._id;
        }

        // Create new reference
        const referenceId = await ctx.db.insert("assetReferences", {
            assetId: args.assetId,
            nodeId: args.nodeId,
            graphId: args.graphId,
            propertyName: args.propertyName,
            createdAt: Date.now(),
        });

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

        // Move to deleted references
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

// Get asset URL for rendering
export const getAssetUrl = query({
    args: { assetId: v.id("assets") },
    handler: async (ctx, args) => {
        const asset = await ctx.db.get(args.assetId);
        if (!asset) {
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

        // Collect unique asset IDs from expired refs
        const assetIdsToCheck = new Set<Id<"assets">>();

        // Delete expired references
        for (const ref of expiredRefs) {
            assetIdsToCheck.add(ref.assetId);
            await ctx.db.delete(ref._id);
        }

        // Check each asset for remaining references
        let deletedAssets = 0;
        for (const assetId of assetIdsToCheck) {
            // Check for active references
            const activeRefs = await ctx.db
                .query("assetReferences")
                .withIndex("by_asset", (q) => q.eq("assetId", assetId))
                .first();

            if (activeRefs) {
                // Asset still has active references, don't delete
                continue;
            }

            // Check for other deleted references (still in grace period)
            const otherDeletedRefs = await ctx.db
                .query("deletedAssetReferences")
                .withIndex("by_asset", (q) => q.eq("assetId", assetId))
                .first();

            if (otherDeletedRefs) {
                // Asset has other deleted references still in grace period
                continue;
            }

            // No references remain - delete the asset
            const asset = await ctx.db.get(assetId);
            if (asset) {
                await ctx.storage.delete(asset.storageId);
                await ctx.db.delete(assetId);
                deletedAssets++;
            }
        }

        return {
            expiredReferences: expiredRefs.length,
            deletedAssets,
        };
    },
});
