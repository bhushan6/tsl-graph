import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useCallback } from "react";

/**
 * Hook for managing assets in the TSL graph editor.
 * Provides methods for uploading, linking, and unlinking assets from nodes.
 * 
 * @param graphId - The project ID to scope asset operations to
 */
export function useAssetManager(graphId: Id<"projects"> | undefined) {
    const generateUploadUrl = useMutation(api.assets.generateUploadUrl);
    const registerAssetMutation = useMutation(api.assets.registerAsset);
    const linkAssetMutation = useMutation(api.assets.linkAssetToNode);
    const unlinkAssetMutation = useMutation(api.assets.unlinkAssetFromNode);
    const handleNodeDeleteMutation = useMutation(api.assets.handleNodeDelete);

    /**
     * Upload a file and register it as an asset.
     * Returns the asset ID and URL that can be stored in node data.
     */
    const uploadAsset = useCallback(async (file: File): Promise<{ assetId: Id<"assets">; url: string | null }> => {
        // Get upload URL from Convex
        const uploadUrl = await generateUploadUrl();

        // Upload file to Convex storage
        const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
        });

        if (!response.ok) {
            throw new Error("Failed to upload file");
        }

        const { storageId } = await response.json();

        // Register the asset in the database - returns both assetId and url
        const result = await registerAssetMutation({
            storageId,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
        });

        return result;
    }, [generateUploadUrl, registerAssetMutation]);

    /**
     * Link an asset to a node.
     * This creates a reference between the node and the asset.
     * If the node already has an asset for this property, use unlinkAssetFromNode first.
     */
    const linkAssetToNode = useCallback(async (
        nodeId: string,
        assetId: Id<"assets">,
        propertyName: string
    ) => {
        if (!graphId) {
            throw new Error("No graph ID provided");
        }

        return await linkAssetMutation({
            assetId,
            nodeId,
            graphId,
            propertyName,
        });
    }, [graphId, linkAssetMutation]);

    /**
     * Unlink an asset from a node.
     * This soft-deletes the reference - the asset is kept for 7 days
     * in case of undo operations.
     */
    const unlinkAssetFromNode = useCallback(async (
        nodeId: string,
        propertyName: string
    ) => {
        if (!graphId) {
            throw new Error("No graph ID provided");
        }

        return await unlinkAssetMutation({
            nodeId,
            graphId,
            propertyName,
        });
    }, [graphId, unlinkAssetMutation]);

    /**
     * Handle node deletion - unlinks all assets from the node.
     * Called when a node is deleted from the graph.
     */
    const handleNodeDelete = useCallback(async (nodeId: string) => {
        if (!graphId) {
            throw new Error("No graph ID provided");
        }

        return await handleNodeDeleteMutation({
            nodeId,
            graphId,
        });
    }, [graphId, handleNodeDeleteMutation]);

    /**
     * Upload and link an asset to a node in one operation.
     * Convenience method that combines uploadAsset and linkAssetToNode.
     * Returns both assetId and url for storage in node data.
     */
    const uploadAndLinkAsset = useCallback(async (
        file: File,
        nodeId: string,
        propertyName: string
    ): Promise<{ assetId: Id<"assets">; url: string | null }> => {
        const result = await uploadAsset(file);
        await linkAssetToNode(nodeId, result.assetId, propertyName);
        return result;
    }, [uploadAsset, linkAssetToNode]);

    /**
     * Replace an asset on a node.
     * Unlinks the old asset (if any) and links the new one.
     * Returns both assetId and url for storage in node data.
     */
    const replaceAsset = useCallback(async (
        file: File,
        nodeId: string,
        propertyName: string
    ): Promise<{ assetId: Id<"assets">; url: string | null }> => {
        // Unlink existing asset (if any)
        try {
            await unlinkAssetFromNode(nodeId, propertyName);
        } catch {
            // No existing asset, that's fine
        }

        // Upload and link new asset
        return await uploadAndLinkAsset(file, nodeId, propertyName);
    }, [unlinkAssetFromNode, uploadAndLinkAsset]);

    return {
        uploadAsset,
        linkAssetToNode,
        unlinkAssetFromNode,
        handleNodeDelete,
        uploadAndLinkAsset,
        replaceAsset,
    };
}

/**
 * Hook to get the URL for a specific asset.
 */
export function useAssetUrl(assetId: Id<"assets"> | undefined) {
    return useQuery(
        api.assets.getAssetUrl,
        assetId ? { assetId } : "skip"
    );
}

/**
 * Hook to get all assets for a specific node.
 */
export function useNodeAssets(
    graphId: Id<"projects"> | undefined,
    nodeId: string | undefined
) {
    return useQuery(
        api.assets.getNodeAssets,
        graphId && nodeId ? { graphId, nodeId } : "skip"
    );
}

/**
 * Hook to get asset statistics for the current user.
 */
export function useAssetStats() {
    return useQuery(api.assets.getAssetStats);
}
