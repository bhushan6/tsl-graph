"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Plus,
    Search,
    FolderOpen,
    Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ProjectCard } from "@/components/dashboard/ProjectCard";

function DashboardContent() {
    const router = useRouter();
    const { data: session } = authClient.useSession();
    // Removed newProjectName and isCreateOpen states as they are no longer needed
    const [searchQuery, setSearchQuery] = useState("");
    const [projectToDelete, setProjectToDelete] = useState<Id<"projects"> | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const projects = useQuery(api.projects.list);
    const createProject = useMutation(api.projects.create);
    const deleteProject = useMutation(api.projects.remove);

    const handleCreateProject = async () => {
        try {
            setIsCreating(true);
            // No name provided, backend handles "Untitled" + auto-increment
            const projectId = await createProject({
                graphData: { version: 1, nodes: [], edges: [], subgraphs: {}, codeNodes: {} },
            });

            router.push(`/editor/${projectId}`);
        } catch (error) {
            console.error("Failed to create project:", error);
            setIsCreating(false);
        }
    };

    const handleDeleteProject = async () => {
        if (!projectToDelete) return;
        try {
            setIsDeleting(true);
            await deleteProject({ id: projectToDelete });
            setProjectToDelete(null);
        } catch (error) {
            console.error("Failed to delete project:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredProjects = projects?.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            <Sidebar user={session?.user} />

            <main className="flex-1 pl-[68px] transition-all duration-300">
                <div className="container mx-auto px-8 py-10 max-w-[1600px]">

                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
                        <div>
                            <h2 className="text-4xl font-light tracking-tight text-foreground">My Projects</h2>
                            <p className="text-muted-foreground mt-2 font-light">Manage your shader graphs.</p>
                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto">
                            {/* Omnibar Style Search */}
                            <div className="relative group w-full md:w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder="Search projects..."
                                    className="pl-10 pr-10 bg-secondary border-border h-10 rounded-md focus:bg-background focus:border-primary focus:ring-0 transition-all font-light"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <Button
                                onClick={handleCreateProject}
                                disabled={isCreating}
                                className="rounded-md px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                            >
                                {isCreating ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Plus className="h-4 w-4 mr-2" />
                                )}
                                New Project
                            </Button>
                        </div>
                    </div>

                    {/* Gallery Grid */}
                    {projects === undefined ? (
                        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="aspect-video rounded-xl overflow-hidden bg-card/40 border border-white/5">
                                    <Skeleton className="h-full w-full bg-white/5 animate-pulse" />
                                </div>
                            ))}
                        </div>
                    ) : filteredProjects?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center border border-border rounded-2xl bg-muted/10">
                            {searchQuery ? (
                                <>
                                    <Search className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
                                    <h3 className="text-lg font-medium text-foreground">No results found</h3>
                                    <p className="text-muted-foreground max-w-sm mt-1">
                                        No projects found matching &quot;{searchQuery}&quot;.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <FolderOpen className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
                                    <h3 className="text-xl font-light text-foreground">No sketches yet</h3>
                                    <p className="text-muted-foreground max-w-sm mt-2 mb-8 font-light">
                                        Create your first shader project to get started with TSL Editor.
                                    </p>
                                    <Button onClick={handleCreateProject} disabled={isCreating} className="rounded-md px-8 bg-primary text-primary-foreground hover:bg-primary/90">
                                        {isCreating ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Plus className="h-4 w-4 mr-2" />
                                        )}
                                        Create Project
                                    </Button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredProjects!.map((project) => (
                                <ProjectCard
                                    key={project._id}
                                    project={project}
                                    onDelete={setProjectToDelete}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Delete Confirmation Alert */}
                <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && !isDeleting && setProjectToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Sketch?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete this project and all of its data. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleDeleteProject();
                                }}
                                disabled={isDeleting}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    "Delete"
                                )}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
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
