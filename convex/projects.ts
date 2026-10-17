import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { createErrorData, ErrorCodes } from "./errors";
import { claimUpload, deleteOwnedFile, issueUploadUrl } from "./files";

// Public standalone embeds intentionally use this narrow projection rather than
// `get`, which also consults auth and returns owner/private project details.
export const selectPublicStandaloneProject = (
    project: { graphData: unknown; name: string; isPublic: boolean } | null | undefined,
) => {
    if (!project || !project.isPublic) return null;
    return { graphData: project.graphData, name: project.name };
};

export const selectProjectSummary = (project: {
    _id: Id<"projects">;
    name: string;
    thumbnail?: string;
    updatedAt: number;
    isPublic: boolean;
    likeCount?: number;
}) => ({
    _id: project._id,
    name: project.name,
    thumbnail: project.thumbnail,
    updatedAt: project.updatedAt,
    isPublic: project.isPublic,
    likeCount: project.likeCount ?? 0,
});

// Guests get one project; account migration and the UI both rely on that.
async function assertCanCreateProject(ctx: MutationCtx, user: { _id: string; isAnonymous?: boolean | null }) {
    if (!user.isAnonymous) return;
    const existing = await ctx.db
        .query("projects")
        .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
        .first();
    if (existing) {
        throw new ConvexError(createErrorData(
            ErrorCodes.LIMIT_EXCEEDED,
            "Anonymous users are limited to 1 project. Please sign up to create more."
        ));
    }
}

// Create a new project
export const create = mutation({
    args: {
        name: v.optional(v.string()), // Made optional
        description: v.optional(v.string()),
        isPublic: v.optional(v.boolean()),
        graphData: v.any(),
    },
    handler: async (ctx, args) => {

        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        await assertCanCreateProject(ctx, user);

        const now = Date.now();
        let finalName = args.name?.trim() || "Untitled";

        // Fetch all user projects to check for name collisions
        // Note: For a very large number of projects, a more specific index/query might be better,
        // but for now, fetching all is reasonable for checking uniqueness locally.
        const userProjects = await ctx.db
            .query("projects")
            .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
            .collect();

        const existingNames = new Set(userProjects.map(p => p.name));

        if (existingNames.has(finalName)) {
            let counter = 1;
            while (existingNames.has(`${finalName} ${counter}`)) {
                counter++;
            }
            finalName = `${finalName} ${counter}`;
        }

        const projectId = await ctx.db.insert("projects", {
            userId: user._id,
            name: finalName,
            description: args.description,
            isPublic: args.isPublic ?? false,
            graphData: args.graphData,
            likeCount: 0,
            createdAt: now,
            updatedAt: now,
        });

        return projectId;
    },
});

// Update an existing project
export const update = mutation({
    args: {
        id: v.id("projects"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        isPublic: v.optional(v.boolean()),
        graphData: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_FOUND));
        }
        if (project.userId !== user._id) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED));
        }

        const updates: Record<string, unknown> = {
            updatedAt: Date.now(),
        };

        if (args.name !== undefined) updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.isPublic !== undefined) updates.isPublic = args.isPublic;
        if (args.graphData !== undefined) updates.graphData = args.graphData;

        await ctx.db.patch(args.id, updates);
        return args.id;
    },
});

// Update project thumbnail with Convex storage
// Flow: Upload blob to storage → call this mutation → old thumbnail deleted
export const updateThumbnail = mutation({
    args: {
        id: v.id("projects"),
        storageId: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_FOUND));
        }
        if (project.userId !== user._id) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED));
        }

        // Store old storage ID for deletion after update
        const oldStorageId = project.thumbnailStorageId;
        if (oldStorageId === args.storageId) {
            return { id: args.id, url: project.thumbnail ?? null };
        }

        // Proves the caller uploaded this file; another user's storage ID is rejected.
        await claimUpload(ctx, { storageId: args.storageId, userId: user._id, purpose: "thumbnail" });

        // Get the URL for the new thumbnail
        const url = await ctx.storage.getUrl(args.storageId);
        if (!url) {
            throw new Error("Failed to get thumbnail URL");
        }

        // Update project with new thumbnail
        await ctx.db.patch(args.id, {
            thumbnail: url,
            thumbnailStorageId: args.storageId,
            updatedAt: Date.now(),
        });

        // Delete the old thumbnail only if the caller provably owns that file
        if (oldStorageId) {
            await deleteOwnedFile(ctx, oldStorageId, user._id, "thumbnail");
        }

        return { id: args.id, url };
    },
});

// Generate upload URL for thumbnail
export const generateThumbnailUploadUrl = mutation({
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }
        return await issueUploadUrl(ctx, user._id, "thumbnail");
    },
});

// Delete a project
export const remove = mutation({
    args: {
        id: v.id("projects"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_FOUND));
        }
        if (project.userId !== user._id) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED));
        }

        const likes = await ctx.db
            .query("projectLikes")
            .withIndex("by_project", (q) => q.eq("projectId", args.id))
            .collect();

        for (const like of likes) {
            await ctx.db.delete(like._id);
        }

        if (project.thumbnailStorageId) {
            await deleteOwnedFile(ctx, project.thumbnailStorageId, user._id, "thumbnail");
        }

        await ctx.db.delete(args.id);
        return { success: true };
    },
});

// List user's projects
export const list = query({
    args: {},
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            return [];
        }

        const likes = await ctx.db
            .query("projectLikes")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();

        const likedProjectIds = new Set(likes.map((like) => like.projectId));

        const projects = await ctx.db
            .query("projects")
            .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
            .order("desc")
            .collect();

        return projects.map((project) => ({
            ...selectProjectSummary(project),
            likedByMe: likedProjectIds.has(project._id),
            isOwner: true,
        }));
    },
});

// Get a single project
export const get = query({
    args: {
        id: v.id("projects"),
    },
    handler: async (ctx, args) => {
        // Try to get user, but don't throw if unauthenticated
        // This allows public projects to be accessed without auth
        const user = await authComponent.getAuthUser(ctx);

        const project = await ctx.db.get(args.id);

        if (!project) {
            return null;
        }

        // Check access: owner or public project
        if (project.userId !== user?._id && !project.isPublic) {
            return null;
        }

        let likedByMe = false;
        if (user) {
            const existingLike = await ctx.db
                .query("projectLikes")
                .withIndex("by_user_project", (q) =>
                    q.eq("userId", user._id).eq("projectId", args.id)
                )
                .unique();
            likedByMe = !!existingLike;
        }

        return {
            ...project,
            likeCount: project.likeCount ?? 0,
            likedByMe,
        };
    },
});

// Auth-free bootstrap for the standalone editor. The id is deliberately a
// string so malformed/public URLs return null instead of throwing Convex's
// validator error. Private projects remain unavailable, including to owners.
export const getPublicStandalone = query({
    args: {
        id: v.string(),
    },
    handler: async (ctx, args) => {
        const projectId = ctx.db.normalizeId("projects", args.id);
        if (!projectId) return null;

        return selectPublicStandaloneProject(await ctx.db.get(projectId));
    },
});

const PUBLIC_GALLERY_FETCH_LIMIT = 300;
const PUBLIC_GALLERY_RETURN_LIMIT = 100;

// List public projects (for explore/gallery)
export const listPublic = query({
    args: {},
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);

        const authorCache = new Map<string, string>();
        const getAuthorName = async (userId: string) => {
            const cached = authorCache.get(userId);
            if (cached) return cached;
            const author = await authComponent.getAnyUserById(ctx, userId);
            const name =
                author?.displayUsername ||
                author?.name ||
                author?.username ||
                author?.email ||
                "Unknown";
            authorCache.set(userId, name);
            return name;
        };

        const likes = user
            ? await ctx.db
                .query("projectLikes")
                .withIndex("by_user", (q) => q.eq("userId", user._id))
                .collect()
            : [];

        const likedProjectIds = new Set(likes.map((like) => like.projectId));

        const projects = await ctx.db
            .query("projects")
            .withIndex("by_public", (q) => q.eq("isPublic", true))
            .order("desc")
            .take(PUBLIC_GALLERY_FETCH_LIMIT);

        const filteredProjects = user
            ? projects.filter((project) => project.userId !== user._id)
            : projects;

        const ranked = filteredProjects
            .map((project) => ({
                project,
                likeCount: project.likeCount ?? 0,
            }))
            .sort((a, b) => {
                if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
                return b.project.createdAt - a.project.createdAt;
            })
            .slice(0, PUBLIC_GALLERY_RETURN_LIMIT);

        return Promise.all(
            ranked.map(async ({ project }) => ({
                ...selectProjectSummary(project),
                likedByMe: likedProjectIds.has(project._id),
                isOwner: user ? project.userId === user._id : false,
                authorName: await getAuthorName(project.userId),
            }))
        );
    },
});

export const listFavorites = query({
    args: {},
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            return [];
        }

        const authorCache = new Map<string, string>();
        const getAuthorName = async (userId: string) => {
            const cached = authorCache.get(userId);
            if (cached) return cached;
            const author = await authComponent.getAnyUserById(ctx, userId);
            const name =
                author?.displayUsername ||
                author?.name ||
                author?.username ||
                author?.email ||
                "Unknown";
            authorCache.set(userId, name);
            return name;
        };

        const likes = await ctx.db
            .query("projectLikes")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();

        const likedProjects = await Promise.all(
            likes.map(async (like) => {
                const project = await ctx.db.get(like.projectId);
                if (!project) return null;
                if (project.userId !== user._id && !project.isPublic) return null;

                return {
                    ...selectProjectSummary(project),
                    likedByMe: true,
                    isOwner: project.userId === user._id,
                    likedAt: like.createdAt,
                    authorName: await getAuthorName(project.userId),
                };
            })
        );

        return likedProjects
            .filter((project): project is NonNullable<typeof project> => project !== null)
            .sort((a, b) => b.likedAt - a.likedAt);
    },
});

export const setLike = mutation({
    args: {
        projectId: v.id("projects"),
        like: v.boolean(),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const project = await ctx.db.get(args.projectId);
        if (!project) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_FOUND));
        }

        if (project.userId !== user._id && !project.isPublic) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHORIZED));
        }

        const existingLike = await ctx.db
            .query("projectLikes")
            .withIndex("by_user_project", (q) =>
                q.eq("userId", user._id).eq("projectId", args.projectId)
            )
            .unique();

        if (args.like) {
            if (!existingLike) {
                await ctx.db.insert("projectLikes", {
                    userId: user._id,
                    projectId: args.projectId,
                    createdAt: Date.now(),
                });

                await ctx.db.patch(args.projectId, {
                    likeCount: (project.likeCount ?? 0) + 1,
                });
            }

            return { liked: true, likeCount: (project.likeCount ?? 0) + (existingLike ? 0 : 1) };
        }

        if (existingLike) {
            await ctx.db.delete(existingLike._id);
            const nextCount = Math.max((project.likeCount ?? 0) - 1, 0);

            await ctx.db.patch(args.projectId, {
                likeCount: nextCount,
            });

            return { liked: false, likeCount: nextCount };
        }

        return { liked: false, likeCount: project.likeCount ?? 0 };
    },
});

// Clone a public project (creates a new project with copied data)
export const clone = mutation({
    args: {
        sourceId: v.id("projects"),
        name: v.string(),
        graphData: v.any(),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_AUTHENTICATED));
        }

        const sourceProject = await ctx.db.get(args.sourceId);
        if (!sourceProject || !sourceProject.isPublic) {
            throw new ConvexError(createErrorData(ErrorCodes.NOT_FOUND));
        }

        await assertCanCreateProject(ctx, user);

        const now = Date.now();
        const projectId = await ctx.db.insert("projects", {
            userId: user._id,
            name: args.name,
            description: sourceProject.description,
            isPublic: false,
            graphData: args.graphData,
            likeCount: 0,
            createdAt: now,
            updatedAt: now,
        });

        return projectId;
    },
});
