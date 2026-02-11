'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { getCompatibleNodes, getNodesWithOutputType, getGroupedCompatibleNodes, getAllNodes } from '@/lib/node-picker-utils';
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
    handleDirection: 'input' | 'output' | null;
    onNodeSelect: (nodeType: NodeType) => void;
    onClose: () => void;
}

interface CodeNodeDef extends Omit<NodeDef, 'tsl'> {
    isCodeNode: true;
    tsl: string;
}

interface SubgraphNodeDef extends Omit<NodeDef, 'tsl'> {
    isSubgraphNode: true;
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
        const handleClickOutside = (event: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        // Delay attaching to avoid immediate closing if triggered by click
        const timeout = setTimeout(() => {
            // Use capture phase to intercept before any stopPropagation calls
            document.addEventListener('pointerdown', handleClickOutside, true);
        }, 100);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('pointerdown', handleClickOutside, true);
        };
    }, [onClose]);

    // Fetch user's code node templates from server (cached by Convex)
    const userCodeNodeTemplates = useQuery(api.templates.listCodeNodeTemplates);
    // Fetch user's subgraph templates from server (cached by Convex)
    const userSubgraphTemplates = useQuery(api.templates.listSubgraphTemplates);

    // Get compatible nodes
    const compatibleNodes = useMemo(() => {
        if (!sourceDataType && !handleDirection) {
            return getAllNodes();
        }
        if (!sourceDataType) {
            return handleDirection === 'output'
                ? getCompatibleNodes(sourceDataType as string)
                : getNodesWithOutputType(sourceDataType as string);
        } else {
            // Case where sourceDataType is provided
            return handleDirection === 'output'
                ? getCompatibleNodes(sourceDataType)
                : getNodesWithOutputType(sourceDataType);
        }
    }, [sourceDataType, handleDirection])



    // Build code nodes from templates (fetched from server, cached by Convex)
    const compatibleCodeNodes = useMemo((): CodeNodeDef[] => {
        if (!userCodeNodeTemplates) return [];

        // Code nodes always have 'any' type for inputs/output, so they're compatible with everything
        return userCodeNodeTemplates.map(template => {
            const data = template.data as {
                id: string;
                inputs: Array<{ id: string; label: string; type: string }>;
                output: { label: string; type: string };
            };
            return {
                type: `code/${template._id}` as NodeType,
                label: template.name,
                category: 'Custom' as const,
                isCodeNode: true as const,
                inputs: data.inputs.reduce((acc, inp) => {
                    acc[inp.id] = { label: inp.label, type: inp.type as TSLType };
                    return acc;
                }, {} as Record<string, { label: string; type: TSLType }>),
                outputs: { out: { label: data.output.label, type: data.output.type as TSLType } },
                tsl: data.id, // Use the code node ID as TSL reference
            };
        });
    }, [userCodeNodeTemplates]);

    // Build subgraph nodes from templates (fetched from server, cached by Convex)
    const compatibleSubgraphNodes = useMemo((): SubgraphNodeDef[] => {
        if (!userSubgraphTemplates) return [];

        return userSubgraphTemplates.map(template => {
            const data = template.data as {
                id: string;
                inputs: Array<{ id: string; label: string; type: string }>;
                outputs: Array<{ id: string; label: string; type: string }>;
            };
            return {
                type: `subgraph/${template._id}` as NodeType,
                label: template.name,
                category: 'Custom' as const,
                isSubgraphNode: true as const,
                inputs: data.inputs.reduce((acc, inp) => {
                    acc[inp.id] = { label: inp.label, type: inp.type as TSLType };
                    return acc;
                }, {} as Record<string, { label: string; type: TSLType }>),
                outputs: data.outputs.reduce((acc, out) => {
                    acc[out.id] = { label: out.label, type: out.type as TSLType };
                    return acc;
                }, {} as Record<string, { label: string; type: TSLType }>),
                tsl: data.id,
            };
        });
    }, [userSubgraphTemplates]);

    const groupedNodes = useMemo(() => {
        const grouped = getGroupedCompatibleNodes(compatibleNodes);

        // Add custom nodes to Custom category
        const customNodes: (CodeNodeDef | SubgraphNodeDef)[] = [
            ...compatibleSubgraphNodes,
            ...compatibleCodeNodes,
        ];
        if (customNodes.length > 0) {
            grouped['Custom'] = [...(grouped['Custom'] || []), ...customNodes];
        }

        return grouped;
    }, [compatibleNodes, compatibleCodeNodes, compatibleSubgraphNodes]);

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
            <Command
                className="rounded-lg border shadow-md"
                filter={(value, search) => {
                    // Use case-insensitive substring matching instead of fuzzy matching
                    if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                    return 0;
                }}
            >
                <CommandInput placeholder="Search nodes..." autoFocus />
                <CommandList className="max-h-[300px]">
                    <CommandEmpty>No compatible nodes found.</CommandEmpty>
                    {Object.entries(groupedNodes).map(([category, nodes]) => (
                        <CommandGroup key={category} heading={category}>
                            {nodes.map((node) => (
                                <CommandItem
                                    key={node.type}
                                    value={node.label}
                                    onSelect={() => onNodeSelect(node.type as NodeType)}
                                    className="gap-2"
                                >
                                    {(node as { isCodeNode?: boolean }).isCodeNode && <Code className="w-3 h-3 text-primary" />}
                                    {(node as { isSubgraphNode?: boolean }).isSubgraphNode && <Layers className="w-3 h-3 text-primary" />}
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
