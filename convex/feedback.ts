import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createErrorData, ErrorCodes } from "./errors";

export const generateUploadUrl = mutation(async (ctx) => {
    return await ctx.storage.generateUploadUrl();
});

export const submitFeedback = mutation({
    args: {
        title: v.string(),
        description: v.string(),
        type: v.string(),
        attachment: v.optional(v.id("_storage")),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const userId = identity.subject;

        await ctx.db.insert("feedbacks", {
            userId,
            userName: identity.name,
            userEmail: identity.email,
            title: args.title,
            description: args.description,
            type: args.type,
            status: "new",
            createdAt: Date.now(),
            attachment: args.attachment,
        });
    },
});

export const getFeedbacks = query({
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const adminEmail = "bhushanwagh6@gmail.com";
        if (!adminEmail || identity.email !== adminEmail) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED));
        }

        const feedbacks = await ctx.db.query("feedbacks").order("desc").collect();
        return Promise.all(
            feedbacks.map(async (f) => ({
                ...f,
                attachmentUrl: f.attachment ? await ctx.storage.getUrl(f.attachment) : null,
            }))
        );
    },
});


