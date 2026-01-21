"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { Paperclip, ShieldAlert } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

import { ErrorBoundary } from "@/components/ErrorBoundary";

function FeedbackList() {
    const feedbacks = useQuery(api.feedback.getFeedbacks);

    if (feedbacks === undefined) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="text-muted-foreground">Loading feedback...</div>
            </div>
        );
    }

    return (
        <ScrollArea className="h-[800px]">
            <div className="grid gap-4">
                {feedbacks.length === 0 ? (
                    <div className="text-center text-muted-foreground py-10">
                        No feedback submitted yet.
                    </div>
                ) : (
                    feedbacks.map((feedback) => (
                        <Card key={feedback._id}>
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-lg">{feedback.title}</CardTitle>
                                        <CardDescription>
                                            Submitted by{" "}
                                            <span className="font-semibold text-foreground">
                                                {feedback.userName || feedback.userEmail || "Unknown User"}
                                            </span>{" "}
                                            <span className="text-xs text-muted-foreground">
                                                ({feedback.userEmail || feedback.userId})
                                            </span>{" "}
                                            on {format(new Date(feedback.createdAt), "PPP p")}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Badge
                                            variant={
                                                feedback.type === "bug"
                                                    ? "destructive"
                                                    : feedback.type === "feature"
                                                        ? "default"
                                                        : "secondary"
                                            }
                                        >
                                            {feedback.type}
                                        </Badge>
                                        <Badge variant="outline">{feedback.status}</Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-wrap text-sm">{feedback.description}</p>
                                {feedback.attachmentUrl && (
                                    <div className="mt-4">
                                        <Link
                                            href={feedback.attachmentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-sm text-blue-500 hover:underline"
                                        >
                                            <Paperclip className="h-4 w-4" />
                                            View Attachment
                                        </Link>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </ScrollArea>
    );
}

export default function FeedbackDashboard() {
    const { data: session, isPending: isAuthPending } = authClient.useSession();
    const router = useRouter();

    if (isAuthPending) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-muted-foreground">Checking authentication...</div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground">You must be signed in to view this page.</p>
                <Button onClick={() => router.push("/sign-in")}>Sign In</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10">
            <ErrorBoundary>
                <FeedbackList />
            </ErrorBoundary>
        </div>
    );
}
