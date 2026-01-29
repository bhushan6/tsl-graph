"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Copy, Check, Share2, Globe, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ShareDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: Id<"projects">;
    currentIsPublic: boolean;
}

export function ShareDialog({ open, onOpenChange, projectId, currentIsPublic }: ShareDialogProps) {
    const updateProject = useMutation(api.projects.update);
    const [isPublic, setIsPublic] = useState(currentIsPublic);
    const [copied, setCopied] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/${projectId}` : "";

    // Update local state when prop changes
    useEffect(() => {
        setIsPublic(currentIsPublic);
    }, [currentIsPublic]);

    const handleTogglePublic = async () => {
        try {
            setIsUpdating(true);
            const newIsPublic = !isPublic;
            await updateProject({
                id: projectId,
                isPublic: newIsPublic,
            });
            setIsPublic(newIsPublic);
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
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
                        <div className="space-y-2">
                            <p className="text-sm font-medium">Share Link</p>
                            <div className="flex gap-2">
                                <Input
                                    value={shareUrl}
                                    readOnly
                                    className="flex-1 text-sm bg-muted/50"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCopyLink}
                                    className="shrink-0"
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
