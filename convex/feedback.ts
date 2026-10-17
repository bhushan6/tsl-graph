import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createErrorData, ErrorCodes } from "./errors";
import { claimUpload, issueUploadUrl } from "./files";

const MAX_ATTACHMENTS = 10;

export const generateUploadUrl = mutation(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
        throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
    }
    return await issueUploadUrl(ctx, identity.subject, "feedback");
});

export const submitFeedback = mutation({
    args: {
        title: v.string(),
        description: v.string(),
        type: v.string(),
        attachments: v.optional(v.array(v.id("_storage"))),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const userId = identity.subject;

        const attachments = args.attachments ?? [];
        if (attachments.length > MAX_ATTACHMENTS) {
            throw new ConvexError(createErrorData(ErrorCodes.LIMIT_EXCEEDED, `At most ${MAX_ATTACHMENTS} attachments are allowed.`));
        }
        // Each attachment must be the caller's own fresh upload, never someone else's file.
        for (const storageId of attachments) {
            await claimUpload(ctx, { storageId, userId, purpose: "feedback" });
        }

        await ctx.db.insert("feedbacks", {
            userId,
            userName: identity.name,
            userEmail: identity.email,
            title: args.title,
            description: args.description,
            type: args.type,
            status: "new",
            createdAt: Date.now(),
            attachments: args.attachments,
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
            feedbacks.map(async (f) => {
                let attachmentUrl = null;
                const attachmentUrls: string[] = [];

                if (f.attachment) {
                    attachmentUrl = await ctx.storage.getUrl(f.attachment);
                }

                if (f.attachments && f.attachments.length > 0) {
                    for (const storageId of f.attachments) {
                        const url = await ctx.storage.getUrl(storageId);
                        if (url) attachmentUrls.push(url);
                    }
                }

                return {
                    ...f,
                    attachmentUrl,
                    attachmentUrls,
                }
            })
        );
    },
});


