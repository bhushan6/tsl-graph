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
        thumbnail: v.optional(v.string()), // URL from Convex storage
        thumbnailStorageId: v.optional(v.id("_storage")), // Storage ID for cleanup
        likeCount: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_user_updated", ["userId", "updatedAt"])
        .index("by_public", ["isPublic"]),

    projectLikes: defineTable({
        userId: v.string(),
        projectId: v.id("projects"),
        createdAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_project", ["projectId"])
        .index("by_user_project", ["userId", "projectId"]),

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
        .index("by_user_name", ["userId", "name"])
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
        .index("by_user_name", ["userId", "name"])
        .index("by_public", ["isPublic"]),

    // ========== Asset Management ==========

    // Assets: Central registry of uploaded files
    assets: defineTable({
        userId: v.string(),           // Owner of the asset
        storageId: v.id("_storage"),  // Convex file storage reference
        filename: v.string(),         // Original filename
        mimeType: v.string(),         // File MIME type
        size: v.number(),             // File size in bytes
        createdAt: v.number(),
        lastAccessedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_storage", ["storageId"]),

    // Active references: Links between nodes and assets
    assetReferences: defineTable({
        assetId: v.id("assets"),
        nodeId: v.string(),           // React Flow node ID
        graphId: v.id("projects"),    // Project ID for scoping
        propertyName: v.string(),     // e.g., "texture", "normalMap"
        createdAt: v.number(),
    })
        .index("by_node", ["graphId", "nodeId"])
        .index("by_asset", ["assetId"])
        .index("by_graph", ["graphId"]),

    // Soft-deleted references: For undo support (7-day grace period)
    deletedAssetReferences: defineTable({
        assetId: v.id("assets"),
        nodeId: v.string(),
        graphId: v.id("projects"),
        propertyName: v.string(),
        deletedAt: v.number(),        // When reference was deleted
    })
        .index("by_node", ["graphId", "nodeId"])
        .index("by_asset", ["assetId"])
        .index("by_deleted_at", ["deletedAt"]),

    // Feedback and Bug Reports
    feedbacks: defineTable({
        userId: v.string(),
        userName: v.optional(v.string()),
        userEmail: v.optional(v.string()),
        title: v.string(),
        description: v.string(),
        type: v.string(), // "bug", "feature", "other"
        createdAt: v.number(),
        status: v.string(), // "new", "in_progress", "resolved"
        attachment: v.optional(v.id("_storage")), // Deprecated: use attachments
        attachments: v.optional(v.array(v.id("_storage"))),
    })
        .index("by_user", ["userId"])
        .index("by_type", ["type"])
        .index("by_status", ["status"]),
});
