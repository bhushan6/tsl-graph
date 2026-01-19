import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

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
            throw new Error("Not authenticated");
        }

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
            throw new Error("Not authenticated");
        }

        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }
        if (project.userId !== user._id) {
            throw new Error("Not authorized");
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
            throw new Error("Not authenticated");
        }

        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }
        if (project.userId !== user._id) {
            throw new Error("Not authorized");
        }

        // Get the URL for the new thumbnail
        const url = await ctx.storage.getUrl(args.storageId);
        if (!url) {
            throw new Error("Failed to get thumbnail URL");
        }

        // Store old storage ID for deletion after update
        const oldStorageId = project.thumbnailStorageId;

        // Update project with new thumbnail
        await ctx.db.patch(args.id, {
            thumbnail: url,
            thumbnailStorageId: args.storageId,
            updatedAt: Date.now(),
        });

        // Delete old thumbnail from storage if it exists
        if (oldStorageId) {
            try {
                await ctx.storage.delete(oldStorageId);
                console.log("[updateThumbnail] Deleted old thumbnail:", oldStorageId);
            } catch (err) {
                console.error("[updateThumbnail] Failed to delete old thumbnail:", err);
            }
        }

        return { id: args.id, url };
    },
});

// Generate upload URL for thumbnail
export const generateThumbnailUploadUrl = mutation({
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }
        return await ctx.storage.generateUploadUrl();
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
            throw new Error("Not authenticated");
        }

        const project = await ctx.db.get(args.id);
        if (!project) {
            throw new Error("Project not found");
        }
        if (project.userId !== user._id) {
            throw new Error("Not authorized");
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

        const projects = await ctx.db
            .query("projects")
            .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
            .order("desc")
            .collect();

        return projects;
    },
});

// Get a single project
export const get = query({
    args: {
        id: v.id("projects"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        const project = await ctx.db.get(args.id);

        if (!project) {
            return null;
        }

        // Check access: owner or public project
        if (project.userId !== user?._id && !project.isPublic) {
            return null;
        }

        return project;
    },
});

// List public projects (for explore/gallery)
export const listPublic = query({
    args: {},
    handler: async (ctx) => {
        const projects = await ctx.db
            .query("projects")
            .withIndex("by_public", (q) => q.eq("isPublic", true))
            .order("desc")
            .take(50);

        return projects;
    },
});
