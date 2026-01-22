"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutGrid,
    Settings,
    LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";

interface SidebarProps {
    className?: string;
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
}

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
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ConvexError } from "convex/values";
import { ErrorCodes } from "@/convex/errors";

export function Sidebar({ className, user }: SidebarProps) {
    const pathname = usePathname();
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const deleteSelf = useMutation(api.users.deleteSelf);

    const navItems = [
        {
            label: "Gallery",
            icon: LayoutGrid,
            href: "/dashboard",
            isActive: pathname === "/dashboard",
        },
    ];

    const handleSignOut = async () => {
        await authClient.signOut();
        window.location.href = "/sign-in";
    };

    const handleDeleteAccount = async () => {
        try {
            setIsDeleting(true);
            await deleteSelf();
            await authClient.deleteUser({
                fetchOptions: {
                    onSuccess: () => {
                        window.location.href = "/";
                    }
                }
            });
        } catch (error) {
            console.error("Failed to delete account:", error);

            // Check for NOT_AUTHENTICATED error and redirect to sign-in
            if (
                error instanceof ConvexError &&
                typeof error.data === 'object' &&
                error.data !== null &&
                'code' in error.data &&
                error.data.code === ErrorCodes.NOT_AUTHENTICATED
            ) {
                window.location.href = "/sign-in";
                return;
            }

            toast.error("Failed to delete account. Please try again.");
            setIsDeleting(false);
            setShowDeleteAlert(false);
        }
    };

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-40 h-screen w-[68px] border-r border-sidebar-border bg-sidebar/80 backdrop-blur-md flex flex-col justify-between transition-all duration-300 ease-out",
                className
            )}
        >
            {/* Top Section */}
            <div className="flex flex-col items-center py-6 gap-6">
                {/* Brand Icon */}
                <div className="flex items-center justify-center w-full px-4">
                    <Link href="/dashboard" className="flex items-center gap-3">
                        <Logo size="sm" />
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="w-full px-2 flex flex-col gap-2 mt-4">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "group relative flex items-center justify-center w-full aspect-square rounded-lg transition-all duration-200",
                                item.isActive
                                    ? "bg-sidebar-primary/10 text-sidebar-primary"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                            title={item.label}
                        >
                            <item.icon className={cn("w-5 h-5 shrink-0 transition-colors", item.isActive ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-foreground")} />

                            {/* Active Indicator Pill */}
                            {item.isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sidebar-primary rounded-r-full" />
                            )}
                        </Link>
                    ))}
                </nav>
            </div>

            {/* Bottom Section */}
            <div className="flex flex-col gap-4 p-4 border-t border-sidebar-border/50 items-center">
                <FeedbackDialog />
                <ThemeToggle />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-10 w-10 rounded-lg p-0 flex items-center justify-center hover:bg-sidebar-accent transition-all">
                            <Avatar className="h-8 w-8 border border-sidebar-ring rounded-md">
                                <AvatarImage src={user?.image || undefined} alt={user?.name || "User"} className="rounded-md" />
                                <AvatarFallback className="bg-sidebar-primary/10 text-sidebar-primary rounded-md">
                                    {user?.name?.charAt(0).toUpperCase() || "U"}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="right" className="w-56 ml-2">
                        <DropdownMenuItem>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setShowDeleteAlert(true)}
                            className="text-destructive focus:text-destructive"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Delete Account</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleSignOut}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Sign Out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete your account and all associated data (projects, assets, etc.). This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleDeleteAccount();
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
                                    "Delete Account"
                                )}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </aside>
    );
}
