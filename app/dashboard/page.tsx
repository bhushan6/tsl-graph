"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Plus, MoreVertical, Trash2, FolderOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function DashboardContent() {
    const router = useRouter();
    const { data: session } = authClient.useSession();
    const [newProjectName, setNewProjectName] = useState("");
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const projects = useQuery(api.projects.list);
    const createProject = useMutation(api.projects.create);
    const deleteProject = useMutation(api.projects.remove);

    const handleSignOut = async () => {
        await authClient.signOut();
        router.replace("/sign-in");
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;

        const projectId = await createProject({
            name: newProjectName.trim(),
            graphData: { version: 1, nodes: [], edges: [], subgraphs: {}, codeNodes: {} },
        });

        setNewProjectName("");
        setIsCreateOpen(false);
        router.push(`/editor/${projectId}`);
    };

    const handleDeleteProject = async (id: Id<"projects">) => {
        await deleteProject({ id });
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="text-2xl font-bold">TSL Editor</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                            {session?.user?.email}
                        </span>
                        <Button variant="ghost" size="sm" onClick={handleSignOut}>
                            <LogOut className="h-4 w-4 mr-2" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </header>
            <main className="container mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">My Projects</h2>
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                New Project
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New Project</DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col gap-4 pt-4">
                                <Input
                                    placeholder="Project name"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                                />
                                <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                                    Create Project
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>

                {projects === undefined ? (
                    <div className="text-center py-12 text-muted-foreground">
                        Loading projects...
                    </div>
                ) : projects.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-muted-foreground mb-4">
                            No projects yet. Create your first shader project!
                        </p>
                        <Button onClick={() => setIsCreateOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Project
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {projects.map((project) => (
                            <div
                                key={project._id}
                                className="rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors"
                            >
                                <div className="flex items-start justify-between">
                                    <Link href={`/editor/${project._id}`} className="flex-1 min-w-0">
                                        <h3 className="font-medium truncate">{project.name}</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Updated {formatDate(project.updatedAt)}
                                        </p>
                                    </Link>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem asChild>
                                                <Link href={`/editor/${project._id}`}>
                                                    <FolderOpen className="h-4 w-4 mr-2" />
                                                    Open
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={() => handleDeleteProject(project._id)}
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <ProtectedRoute>
            <DashboardContent />
        </ProtectedRoute>
    );
}
