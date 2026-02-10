"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PromptStatus = "ready" | "submitted" | "streaming" | "error";

const Input = React.forwardRef<
  HTMLFormElement,
  React.ComponentPropsWithoutRef<"form">
>(({ className, ...props }, ref) => (
  <form
    ref={ref}
    className={cn(
      "relative flex w-full items-center gap-2 rounded-lg border border-border bg-background/70 px-2 py-1 shadow-sm",
      className
    )}
    {...props}
  />
));
Input.displayName = "PromptInput";

const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea">
>(({ className, rows = 1, ...props }, ref) => (
  <Textarea
    ref={ref}
    rows={rows}
    className={cn(
      "min-h-0 h-9 resize-none border-none bg-transparent px-3 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
      className
    )}
    {...props}
  />
));
PromptInputTextarea.displayName = "PromptInputTextarea";

interface PromptInputSubmitProps
  extends React.ComponentPropsWithoutRef<typeof Button> {
  status?: PromptStatus;
}

const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  PromptInputSubmitProps
>(({ className, status = "ready", ...props }, ref) => {
  const isLoading = status === "streaming" || status === "submitted";
  return (
    <Button
      ref={ref}
      type="submit"
      size="icon"
      className={cn("h-8 w-8", className)}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
  );
});
PromptInputSubmit.displayName = "PromptInputSubmit";

export { Input, PromptInputTextarea, PromptInputSubmit };
export type { PromptStatus };
