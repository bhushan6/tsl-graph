import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    // Main projects table
    projects: defineTable({
        userId: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        isPublic: v.boolean(),
        graphData: v.any(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_user_updated", ["userId", "updatedAt"])
        .index("by_public", ["isPublic"]),

    // Future: Shareable subgraph templates
    subgraphTemplates: defineTable({
        userId: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        isPublic: v.boolean(),
        version: v.number(),
        data: v.any(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_public", ["isPublic"]),

    // Future: Shareable code node templates
    codeNodeTemplates: defineTable({
        userId: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        isPublic: v.boolean(),
        version: v.number(),
        data: v.any(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_public", ["isPublic"]),
});
