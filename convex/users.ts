import { ConvexError } from "convex/values";
import { mutation } from "./_generated/server";
import { authComponent } from "./auth";
import { createErrorData, ErrorCodes } from "./errors";

export const deleteSelf = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const userId = user._id;

        // 1. Delete Projects
        const projects = await ctx.db
            .query("projects")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const project of projects) {
            // Check for project assets/thumbnails if needed, but schema seems to handle storage cleanups via cron or manual triggers usually
            // However, we should try to clean up storage if we have the reference
            if (project.thumbnailStorageId) {
                try {
                    await ctx.storage.delete(project.thumbnailStorageId);
                } catch (e) {
                    console.error("Failed to delete thumbnail for project", project._id, e);
                }
            }
            await ctx.db.delete(project._id);
        }

        // 2. Delete Assets
        const assets = await ctx.db
            .query("assets")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const asset of assets) {
            try {
                await ctx.storage.delete(asset.storageId);
            } catch (e) {
                console.error("Failed to delete asset file", asset._id, e);
            }
            await ctx.db.delete(asset._id);
        }

        // 3. Delete Subgraph Templates
        const subgraphs = await ctx.db
            .query("subgraphTemplates")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();
        for (const s of subgraphs) await ctx.db.delete(s._id);

        // 4. Delete Code Node Templates
        const codeNodes = await ctx.db
            .query("codeNodeTemplates")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();
        for (const c of codeNodes) await ctx.db.delete(c._id);

        // 5. Delete Feedbacks
        const feedbacks = await ctx.db
            .query("feedbacks")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();
        for (const f of feedbacks) {
            if (f.attachments) {
                for (const attachmentId of f.attachments) {
                    try {
                        await ctx.storage.delete(attachmentId);
                    } catch (e) {
                        console.error("Failed to delete feedback attachment", attachmentId, e);
                    }
                }
            }
            // Handle legacy single attachment
            if (f.attachment) {
                try {
                    await ctx.storage.delete(f.attachment);
                } catch (e) {
                    console.error("Failed to delete feedback attachment", f.attachment, e);
                }
            }

            await ctx.db.delete(f._id);
        }

        return { success: true };
    },
});
