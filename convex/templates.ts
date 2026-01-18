import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

// ============================================
// SUBGRAPH TEMPLATES
// ============================================

// Create a new subgraph template
export const createSubgraphTemplate = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string()),
        isPublic: v.optional(v.boolean()),
        data: v.any(),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        const now = Date.now();
        const templateId = await ctx.db.insert("subgraphTemplates", {
            userId: user._id,
            name: args.name,
            description: args.description,
            isPublic: args.isPublic ?? false,
            version: 1,
            data: args.data,
            createdAt: now,
            updatedAt: now,
        });

        return { templateId, version: 1 };
    },
});

// Update an existing subgraph template (increments version)
export const updateSubgraphTemplate = mutation({
    args: {
        id: v.id("subgraphTemplates"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        isPublic: v.optional(v.boolean()),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        const template = await ctx.db.get(args.id);
        if (!template) {
            throw new Error("Template not found");
        }
        if (template.userId !== user._id) {
            throw new Error("Not authorized");
        }

        const updates: Record<string, unknown> = {
            updatedAt: Date.now(),
            version: template.version + 1,
        };

        if (args.name !== undefined) updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.isPublic !== undefined) updates.isPublic = args.isPublic;
        if (args.data !== undefined) updates.data = args.data;

        await ctx.db.patch(args.id, updates);
        return { templateId: args.id, version: template.version + 1 };
    },
});

// Delete a subgraph template
export const deleteSubgraphTemplate = mutation({
    args: {
        id: v.id("subgraphTemplates"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        const template = await ctx.db.get(args.id);
        if (!template) {
            throw new Error("Template not found");
        }
        if (template.userId !== user._id) {
            throw new Error("Not authorized");
        }

        await ctx.db.delete(args.id);
        return { success: true };
    },
});

// List user's subgraph templates
export const listSubgraphTemplates = query({
    args: {},
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            return [];
        }

        const templates = await ctx.db
            .query("subgraphTemplates")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();

        return templates;
    },
});

// List public subgraph templates
export const listPublicSubgraphTemplates = query({
    args: {},
    handler: async (ctx) => {
        const templates = await ctx.db
            .query("subgraphTemplates")
            .withIndex("by_public", (q) => q.eq("isPublic", true))
            .take(50);

        return templates;
    },
});

// Get a single subgraph template
export const getSubgraphTemplate = query({
    args: {
        id: v.id("subgraphTemplates"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        const template = await ctx.db.get(args.id);

        if (!template) {
            return null;
        }

        // Check access: owner or public template
        if (template.userId !== user?._id && !template.isPublic) {
            return null;
        }

        return template;
    },
});

// Get multiple templates by IDs (for staleness check)
export const getSubgraphTemplateVersions = query({
    args: {
        ids: v.array(v.id("subgraphTemplates")),
    },
    handler: async (ctx, args) => {
        const results: Record<string, { version: number; updatedAt: number } | null> = {};

        for (const id of args.ids) {
            const template = await ctx.db.get(id);
            if (template) {
                results[id] = {
                    version: template.version,
                    updatedAt: template.updatedAt,
                };
            } else {
                results[id] = null;
            }
        }

        return results;
    },
});

// ============================================
// CODE NODE TEMPLATES
// ============================================

// Create a new code node template
export const createCodeNodeTemplate = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string()),
        isPublic: v.optional(v.boolean()),
        data: v.any(),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        const now = Date.now();
        const templateId = await ctx.db.insert("codeNodeTemplates", {
            userId: user._id,
            name: args.name,
            description: args.description,
            isPublic: args.isPublic ?? false,
            version: 1,
            data: args.data,
            createdAt: now,
            updatedAt: now,
        });

        return { templateId, version: 1 };
    },
});

// Update an existing code node template (increments version)
export const updateCodeNodeTemplate = mutation({
    args: {
        id: v.id("codeNodeTemplates"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        isPublic: v.optional(v.boolean()),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        const template = await ctx.db.get(args.id);
        if (!template) {
            throw new Error("Template not found");
        }
        if (template.userId !== user._id) {
            throw new Error("Not authorized");
        }

        const updates: Record<string, unknown> = {
            updatedAt: Date.now(),
            version: template.version + 1,
        };

        if (args.name !== undefined) updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.isPublic !== undefined) updates.isPublic = args.isPublic;
        if (args.data !== undefined) updates.data = args.data;

        await ctx.db.patch(args.id, updates);
        return { templateId: args.id, version: template.version + 1 };
    },
});

// Delete a code node template
export const deleteCodeNodeTemplate = mutation({
    args: {
        id: v.id("codeNodeTemplates"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            throw new Error("Not authenticated");
        }

        const template = await ctx.db.get(args.id);
        if (!template) {
            throw new Error("Template not found");
        }
        if (template.userId !== user._id) {
            throw new Error("Not authorized");
        }

        await ctx.db.delete(args.id);
        return { success: true };
    },
});

// List user's code node templates
export const listCodeNodeTemplates = query({
    args: {},
    handler: async (ctx) => {
        const user = await authComponent.getAuthUser(ctx);
        if (!user) {
            return [];
        }

        const templates = await ctx.db
            .query("codeNodeTemplates")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();

        return templates;
    },
});

// List public code node templates
export const listPublicCodeNodeTemplates = query({
    args: {},
    handler: async (ctx) => {
        const templates = await ctx.db
            .query("codeNodeTemplates")
            .withIndex("by_public", (q) => q.eq("isPublic", true))
            .take(50);

        return templates;
    },
});

// Get a single code node template
export const getCodeNodeTemplate = query({
    args: {
        id: v.id("codeNodeTemplates"),
    },
    handler: async (ctx, args) => {
        const user = await authComponent.getAuthUser(ctx);
        const template = await ctx.db.get(args.id);

        if (!template) {
            return null;
        }

        // Check access: owner or public template
        if (template.userId !== user?._id && !template.isPublic) {
            return null;
        }

        return template;
    },
});

// Get multiple code node templates by IDs (for staleness check)
export const getCodeNodeTemplateVersions = query({
    args: {
        ids: v.array(v.id("codeNodeTemplates")),
    },
    handler: async (ctx, args) => {
        const results: Record<string, { version: number; updatedAt: number } | null> = {};

        for (const id of args.ids) {
            const template = await ctx.db.get(id);
            if (template) {
                results[id] = {
                    version: template.version,
                    updatedAt: template.updatedAt,
                };
            } else {
                results[id] = null;
            }
        }

        return results;
    },
});
