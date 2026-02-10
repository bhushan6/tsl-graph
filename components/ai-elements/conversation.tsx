"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConversationContextValue {
  scrollRef: React.RefObject<HTMLDivElement>;
  isAtBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const ConversationContext = React.createContext<ConversationContextValue | null>(
  null
);

function useConversationContext() {
  const context = React.useContext(ConversationContext);
  if (!context) {
    throw new Error("Conversation components must be used within Conversation");
  }
  return context;
}

const Conversation = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, onScroll, ...props }, ref) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = React.useState(true);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref]
  );

  const updateIsAtBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 24;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    []
  );

  React.useEffect(() => {
    if (isAtBottom) {
      scrollToBottom("auto");
    }
  }, [children, isAtBottom, scrollToBottom]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    updateIsAtBottom();
    onScroll?.(event);
  };

  return (
    <ConversationContext.Provider
      value={{ scrollRef, isAtBottom, scrollToBottom }}
    >
      <div
        ref={setRefs}
        onScroll={handleScroll}
        className={cn("relative h-full w-full overflow-y-auto", className)}
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  );
});
Conversation.displayName = "Conversation";

const ConversationContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-3 px-4 py-3", className)}
    {...props}
  />
));
ConversationContent.displayName = "ConversationContent";

const ConversationEmptyState = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    title: string;
    description: string;
    icon?: React.ReactNode;
  }
>(({ className, title, description, icon, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-6 py-8 text-center text-muted-foreground",
      className
    )}
    {...props}
  >
    {icon && <div className="text-muted-foreground/70">{icon}</div>}
    <div className="text-sm font-medium text-foreground">{title}</div>
    <div className="text-xs text-muted-foreground">{description}</div>
  </div>
));
ConversationEmptyState.displayName = "ConversationEmptyState";

function ConversationScrollButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { isAtBottom, scrollToBottom } = useConversationContext();

  if (isAtBottom) {
    return null;
  }

  return (
    <div className="sticky bottom-3 flex w-full justify-end pr-3">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cn("shadow-sm", className)}
        onClick={() => scrollToBottom("smooth")}
        {...props}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  );
}

export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
};
