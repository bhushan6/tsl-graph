import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { authComponent } from "./auth";
import { createErrorData, ErrorCodes } from "./errors";
import { claimUpload, deleteOwnedFile, issueUploadUrl } from "./files";

export const generatePreviewUploadUrl = mutation({
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }
        return await issueUploadUrl(ctx, user._id, "ai-preview");
    },
});

/** Bind an uploaded preview capture to the caller and return a URL the AI provider can fetch. */
export const registerPreviewImage = mutation({
    args: {
        storageId: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }
        await claimUpload(ctx, { storageId: args.storageId, userId: user._id, purpose: "ai-preview" });
        const url = await ctx.storage.getUrl(args.storageId);
        if (!url) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_FOUND, "Failed to resolve preview URL"));
        }
        return { url };
    },
});

export const deletePreviewImage = mutation({
    args: {
        storageId: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }
        // Only the caller's own preview captures can be deleted.
        const deleted = await deleteOwnedFile(ctx, args.storageId, user._id, "ai-preview");
        return { success: deleted };
    },
});
