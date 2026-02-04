"use client";

import { useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { CommunityProjectCard } from "@/components/dashboard/CommunityProjectCard";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Heart } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { authClient } from "@/lib/auth-client";
import type { Id } from "@/convex/_generated/dataModel";

function FavoritesContent() {
    const [searchQuery, setSearchQuery] = useState("");
    const { data: session } = authClient.useSession();
    type FavoriteProject = {
        _id: Id<"projects">;
        name: string;
        thumbnail?: string;
        updatedAt: number;
        likeCount?: number;
        likedByMe?: boolean;
        isOwner?: boolean;
        authorName?: string;
    };

    const favorites = useQuery(api.projects.listFavorites) as FavoriteProject[] | undefined;

    const filteredProjects = favorites?.filter((p) =>
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
                            <h2 className="text-4xl font-light tracking-tight text-foreground">Favorites</h2>
                            <p className="text-muted-foreground mt-2 font-light">
                                Projects you&apos;ve liked, all in one place.
                            </p>
                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="relative group w-full md:w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder="Search favorites..."
                                    className="pl-10 pr-10 bg-secondary border-border h-10 rounded-md focus:bg-background focus:border-primary focus:ring-0 transition-all font-light"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Favorites Grid */}
                    {favorites === undefined ? (
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
                                        No favorites found matching &quot;{searchQuery}&quot;.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <Heart className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
                                    <h3 className="text-xl font-light text-foreground">No favorites yet</h3>
                                    <p className="text-muted-foreground max-w-sm mt-2 mb-2 font-light">
                                        Like a project to add it to your favorites.
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredProjects!.map((project) => (
                                <CommunityProjectCard
                                    key={project._id}
                                    project={project}
                                    href={project.isOwner ? `/editor/${project._id}` : `/share/${project._id}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function FavoritesPage() {
    return (
        <ProtectedRoute>
            <ErrorBoundary>
                <FavoritesContent />
            </ErrorBoundary>
        </ProtectedRoute>
    );
}
