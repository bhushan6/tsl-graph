import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { authComponent } from "./auth";
import { createErrorData, ErrorCodes } from "./errors";
import { deleteUserFiles, transferFileOwnership } from "./files";

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
            const likes = await ctx.db
                .query("projectLikes")
                .withIndex("by_project", (q) => q.eq("projectId", project._id))
                .collect();

            for (const like of likes) {
                await ctx.db.delete(like._id);
            }

            await ctx.db.delete(project._id);
        }

        // Delete likes made by this user
        const userLikes = await ctx.db
            .query("projectLikes")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const like of userLikes) {
            await ctx.db.delete(like._id);
        }

        // 2. Delete Assets
        const assets = await ctx.db
            .query("assets")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const asset of assets) {
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
            await ctx.db.delete(f._id);
        }

        // 6. Delete files: thumbnails, asset files, feedback attachments and AI
        // captures. Only files bound to this user are deleted; storage IDs that
        // merely appear in this user's rows may belong to someone else.
        await deleteUserFiles(ctx, userId);

        return { success: true };
    },
});

export const transferGuestDataToUser = internalMutation({
    args: {
        guestUserId: v.string(),    // Better Auth user ID
        targetUserId: v.string(),   // Better Auth user ID
    },
    handler: async (ctx, args) => {
        const { guestUserId, targetUserId } = args;

        if (guestUserId === targetUserId) {
            throw new Error("Guest and target users must be different");
        }

        // These are Better Auth user IDs; app data stores the users' Convex document IDs.
        const [guestUser, targetUser] = await Promise.all([
            authComponent.getAnyUserById(ctx, guestUserId),
            authComponent.getAnyUserById(ctx, targetUserId),
        ]);

        if (!guestUser || guestUser.isAnonymous !== true) {
            throw new Error("Source user must be an existing anonymous user");
        }
        if (!targetUser || targetUser.isAnonymous === true) {
            throw new Error("Target user must be an existing non-anonymous user");
        }

        const guestConvexId = guestUser._id;
        const targetConvexId = targetUser._id;

        // A guest may have created multiple projects; transfer every one in this
        // mutation so a failure rolls the whole migration back atomically.
        const projects = await ctx.db
            .query("projects")
            .withIndex("by_user", (q) => q.eq("userId", guestConvexId))
            .collect();

        for (const project of projects) {
            await ctx.db.patch(project._id, { userId: targetConvexId });
        }

        const assets = await ctx.db
            .query("assets")
            .withIndex("by_user", (q) => q.eq("userId", guestConvexId))
            .collect();

        for (const asset of assets) {
            await ctx.db.patch(asset._id, { userId: targetConvexId });
        }

        const feedbacks = await ctx.db
            .query("feedbacks")
            .withIndex("by_user", (q) => q.eq("userId", guestConvexId))
            .collect();

        for (const feedback of feedbacks) {
            await ctx.db.patch(feedback._id, { userId: targetConvexId });
        }

        await transferFileOwnership(ctx, guestConvexId, targetConvexId);

        // References use project IDs, which remain stable because projects are patched in place.
        return { success: true };
    }
});
