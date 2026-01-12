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
