import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const uploadPurpose = v.union(
    v.literal("asset"),
    v.literal("thumbnail"),
);

// "ai-preview" and "feedback" belonged to removed features. They stay valid so
// bindings and grants already stored with them keep passing schema validation.
export const filePurpose = v.union(
    uploadPurpose,
    v.literal("ai-preview"),
    v.literal("feedback"),
);

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

    // ========== File Ownership ==========

    // Server-recorded owner of every stored file the app references. Deleting or
    // attaching a file requires a binding for the caller; a caller-supplied
    // storage ID alone never proves ownership.
    storageBindings: defineTable({
        storageId: v.id("_storage"),
        userId: v.string(),
        purpose: filePurpose,
        // Legacy file referenced by more than one user: never deleted or re-attached.
        disputed: v.optional(v.boolean()),
        createdAt: v.number(),
    })
        .index("by_storage", ["storageId"])
        .index("by_user", ["userId"]),

    // One-use permission to upload a file for a purpose; consumed when the upload is claimed.
    uploadGrants: defineTable({
        userId: v.string(),
        purpose: filePurpose,
        createdAt: v.number(),
        expiresAt: v.number(),
        consumedAt: v.optional(v.number()),
    })
        .index("by_user_purpose", ["userId", "purpose", "createdAt"])
        .index("by_expires", ["expiresAt"]),

    // Progress of one-off storage maintenance (legacy binding backfill).
    storageMaintenance: defineTable({
        key: v.string(),
        // Files created after this time are always bound when legitimate, so unbound ones can be swept.
        orphanSweepSince: v.optional(v.number()),
        // Creation time of the newest file the orphan sweep has examined.
        orphanSweptUntil: v.optional(v.number()),
    }).index("by_key", ["key"]),
});
