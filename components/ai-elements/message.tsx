"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type MessageRole = "user" | "assistant" | "system" | (string & {});

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from?: MessageRole;
}

const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ className, from = "assistant", ...props }, ref) => {
    const isUser = from === "user";
    return (
      <div
        ref={ref}
        data-role={from}
        className={cn(
          "group/message flex w-full",
          isUser ? "justify-end is-user" : "justify-start is-assistant",
          className
        )}
        {...props}
      />
    );
  }
);
Message.displayName = "Message";

const MessageContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed shadow-sm",
      "bg-muted text-foreground",
      "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
      className
    )}
    {...props}
  />
));
MessageContent.displayName = "MessageContent";

const MessageResponse = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("whitespace-pre-wrap break-words", className)}
    {...props}
  />
));
MessageResponse.displayName = "MessageResponse";

export { Message, MessageContent, MessageResponse };
