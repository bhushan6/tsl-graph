"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignInCard } from "./sign-in-card";

interface SignInModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SignInModal({ open, onOpenChange }: SignInModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-6 bg-card border-none shadow-none">
                <DialogHeader className="sr-only">
                    <DialogTitle>Sign In</DialogTitle>
                </DialogHeader>
                <div className="bg-card rounded-xl shadow-lg overflow-hidden">
                    <SignInCard hideAnonymous />
                </div>
            </DialogContent>
        </Dialog>
    );
}
