import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import { Node } from "@xyflow/react"
import { TSLNodeData } from "./types"

export const getAbsolutePosition = (node: Node<TSLNodeData>, nodes: Node<TSLNodeData>[]): { x: number; y: number } => {
  let x = node.position.x;
  let y = node.position.y;
  let currentParentId = node.parentId;

  while (currentParentId) {
    const parent = nodes.find(n => n.id === currentParentId);
    if (parent) {
      x += parent.position.x;
      y += parent.position.y;
      currentParentId = parent.parentId;
    } else {
      break;
    }
  }
  return { x, y };
};

import { ConvexError } from "convex/values";

/**
 * Extracts a user-friendly error message from an error object.
 * Handles ConvexError with structured data { code, message } as well as standard Errors.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    // Handle structured error data { code, message }
    const data = error.data as { message?: string; code?: number } | string;
    if (typeof data === 'string') return data;
    return data.message || 'An unexpected error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
