'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import { getCompatibleNodes, getNodesWithOutputType, getGroupedCompatibleNodes } from '@/lib/node-picker-utils';
import { useEditorStore } from '@/store/editor';
import { NodeType, NodeDef, TSLType } from '@/lib/types';
import { Code, Layers } from 'lucide-react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

interface EdgeDropNodePickerProps {
    position: { x: number; y: number };
    sourceDataType: TSLType | '';
    handleDirection: 'input' | 'output';
    onNodeSelect: (nodeType: NodeType) => void;
    onClose: () => void;
}

interface CodeNodeDef extends Omit<NodeDef, 'tsl'> {
    isCodeNode: true;
    tsl: string;
}

export function EdgeDropNodePicker({
    position,
    sourceDataType,
    handleDirection,
    onNodeSelect,
    onClose,
}: EdgeDropNodePickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        // Delay attaching to avoid immediate closing if triggered by click
        const timeout = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // Get store state for filtering
    const nodes = useEditorStore((s) => s.nodes);
    const editorMode = useEditorStore((s) => s.editorMode);
    const codeNodes = useEditorStore((s) => s.codeNodes);

    // Check which anchor nodes are present in the current graph
    const hasInputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/input'), [nodes]);
    const hasOutputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/output'), [nodes]);

    const ANCHOR_NODE_TYPES = ['subgraph/input', 'subgraph/output'];

    // Get compatible nodes
    const compatibleNodes = useMemo(() => {
        const nodes = handleDirection === 'output'
            ? getCompatibleNodes(sourceDataType)
            : getNodesWithOutputType(sourceDataType);

        // Filter out anchor nodes
        return nodes.filter(node => {
            const isAnchorNode = ANCHOR_NODE_TYPES.includes(node.type);

            if (isAnchorNode) {
                // In main editor: never show anchor nodes
                if (editorMode === 'main') return false;

                // In subgraph edit mode: only show if that anchor is missing
                if (node.type === 'subgraph/input' && hasInputAnchor) return false;
                if (node.type === 'subgraph/output' && hasOutputAnchor) return false;
            }
            return true;
        });
    }, [sourceDataType, handleDirection, editorMode, hasInputAnchor, hasOutputAnchor, nodes]); // nodes dependency for memo safety though logic uses filtered booleans

    // Build code nodes that are compatible
    const compatibleCodeNodes = useMemo((): CodeNodeDef[] => {
        // Code nodes always have 'any' type for inputs/output, so they're compatible with everything
        return Object.values(codeNodes).map(cn => ({
            type: cn.id as NodeType,
            label: cn.name,
            category: 'Custom' as const,
            isCodeNode: true as const,
            inputs: cn.inputs.reduce((acc, inp) => {
                acc[inp.id] = { label: inp.label, type: inp.type as TSLType };
                return acc;
            }, {} as Record<string, { label: string; type: TSLType }>),
            outputs: { out: { label: cn.output.label, type: cn.output.type as TSLType } },
            tsl: cn.id, // Use the code node ID as TSL reference
        }));
    }, [codeNodes]);

    const groupedNodes = useMemo(() => {
        const grouped = getGroupedCompatibleNodes(compatibleNodes);

        // Add code nodes to Custom category if they exist
        if (compatibleCodeNodes.length > 0) {
            grouped['Custom'] = [...(grouped['Custom'] || []), ...compatibleCodeNodes];
        }

        return grouped;
    }, [compatibleNodes, compatibleCodeNodes]);

    // Handle keyboard navigation (basic)
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    // State for adjusted position
    const [adjustedPosition, setAdjustedPosition] = useState(position);

    // Update position when prop changes or window resizes
    useEffect(() => {
        const adjustPosition = () => {
            if (!containerRef.current) return;

            const { innerWidth, innerHeight } = window;
            const { offsetWidth, offsetHeight } = containerRef.current;

            let x = position.x;
            let y = position.y;

            // Check right edge
            if (x + offsetWidth > innerWidth) {
                x = innerWidth - offsetWidth - 10; // 10px padding
            }
            // Check left edge (less likely with default 0,0 but good for safety)
            if (x < 10) x = 10;

            // Check bottom edge
            if (y + offsetHeight > innerHeight) {
                y = innerHeight - offsetHeight - 10;
            }
            // Check top edge
            if (y < 10) y = 10;

            setAdjustedPosition({ x, y });
        };

        // Run immediately and on resize
        adjustPosition();
        window.addEventListener('resize', adjustPosition);
        return () => window.removeEventListener('resize', adjustPosition);
    }, [position]);

    return (
        <div
            ref={containerRef}
            className="fixed z-50 w-64 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
            style={{
                left: adjustedPosition.x,
                top: adjustedPosition.y,
            }}
            onKeyDown={handleKeyDown}
        >
            <Command className="rounded-lg border shadow-md">
                <CommandInput placeholder="Search nodes..." autoFocus />
                <CommandList className="max-h-[300px]">
                    <CommandEmpty>No compatible nodes found.</CommandEmpty>
                    {Object.entries(groupedNodes).map(([category, nodes]) => (
                        <CommandGroup key={category} heading={category}>
                            {nodes.map((node) => (
                                <CommandItem
                                    key={node.type}
                                    value={`${category} ${node.label}`} // Include category in search
                                    onSelect={() => onNodeSelect(node.type as NodeType)}
                                    className="gap-2"
                                >
                                    {(node as { isCodeNode?: boolean }).isCodeNode && <Code className="w-3 h-3 text-primary" />}
                                    {category === 'Custom' && !(node as { isCodeNode?: boolean }).isCodeNode && <Layers className="w-3 h-3 text-primary" />}
                                    <span>{node.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                </CommandList>
            </Command>
        </div>
    );
}
