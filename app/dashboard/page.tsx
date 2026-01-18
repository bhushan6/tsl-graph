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
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
    LogOut,
    Plus,
    MoreVertical,
    Trash2,
    FolderOpen,
    Search,
    Sparkles
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function DashboardContent() {
    const router = useRouter();
    const { data: session } = authClient.useSession();
    const [newProjectName, setNewProjectName] = useState("");
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [projectToDelete, setProjectToDelete] = useState<Id<"projects"> | null>(null);

    const projects = useQuery(api.projects.list);
    const createProject = useMutation(api.projects.create);
    const deleteProject = useMutation(api.projects.remove);

    const handleSignOut = async () => {
        await authClient.signOut();
        router.replace("/sign-in");
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;

        try {
            const projectId = await createProject({
                name: newProjectName.trim(),
                graphData: { version: 1, nodes: [], edges: [], subgraphs: {}, codeNodes: {} },
            });

            setNewProjectName("");
            setIsCreateOpen(false);
            router.push(`/editor/${projectId}`);
        } catch (error) {
            console.error("Failed to create project:", error);
        }
    };

    const handleDeleteProject = async () => {
        if (!projectToDelete) return;
        await deleteProject({ id: projectToDelete });
        setProjectToDelete(null);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const filteredProjects = projects?.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        TSL Editor
                    </div>

                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-full">
                                    <Avatar className="h-8 w-8 transition-opacity hover:opacity-80">
                                        <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || "User"} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                            {session?.user?.name?.charAt(0).toUpperCase() || session?.user?.email?.charAt(0).toUpperCase() || "U"}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">{session?.user?.name || "User"}</p>
                                        <p className="text-xs leading-none text-muted-foreground">{session?.user?.email}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive cursor-pointer">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Sign Out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-7xl">
                {/* Actions Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                        <p className="text-muted-foreground mt-1">Manage your shader projects and experiments.</p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search projects..."
                                className="pl-9 w-full"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                            <DialogTrigger asChild>
                                <Button className="shrink-0 gap-2">
                                    <Plus className="h-4 w-4" />
                                    <span className="hidden sm:inline">New Project</span>
                                    <span className="sm:hidden">New</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Create New Project</DialogTitle>
                                    <DialogDescription>
                                        Give your project a name to get started. You can change this later.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="flex flex-col gap-4 py-4">
                                    <Input
                                        placeholder="Project name (e.g., Water Shader)"
                                        value={newProjectName}
                                        onChange={(e) => setNewProjectName(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                                        autoFocus
                                    />
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                                    <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                                        Create Project
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Projects Grid */}
                {projects === undefined ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {[...Array(4)].map((_, i) => (
                            <Card key={i} className="overflow-hidden">
                                <CardHeader className="pb-4">
                                    <Skeleton className="h-5 w-2/3 mb-2" />
                                    <Skeleton className="h-4 w-1/3" />
                                </CardHeader>
                                <CardContent>
                                    <Skeleton className="h-24 w-full rounded-md" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : filteredProjects?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-card/50 border-dashed">
                        {searchQuery ? (
                            <>
                                <Search className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                                <h3 className="text-lg font-semibold">No results found</h3>
                                <p className="text-muted-foreground max-w-sm mt-2">
                                    No projects found matching &quot;{searchQuery}&quot;. Try a different search term.
                                </p>
                            </>
                        ) : (
                            <>
                                <FolderOpen className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                                <h3 className="text-lg font-semibold">No projects yet</h3>
                                <p className="text-muted-foreground max-w-sm mt-2 mb-6">
                                    Create your first shader project to get started with TSL Editor.
                                </p>
                                <Button onClick={() => setIsCreateOpen(true)} variant="outline">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Project
                                </Button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredProjects!.map((project) => (
                            <Card
                                key={project._id}
                                className="group relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-md cursor-pointer flex flex-col"
                                onClick={() => router.push(`/editor/${project._id}`)}
                            >
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <CardTitle className="text-base font-semibold truncate leading-tight pt-1">
                                            {project.name}
                                        </CardTitle>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 -mr-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                    <span className="sr-only">Open menu</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/editor/${project._id}`);
                                                }}>
                                                    <FolderOpen className="mr-2 h-4 w-4" />
                                                    Open
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setProjectToDelete(project._id);
                                                    }}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <CardDescription className="text-xs">
                                        Last updated {formatDate(project.updatedAt)}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-grow pb-4">
                                    <div className="aspect-video w-full rounded-md bg-muted/50 border flex items-center justify-center text-muted-foreground/50 overflow-hidden group-hover:bg-muted/70 transition-colors">
                                        {project.thumbnail ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                                src={project.thumbnail}
                                                alt={project.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Sparkles className="h-8 w-8 opacity-20" />
                                        )}
                                    </div>
                                </CardContent>
                                {/* Bottom Accent */}
                                <div className="h-1 w-full bg-primary/0 group-hover:bg-primary/10 transition-colors" />
                            </Card>
                        ))}
                    </div>
                )}

                {/* Delete Confirmation Alert */}
                <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the project
                                and all of its data.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDeleteProject}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Delete Project
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
