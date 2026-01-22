"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import FileUploadCompact from "@/components/file-upload/compact-upload";

export function FeedbackDialog() {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState("feature");
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const generateUploadUrl = useMutation(api.feedback.generateUploadUrl);
    const submitFeedback = useMutation(api.feedback.submitFeedback);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            toast.error("Please fill in all fields");
            return;
        }

        setIsSubmitting(true);
        try {
            const attachmentIds: Id<"_storage">[] = [];

            if (selectedFiles.length > 0) {
                for (const file of selectedFiles) {
                    const postUrl = await generateUploadUrl();
                    const result = await fetch(postUrl, {
                        method: "POST",
                        headers: { "Content-Type": file.type },
                        body: file,
                    });

                    if (!result.ok) {
                        throw new Error(`Upload failed for ${file.name}: ${result.statusText}`);
                    }

                    const { storageId } = await result.json();
                    attachmentIds.push(storageId);
                }
            }

            await submitFeedback({
                title,
                description,
                type,
                attachments: attachmentIds,
            });
            toast.success("Feedback submitted successfully!");
            setOpen(false);
            // Reset form
            setTitle("");
            setDescription("");
            setType("feature");
            setSelectedFiles([]);
        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast.error(getErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <MessageSquarePlus className="h-5 w-5" />
                    <span className="sr-only">Provide Feedback</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Send Feedback</DialogTitle>
                    <DialogDescription>
                        Help us improve! Submit a feature request, report a bug, or share your thoughts.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="type">Type</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger id="type">
                                <SelectValue placeholder="Select feedback type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="feature">Feature Request</SelectItem>
                                <SelectItem value="bug">Bug Report</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            placeholder="Brief summary"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder={
                                type === "bug"
                                    ? "Please describe the steps to reproduce the issue..."
                                    : "Describe your idea or feedback..."
                            }
                            className="min-h-[100px]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Attachments (Optional)</Label>
                        <FileUploadCompact
                            onFilesChange={(files) => {
                                const newFiles = files
                                    .map((f) => f.file)
                                    .filter((f): f is File => f instanceof File);
                                setSelectedFiles(newFiles);
                            }}
                            maxFiles={5}
                            accept="image/*,application/pdf"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Submitting..." : "Submit Feedback"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
