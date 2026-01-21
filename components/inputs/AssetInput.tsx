'use client';

import { useState, useCallback } from "react";
import posthog from "posthog-js";
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { SidebarInput } from '@/components/ui/sidebar';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { AssetValue } from '@/lib/types';

interface AssetInputProps {
    value: AssetValue | string | undefined;
    onChange: (value: AssetValue | string) => void;
    graphId: Id<"projects"> | undefined;
    nodeId: string;
    propertyName: string;
    accept?: string;
}

function getUrl(value: AssetValue | string | undefined): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
        return value.url || '';
    }
    return '';
}

function getAssetId(value: AssetValue | string | undefined): string | undefined {
    if (!value || typeof value === 'string') return undefined;
    if (typeof value === 'object' && value !== null) {
        return value.assetId;
    }
    return undefined;
}

export function AssetInput({
    value,
    onChange,
    graphId,
    nodeId,
    propertyName,
    accept = 'image/*',
}: AssetInputProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generateUploadUrl = useMutation(api.assets.generateUploadUrl);
    const registerAsset = useMutation(api.assets.registerAsset);
    const linkAssetToNode = useMutation(api.assets.linkAssetToNode);
    const unlinkAssetFromNode = useMutation(api.assets.unlinkAssetFromNode);

    const displayUrl = getUrl(value);
    const currentAssetId = getAssetId(value);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !graphId) return;

        const existingAssetId = getAssetId(value);

        setIsUploading(true);
        setError(null);

        try {
            // Unlink existing asset first (soft-delete for replacement)
            if (existingAssetId) {
                try {
                    await unlinkAssetFromNode({
                        nodeId,
                        graphId,
                        propertyName,
                    });
                } catch {
                    // Ignore errors if no existing reference
                }
            }

            // Get upload URL
            const uploadUrl = await generateUploadUrl();

            // Upload file to Convex storage
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': file.type },
                body: file,
            });

            if (!response.ok) {
                throw new Error('Failed to upload file');
            }

            const { storageId } = await response.json();

            // Register the asset
            const { assetId, url } = await registerAsset({
                storageId,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
            });

            if (!url) {
                throw new Error('Failed to get asset URL');
            }

            // Link to node
            await linkAssetToNode({
                assetId,
                nodeId,
                graphId,
                propertyName,
            });

            // Update with the real Convex URL
            onChange({ url, assetId });
            toast.success('Asset uploaded');

        } catch (err) {
            console.error('[AssetInput] Asset upload error:', err);
            const message = err instanceof Error ? err.message : 'Failed to upload asset';
            setError(message);
            toast.error(message);
            posthog.capture('error_occurred', { context: 'asset_upload_failed', error: message });
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    }, [graphId, nodeId, propertyName, value, generateUploadUrl, registerAsset, linkAssetToNode, unlinkAssetFromNode, onChange]);

    const handleRemove = useCallback(async () => {
        if (!graphId) return;

        const existingAssetId = getAssetId(value);

        try {
            if (existingAssetId) {
                await unlinkAssetFromNode({
                    nodeId,
                    graphId,
                    propertyName,
                });
            }
            onChange('');
        } catch (err) {
            console.error('[AssetInput] Asset unlink error:', err);
            toast.error('Failed to remove asset');
            posthog.capture('error_occurred', { context: 'asset_remove_failed', error: 'Failed to remove asset' });
        }
    }, [graphId, nodeId, propertyName, value, unlinkAssetFromNode, onChange]);

    const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    }, [onChange]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2">
                <SidebarInput
                    type="text"
                    value={displayUrl}
                    onChange={handleUrlChange}
                    className="h-8 text-xs flex-1"
                    placeholder="Image URL or upload..."
                    disabled={isUploading}
                />
                <div className="relative">
                    <input
                        type="file"
                        accept={accept}
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                        title="Upload image"
                        disabled={isUploading || !graphId}
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        disabled={isUploading || !graphId}
                    >
                        {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Upload className="h-4 w-4" />
                        )}
                    </Button>
                </div>
                {displayUrl && (
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleRemove}
                        disabled={isUploading}
                        title="Remove asset"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}

            {!graphId && (
                <p className="text-xs text-muted-foreground">
                    Save the project first to enable asset uploads
                </p>
            )}

            {currentAssetId && (
                <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Managed asset
                </p>
            )}

            {displayUrl && (
                <div className="relative w-full aspect-square rounded-md overflow-hidden border border-sidebar-border bg-checkered">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={displayUrl}
                        alt="Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const placeholder = target.nextElementSibling as HTMLElement;
                            if (placeholder) placeholder.style.display = 'flex';
                        }}
                    />
                    <div className="absolute inset-0 items-center justify-center text-muted-foreground hidden">
                        <ImageIcon className="w-8 h-8" />
                    </div>
                </div>
            )}
        </div>
    );
}
