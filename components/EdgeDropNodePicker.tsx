'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import {
    buildLocalGetQuickCreateEntries,
    getAllNodesButExclud,
    getGroupedCompatibleNodes,
    getHandleDisplayLabel,
    getTypeMatchRank,
    getVisibleInputHandles,
    getVisibleOutputHandles,
    type PickerHandle,
} from '@/lib/node-picker-utils';
import { NodeType, Port, TSLType } from '@/lib/types';
import { getMultiOpParams } from '@/lib/multi-op';
import { buildGlobalPickerEntries } from '@/lib/global-picker-utils';
import { getLocalSetReferenceLabel, getValidLocalSetNodesForGetNode, isLocalSetNode, resolveNodeOutputTypeById } from '@/lib/local-utils';
import { Code, Layers } from 'lucide-react';
import { useEditorStore } from '@/store/editor';
import { MATERIAL_NODE_TYPES, POST_ANCHOR_NODE_TYPES, POST_FX_NODE_TYPES } from '@/lib/nodes';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useTemplateLibrary } from '@/lib/editor-host/template-library';

export const MULTI_OP_INPUT_HANDLE_PREFIX = 'multiop:param:';
const SUBGRAPH_ANCHOR_NODE_TYPES = ['subgraph/input', 'subgraph/output'] as const;

const getSubgraphScope = (def: { scope?: string; templateId?: string }) => {
    if (def.scope === 'library' || def.scope === 'project') return def.scope;
    return def.templateId ? 'library' : 'project';
};

const getTemplateSubgraphId = (template: { _id: string; data?: unknown }) => {
    const data = (template.data ?? {}) as { id?: string };
    const rawId = typeof data.id === 'string' && data.id.trim().length > 0 ? data.id : template._id;
    return rawId.startsWith('custom/') ? rawId : `custom/${rawId}`;
};

export interface EdgeDropSelection {
    nodeType: NodeType;
    handleId: string | null;
    globalId?: string;
    localSourceId?: string;
}

interface EdgeDropNodePickerProps {
    position: { x: number; y: number };
    flowPosition: { x: number; y: number };
    sourceDataType: TSLType | '';
    sourceNodeId: string | null;
    handleDirection: 'input' | 'output' | null;
    onNodeSelect: (selection: EdgeDropSelection) => void;
    onClose: () => void;
}

interface EdgeDropPickerNode {
    type: NodeType;
    label: string;
    category: string;
    inputs?: Record<string, Port>;
    outputs?: Record<string, Port>;
    isCodeNode?: boolean;
    isSubgraphNode?: boolean;
    isGlobalRefNode?: boolean;
    localSourceId?: string;
    globalId?: string;
    pickerKey?: string;
    searchText?: string;
}

interface EdgeDropHandleRow {
    key: string;
    category: string;
    nodeType: NodeType;
    nodeLabel: string;
    handleId: string;
    handleLabel: string;
    displayLabel: string;
    matchRank: number;
    isCodeNode?: boolean;
    isSubgraphNode?: boolean;
    isGlobalRefNode?: boolean;
    localSourceId?: string;
    globalId?: string;
    searchText?: string;
    globalOrder: number;
}

function getNodeHandles(node: EdgeDropPickerNode, direction: 'input' | 'output'): PickerHandle[] {
    if (direction === 'output') {
        if (node.type === 'math/multiOp') {
            return getMultiOpParams('add', true).map((param) => ({
                id: `${MULTI_OP_INPUT_HANDLE_PREFIX}${param.key}`,
                label: param.label,
                type: param.type,
            }));
        }
        return getVisibleInputHandles(node.inputs as Record<string, Port> | undefined);
    }
    return getVisibleOutputHandles(node.outputs as Record<string, Port> | undefined);
}

export function EdgeDropNodePicker({
    position,
    flowPosition,
    sourceDataType,
    sourceNodeId,
    handleDirection,
    onNodeSelect,
    onClose,
}: EdgeDropNodePickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const editorMode = useEditorStore((s) => s.editorMode);
    const activeRootGraph = useEditorStore((s) => s.activeRootGraph);

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

    const { userCodeNodeTemplates, userSubgraphTemplates } = useTemplateLibrary();
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const globals = useEditorStore((s) => s.globals);

    const clipboard = useEditorStore((s) => s.clipboard);
    const pasteSelection = useEditorStore((s) => s.pasteSelection);

    const filteredRegistryNodes = useMemo(() => {
        const excludedNodes: NodeType[] = editorMode === "main" ? ["loop"] : ["loop", "const/uniform"];

        const shouldExclude = (type: NodeType) => {
            if (type === 'loop' || type.startsWith('loop/')) return true;
            if ((SUBGRAPH_ANCHOR_NODE_TYPES as readonly string[]).includes(type)) return true;
            if ((POST_ANCHOR_NODE_TYPES as readonly string[]).includes(type)) return true;
            if (activeRootGraph === 'post' && (MATERIAL_NODE_TYPES as readonly string[]).includes(type)) return true;
            if (activeRootGraph === 'post' && type === 'texture/viewportShared') return true;
            if (activeRootGraph === 'post' && type === 'const/uniform') return true;
            if (activeRootGraph === 'material' && (POST_FX_NODE_TYPES as readonly string[]).includes(type)) return true;
            return false;
        };

        return getAllNodesButExclud(excludedNodes).filter((node) => {
            if (handleDirection !== 'output' && node.type === 'local/get') {
                return false;
            }
            return !shouldExclude(node.type);
        });
    }, [editorMode, activeRootGraph, handleDirection]);

    // Build code nodes from templates (fetched from server, cached by Convex)
    const codeNodes = useMemo((): EdgeDropPickerNode[] => {
        return userCodeNodeTemplates
            .map(template => {
                const data = template.data as {
                    id: string;
                    language?: string;
                    inputs: Array<{ id: string; label: string; type: string }>;
                    output?: { id: string; label: string; type: string };
                };
                const outputId = data.output?.id || 'out';
                const outputLabel = data.output?.label || 'Out';
                const outputType = (data.output?.type || 'any') as TSLType;
                return {
                    type: `code/${template._id}` as NodeType,
                    label: template.name,
                    category: 'Custom' as const,
                    isCodeNode: true,
                    inputs: (data.inputs || []).reduce((acc, inp) => {
                        acc[inp.id] = { label: inp.label, type: inp.type as TSLType };
                        return acc;
                    }, {} as Record<string, { label: string; type: TSLType }>),
                    outputs: { [outputId]: { label: outputLabel, type: outputType } },
                };
            });
    }, [userCodeNodeTemplates]);

    // Build subgraph nodes from templates (fetched from server, cached by Convex)
    const subgraphTemplateNodes = useMemo((): EdgeDropPickerNode[] => {
        return userSubgraphTemplates
            .filter(template => {
                const scope = getSubgraphScope((template.data as { scope?: string; templateId?: string }) || {});
                if (scope === 'project') return false;
                const localSubgraph = subgraphs[getTemplateSubgraphId(template)];
                if (localSubgraph && getSubgraphScope(localSubgraph) === 'project') return false;
                return true;
            })
            .map(template => {
                const data = template.data as {
                    id: string;
                    inputs: Array<{ id: string; label: string; type: string }>;
                    outputs: Array<{ id: string; label: string; type: string }>;
                };
                return {
                    type: `subgraph/${template._id}` as NodeType,
                    label: template.name,
                    category: 'Custom' as const,
                    isSubgraphNode: true,
                    inputs: (data.inputs || []).reduce((acc, inp) => {
                        acc[inp.id] = { label: inp.label, type: inp.type as TSLType };
                        return acc;
                    }, {} as Record<string, { label: string; type: TSLType }>),
                    outputs: (data.outputs || []).reduce((acc, out) => {
                        acc[out.id] = { label: out.label, type: out.type as TSLType };
                        return acc;
                    }, {} as Record<string, { label: string; type: TSLType }>),
                };
            });
    }, [subgraphs, userSubgraphTemplates]);

    const userSubgraphTemplateIds = useMemo(
        () => new Set(userSubgraphTemplates.map((template) => template._id)),
        [userSubgraphTemplates]
    );

    const projectSubgraphNodes = useMemo((): EdgeDropPickerNode[] => {
        return Object.values(subgraphs)
            .filter(sg => getSubgraphScope(sg) === 'project')
            .map((sg) => ({
                type: sg.id as NodeType,
                label: sg.name,
                category: 'Custom' as const,
                isSubgraphNode: true,
                inputs: sg.inputs.reduce((acc, inp) => {
                    acc[inp.id] = { label: inp.label, type: inp.type as TSLType };
                    return acc;
                }, {} as Record<string, { label: string; type: TSLType }>),
                outputs: sg.outputs.reduce((acc, out) => {
                    acc[out.id] = { label: out.label, type: out.type as TSLType };
                    return acc;
                }, {} as Record<string, { label: string; type: TSLType }>),
            }));
    }, [subgraphs]);

    const embeddedLibrarySubgraphNodes = useMemo((): EdgeDropPickerNode[] => {
        return Object.values(subgraphs)
            .filter((sg) => {
                if (getSubgraphScope(sg) !== 'library') return false;
                if (!sg.templateId) return true;
                return !userSubgraphTemplateIds.has(sg.templateId);
            })
            .map((sg) => ({
                type: sg.id as NodeType,
                label: sg.name,
                category: 'Custom' as const,
                isSubgraphNode: true,
                inputs: sg.inputs.reduce((acc, inp) => {
                    acc[inp.id] = { label: inp.label, type: inp.type as TSLType };
                    return acc;
                }, {} as Record<string, { label: string; type: TSLType }>),
                outputs: sg.outputs.reduce((acc, out) => {
                    acc[out.id] = { label: out.label, type: out.type as TSLType };
                    return acc;
                }, {} as Record<string, { label: string; type: TSLType }>),
            }));
    }, [subgraphs, userSubgraphTemplateIds]);

    const globalRefNodes = useMemo((): EdgeDropPickerNode[] => {
        return buildGlobalPickerEntries(globals).map((entry) => ({
            type: 'global/ref',
            label: entry.label,
            category: 'Globals',
            outputs: {
                out: { label: entry.label, type: entry.outputType },
            },
            isGlobalRefNode: true,
            globalId: entry.globalId,
            pickerKey: entry.pickerKey,
            searchText: entry.searchText,
        }));
    }, [globals]);

    const localGetQuickNodes = useMemo((): EdgeDropPickerNode[] => {
        if (handleDirection === 'output') return [];

        const nodesById = new Map(nodes.map((node) => [node.id, node]));
        const targetNode = sourceNodeId ? nodesById.get(sourceNodeId) : null;
        const scopedSets = targetNode
            ? getValidLocalSetNodesForGetNode(targetNode, nodesById)
            : nodes.filter((node) => isLocalSetNode(node));

        const localSeeds = scopedSets
            .filter((setNode) => isLocalSetNode(setNode))
            .map((setNode) => ({
                id: setNode.id,
                name: getLocalSetReferenceLabel(setNode, nodesById, edges),
                outputType: resolveNodeOutputTypeById(setNode.id, 'out', nodesById, edges, globals, subgraphs),
            }));

        const quickEntries = buildLocalGetQuickCreateEntries(localSeeds);
        return quickEntries.map((entry) => ({
            type: 'local/get',
            label: entry.label,
            category: 'Locals',
            outputs: {
                out: { label: 'Out', type: entry.outputType },
            },
            localSourceId: entry.localSourceId,
            pickerKey: entry.key,
            searchText: `local ${entry.label.toLowerCase()}`,
        }));
    }, [edges, globals, handleDirection, nodes, sourceNodeId, subgraphs]);

    const allNodes = useMemo((): EdgeDropPickerNode[] => {
        return [
            ...localGetQuickNodes,
            ...globalRefNodes,
            ...(filteredRegistryNodes as EdgeDropPickerNode[]),
            ...projectSubgraphNodes,
            ...embeddedLibrarySubgraphNodes,
            ...subgraphTemplateNodes,
            ...codeNodes,
        ];
    }, [localGetQuickNodes, globalRefNodes, filteredRegistryNodes, projectSubgraphNodes, embeddedLibrarySubgraphNodes, subgraphTemplateNodes, codeNodes]);

    const groupedNodes = useMemo(() => {
        return getGroupedCompatibleNodes<EdgeDropPickerNode>(allNodes);
    }, [allNodes]);

    const groupedHandleRows = useMemo(() => {
        if (!handleDirection) return {} as Record<string, EdgeDropHandleRow[]>;

        const grouped: Record<string, EdgeDropHandleRow[]> = {};

        for (const node of allNodes) {
            const handles = getNodeHandles(node, handleDirection);
            if (handles.length === 0) continue;

            for (const handle of handles) {
                const nodePickerKey = node.pickerKey ?? node.type;
                const isGenericGlobal = node.type === 'global/ref' && !node.isGlobalRefNode;
                const row: EdgeDropHandleRow = {
                    key: `${nodePickerKey}::${handle.id}`,
                    category: node.category,
                    nodeType: node.type as NodeType,
                    nodeLabel: node.label,
                    handleId: handle.id,
                    handleLabel: handle.label,
                    displayLabel: getHandleDisplayLabel(node.label, handle.label, handles.length),
                    matchRank: getTypeMatchRank(handle.type, sourceDataType),
                    isCodeNode: node.isCodeNode,
                    isSubgraphNode: node.isSubgraphNode,
                    isGlobalRefNode: node.isGlobalRefNode,
                    localSourceId: node.localSourceId,
                    globalId: node.globalId,
                    searchText: node.searchText,
                    globalOrder: isGenericGlobal ? 1 : 0,
                };
                (grouped[node.category] ??= []).push(row);
            }
        }

        for (const rows of Object.values(grouped)) {
            rows.sort((a, b) => (
                a.matchRank - b.matchRank ||
                a.globalOrder - b.globalOrder ||
                a.displayLabel.localeCompare(b.displayLabel)
            ));
        }

        return grouped;
    }, [allNodes, handleDirection, sourceDataType]);

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

    const showPaste = !sourceDataType && !handleDirection && !!clipboard?.nodes?.length;

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
                    <CommandEmpty>{handleDirection ? 'No nodes or handles found.' : 'No nodes found.'}</CommandEmpty>
                    {showPaste && (
                        <CommandGroup heading="Actions">
                            <CommandItem
                                value="Paste"
                                onSelect={() => {
                                    pasteSelection(flowPosition);
                                    onClose();
                                }}
                                className="gap-2"
                            >
                                <span>Paste</span>
                            </CommandItem>
                        </CommandGroup>
                    )}
                    {!handleDirection && Object.entries(groupedNodes).map(([category, nodes]) => (
                        <CommandGroup key={category} heading={category}>
                            {nodes.map((node) => (
                                <CommandItem
                                    key={node.pickerKey ?? node.type}
                                    value={node.searchText ? `${node.label} ${node.searchText}` : node.label}
                                    onSelect={() => onNodeSelect({
                                        nodeType: node.type as NodeType,
                                        handleId: null,
                                        globalId: node.globalId,
                                        localSourceId: node.localSourceId,
                                    })}
                                    className="gap-2"
                                >
                                    {node.isCodeNode && <Code className="w-3 h-3 text-primary" />}
                                    {node.isSubgraphNode && <Layers className="w-3 h-3 text-primary" />}
                                    <span>{node.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                    {!!handleDirection && Object.entries(groupedHandleRows).map(([category, rows]) => (
                        <CommandGroup key={category} heading={category}>
                            {rows.map((row) => (
                                <CommandItem
                                    key={row.key}
                                    value={`${row.displayLabel} ${row.nodeLabel} ${row.handleLabel} ${row.searchText ?? ''}`}
                                    onSelect={() => onNodeSelect({
                                        nodeType: row.nodeType,
                                        handleId: row.handleId,
                                        globalId: row.globalId,
                                        localSourceId: row.localSourceId,
                                    })}
                                    className="gap-2"
                                >
                                    {row.isCodeNode && <Code className="w-3 h-3 text-primary" />}
                                    {row.isSubgraphNode && <Layers className="w-3 h-3 text-primary" />}
                                    <span>{row.displayLabel}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                </CommandList>
            </Command>
        </div>
    );
}
