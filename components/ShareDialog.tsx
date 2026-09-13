"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, Share2, Globe, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getStandaloneEmbedSnippet } from "@/lib/editor-host/standalone-project";

interface ShareDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isPublic: boolean;
    onTogglePublic: (nextIsPublic: boolean) => Promise<void>;
    shareUrl: string;
    embedUrl: string;
}

export function ShareDialog({
    open,
    onOpenChange,
    isPublic,
    onTogglePublic,
    shareUrl,
    embedUrl,
}: ShareDialogProps) {
    const [copied, setCopied] = useState(false);
    const [copiedStandaloneUrl, setCopiedStandaloneUrl] = useState(false);
    const [copiedEmbed, setCopiedEmbed] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const embedSnippet = useMemo(
        () => getStandaloneEmbedSnippet(embedUrl),
        [embedUrl]
    );

    const handleTogglePublic = async () => {
        try {
            setIsUpdating(true);
            const newIsPublic = !isPublic;
            await onTogglePublic(newIsPublic);
            toast.success(newIsPublic ? "Project is now public" : "Project is now private");
        } catch (error) {
            console.error("Failed to update project visibility:", error);
            toast.error("Failed to update project visibility");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success("Link copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Failed to copy link:", error);
            toast.error("Failed to copy link");
        }
    };

    const handleCopyEmbed = async () => {
        try {
            await navigator.clipboard.writeText(embedSnippet);
            setCopiedEmbed(true);
            toast.success("Embed code copied to clipboard");
            setTimeout(() => setCopiedEmbed(false), 2000);
        } catch (error) {
            console.error("Failed to copy embed code:", error);
            toast.error("Failed to copy embed code");
        }
    };

    const handleCopyStandaloneUrl = async () => {
        try {
            await navigator.clipboard.writeText(embedUrl);
            setCopiedStandaloneUrl(true);
            toast.success("Standalone URL copied to clipboard");
            setTimeout(() => setCopiedStandaloneUrl(false), 2000);
        } catch (error) {
            console.error("Failed to copy standalone URL:", error);
            toast.error("Failed to copy standalone URL");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="h-5 w-5" />
                        Share Project
                    </DialogTitle>
                    <DialogDescription>
                        Make your project public to share it with others via a link
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Public/Private Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                            {isPublic ? (
                                <Globe className="h-5 w-5 text-green-500" />
                            ) : (
                                <Lock className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                                <p className="font-medium text-sm">
                                    {isPublic ? "Public" : "Private"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {isPublic
                                        ? "Anyone with the link can view this project"
                                        : "Only you can access this project"}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant={isPublic ? "outline" : "default"}
                            size="sm"
                            onClick={handleTogglePublic}
                            disabled={isUpdating}
                        >
                            {isUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isPublic ? (
                                "Make Private"
                            ) : (
                                "Make Public"
                            )}
                        </Button>
                    </div>

                    {/* Share Link */}
                    {isPublic && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="share-project-url" className="text-sm font-medium">
                                    Share Link
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        id="share-project-url"
                                        value={shareUrl}
                                        readOnly
                                        className="flex-1 text-sm bg-muted/50"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={handleCopyLink}
                                        className="shrink-0"
                                        aria-label="Copy public share link"
                                    >
                                        {copied ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="standalone-project-url" className="text-sm font-medium">
                                    Standalone editor URL
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        id="standalone-project-url"
                                        value={embedUrl}
                                        readOnly
                                        className="flex-1 text-sm bg-muted/50"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={handleCopyStandaloneUrl}
                                        className="shrink-0"
                                        aria-label="Copy standalone editor URL"
                                    >
                                        {copiedStandaloneUrl ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                <label htmlFor="standalone-embed-code" className="text-sm font-medium">
                                    Embed HTML
                                </label>
                                <textarea
                                    id="standalone-embed-code"
                                    value={embedSnippet}
                                    readOnly
                                    rows={3}
                                    className="w-full resize-none rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-xs"
                                    aria-label="Standalone editor iframe embed HTML"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopyEmbed}
                                >
                                    {copiedEmbed ? (
                                        <Check className="mr-2 h-4 w-4 text-green-500" />
                                    ) : (
                                        <Copy className="mr-2 h-4 w-4" />
                                    )}
                                    Copy embed HTML
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    Embedded edits stay in the browser. Your host app owns persistence.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
