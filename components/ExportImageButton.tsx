"use client";

import { useCallback, useRef, useState } from "react";
import posthog from "posthog-js";
import { Clipboard, Download, ImageDown, Loader2 } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { exportGraphImage } from "@/lib/export-image";
import { useEditorStore } from "@/store/editor";
import type { AppNode } from "@/lib/types";

// Flow-space padding around the captured nodes.
const BOUNDS_PADDING = 32;

export function ExportImageButton() {
  const { getNodes, getNodesBounds } = useReactFlow<AppNode>();
  const selectionCount = useEditorStore((s) => s.selectedNodeIds.length);
  const [includeShaderPreview, setIncludeShaderPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // State updates are async, so a ref is needed to block re-entrant calls
  // (e.g. a menu item event firing twice) within the same tick.
  const exportingRef = useRef(false);

  const handleExport = useCallback(
    async (target: "download" | "clipboard") => {
      if (exportingRef.current) return;

      const nodes = getNodes();
      const selectedNodes = nodes.filter((node) => node.selected);
      const exportNodes = selectedNodes.length > 0 ? selectedNodes : nodes;
      if (exportNodes.length === 0) {
        toast.error("Nothing to export — the canvas is empty.");
        return;
      }

      exportingRef.current = true;
      setIsExporting(true);
      try {
        const rawBounds = getNodesBounds(exportNodes);
        const bounds = {
          x: rawBounds.x - BOUNDS_PADDING,
          y: rawBounds.y - BOUNDS_PADDING,
          width: rawBounds.width + BOUNDS_PADDING * 2,
          height: rawBounds.height + BOUNDS_PADDING * 2,
        };

        const blob = await exportGraphImage({ bounds, includeShaderPreview });

        if (target === "clipboard") {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          toast.success("Image copied to clipboard.");
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `tsl-graph-${new Date().toISOString().slice(0, 10)}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }

        posthog.capture("graph_image_exported", {
          target,
          includeShaderPreview,
          nodeCount: exportNodes.length,
          isSelection: selectedNodes.length > 0,
        });
      } catch (error) {
        console.error("Graph image export failed:", error);
        toast.error("Failed to export image.");
        posthog.capture("error_occurred", {
          context: "export_graph_image",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        exportingRef.current = false;
        setIsExporting(false);
      }
    },
    [getNodes, getNodesBounds, includeShaderPreview],
  );

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageDown className="w-4 h-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Export Image</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="center">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {selectionCount > 0
            ? `Exports ${selectionCount} selected node${selectionCount === 1 ? "" : "s"}`
            : "Exports all nodes"}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => handleExport("download")}
        >
          <Download className="w-4 h-4" />
          Download PNG
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => handleExport("clipboard")}
        >
          <Clipboard className="w-4 h-4" />
          Copy to clipboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          className="cursor-pointer"
          checked={includeShaderPreview}
          onCheckedChange={setIncludeShaderPreview}
          onSelect={(event) => event.preventDefault()}
        >
          Include shader preview
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
