'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import posthog from "posthog-js";
import { useReactFlow } from '@xyflow/react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { registry } from '@/lib/registry';
import { POST_ANCHOR_NODE_TYPES } from '@/lib/nodes';
import { useEditorStore } from '@/store/editor';
import { cn, getErrorMessage } from '@/lib/utils';
import { NodeType, SubgraphPort, TSLNodeData } from '@/lib/types';
import { buildGlobalPickerEntries } from '@/lib/global-picker-utils';
import { buildLocalGetQuickCreateEntries } from '@/lib/node-picker-utils';
import { getLocalSetReferenceLabel, isLocalSetNode, resolveNodeOutputTypeById } from '@/lib/local-utils';
import { X, ChevronDown, Search, Code, Plus, Layers, Cloud, Loader2, MoreVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarInput,
} from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Anchor node types that need special handling
const ANCHOR_NODE_TYPES = ['subgraph/input', 'subgraph/output'] as const;

interface CategoryGroupProps {
    title: string;
    children: React.ReactNode;
    count?: number;
    defaultOpen?: boolean;
    forceOpen?: boolean;
}

function CategoryGroup({ title, children, count, defaultOpen = false, forceOpen = false }: CategoryGroupProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const show = forceOpen || isOpen;

    return (
        <SidebarGroup className="py-0">
            <SidebarGroupLabel
                className="w-full justify-between hover:bg-sidebar-accent/50 cursor-pointer h-8 group/label"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-sidebar-foreground/70 group-hover/label:text-sidebar-foreground transition-colors truncate">{title}</span>
                    {typeof count === 'number' && (
                        <span className="inline-flex items-center justify-center rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                            {count}
                        </span>
                    )}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-muted-foreground/70", !show && "-rotate-90")} />
            </SidebarGroupLabel>
            {show && (
                <SidebarGroupContent className="pt-0.5 pb-2">
                    <div className="pl-3 border-l border-sidebar-border/50 ml-2">
                        {children}
                    </div>
                </SidebarGroupContent>
            )}
        </SidebarGroup>
    );
}

interface NodePickerProps {
    onClose?: () => void;
    onOpenCodeNodeDialog?: () => void;
}

function NodePickerComponent({ onClose, onOpenCodeNodeDialog }: NodePickerProps) {
    const addNode = useEditorStore((s) => s.addNode);
    const editorMode = useEditorStore((s) => s.editorMode);
    const activeRootGraph = useEditorStore((s) => s.activeRootGraph);
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const globals = useEditorStore((s) => s.globals);
    const { screenToFlowPosition } = useReactFlow();
    const nodesByCategory = registry.byCategory();
    const [searchQuery, setSearchQuery] = useState('');

    // Check which anchor nodes are present in the current graph
    const hasInputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/input'), [nodes]);
    const hasOutputAnchor = useMemo(() =>
        nodes.some(n => n.data.type === 'subgraph/output'), [nodes]);


    // ==========================================
    // TEMPLATES FROM DATABASE
    // ==========================================

    // Fetch user's saved templates
    const userSubgraphTemplates = useQuery(api.templates.listSubgraphTemplates);
    const userCodeNodeTemplates = useQuery(api.templates.listCodeNodeTemplates);

    // Fetch public/community templates
    const publicSubgraphTemplates = useQuery(api.templates.listPublicSubgraphTemplates);
    const publicCodeNodeTemplates = useQuery(api.templates.listPublicCodeNodeTemplates);

    const getSubgraphScope = useCallback((def: { scope?: string; templateId?: string }) => {
        if (def.scope === 'library' || def.scope === 'project') return def.scope;
        return def.templateId ? 'library' : 'project';
    }, []);

    // Filter user's subgraph templates by search
    const filteredUserSubgraphTemplates = useMemo(() => {
        if (!userSubgraphTemplates) return [];
        const query = searchQuery.toLowerCase();
        return userSubgraphTemplates.filter(
            t => {
                const scope = getSubgraphScope((t.data as { scope?: string; templateId?: string }) || {});
                if (scope === 'project') return false;
                return !query || t.name.toLowerCase().includes(query);
            }
        );
    }, [userSubgraphTemplates, searchQuery, getSubgraphScope]);

    // Filter user's code node templates by search
    const filteredUserCodeNodeTemplates = useMemo(() => {
        if (!userCodeNodeTemplates) return [];
        const query = searchQuery.toLowerCase();
        return userCodeNodeTemplates.filter(
            t => !query || t.name.toLowerCase().includes(query)
        );
    }, [userCodeNodeTemplates, searchQuery]);

    // Filter public subgraph templates by search
    const filteredPublicSubgraphTemplates = useMemo(() => {
        if (!publicSubgraphTemplates) return [];
        const query = searchQuery.toLowerCase();
        return publicSubgraphTemplates.filter(
            t => !query || t.name.toLowerCase().includes(query)
        );
    }, [publicSubgraphTemplates, searchQuery]);

    // Filter public code node templates by search
    const filteredPublicCodeNodeTemplates = useMemo(() => {
        if (!publicCodeNodeTemplates) return [];
        const query = searchQuery.toLowerCase();
        return publicCodeNodeTemplates.filter(
            t => !query || t.name.toLowerCase().includes(query)
        );
    }, [publicCodeNodeTemplates, searchQuery]);

    // Check if we have any templates to show
    const projectSubgraphs = useMemo(() => {
        return Object.values(subgraphs).filter((sg) => getSubgraphScope(sg) === 'project');
    }, [subgraphs, getSubgraphScope]);

    const filteredProjectSubgraphs = useMemo(() => {
        if (!searchQuery) return projectSubgraphs;
        const query = searchQuery.toLowerCase();
        return projectSubgraphs.filter((sg) => sg.name.toLowerCase().includes(query));
    }, [projectSubgraphs, searchQuery]);

    const hasUserTemplates = filteredUserSubgraphTemplates.length > 0 || filteredUserCodeNodeTemplates.length > 0;
    const hasPublicTemplates = filteredPublicSubgraphTemplates.length > 0 || filteredPublicCodeNodeTemplates.length > 0;
    const hasProjectSubgraphs = filteredProjectSubgraphs.length > 0;

    const handleAddNode = useCallback(
        (type: NodeType, data?: Partial<TSLNodeData>) => {
            // Add node at center of current viewport
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            // Add some randomness to avoid stacking
            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            addNode(type, position, data);
        },
        [addNode, screenToFlowPosition]
    );

    // Add subgraph template from database (embeds into store first)
    const addSubgraphDefinition = useEditorStore((s) => s.addSubgraphDefinition);
    const addCodeNodeDefinition = useEditorStore((s) => s.addCodeNodeDefinition);

    const handleAddSubgraphTemplate = useCallback(
        (template: NonNullable<typeof userSubgraphTemplates>[number]) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            const rawId = template.data.id || template._id;
            const subgraphId = rawId.startsWith('custom/') ? rawId : `custom/${rawId}`;
            const existingDefinition = subgraphs[subgraphId];

            // Embed the template definition into the store with template reference
            const definition = {
                ...template.data,
                id: subgraphId,
                templateId: template._id,
                templateVersion: template.version,
                scope: (template.data as { scope?: string })?.scope ?? 'library',
                inputs: template.data.inputs || [],
                outputs: template.data.outputs || [],
                nodes: template.data.nodes || [],
                edges: template.data.edges || [],
            };

            if (!existingDefinition) {
                // First add the definition to the store (using add, not update!)
                addSubgraphDefinition(definition);
            }

            // Then add the node instance
            const definitionForPorts = existingDefinition ?? definition;
            addNode(subgraphId as NodeType, position, {
                dynamicPorts: [...(definitionForPorts.inputs || []), ...(definitionForPorts.outputs || [])],
            });
        },
        [screenToFlowPosition, addNode, addSubgraphDefinition, subgraphs]
    );

    const handleAddProjectSubgraph = useCallback(
        (subgraphId: string, ports: SubgraphPort[]) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            addNode(subgraphId as NodeType, position, {
                dynamicPorts: ports,
            });
        },
        [screenToFlowPosition, addNode]
    );

    const handleAddCodeNodeTemplate = useCallback(
        (template: NonNullable<typeof userCodeNodeTemplates>[number]) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            // Generate a unique ID for this instance in the project
            const instanceId = `${template.data.id || 'code-template'}-${Date.now()}`;

            // Embed the template definition into the store with template reference
            const definition = {
                ...template.data,
                id: instanceId,
                templateId: template._id,
                templateVersion: template.version,
                language: template.data.language ?? 'tsl',
                code: template.data.code || '',
                inputs: template.data.inputs || [],
                output: template.data.output,
            };

            // First add the definition to the store (using add, not update!)
            addCodeNodeDefinition(definition);

            // Then add the node instance
            addNode(instanceId as NodeType, position, {
                dynamicPorts: [...(template.data.inputs || []), template.data.output],
            });
        },
        [screenToFlowPosition, addNode, addCodeNodeDefinition]
    );

    // Delete mutations
    const deleteSubgraphTemplate = useMutation(api.templates.deleteSubgraphTemplate);
    const deleteCodeNodeTemplate = useMutation(api.templates.deleteCodeNodeTemplate);
    const [deletingTemplates, setDeletingTemplates] = useState<Set<string>>(new Set());

    const handleDeleteSubgraphTemplate = useCallback(
        async (templateId: Id<"subgraphTemplates">, templateName: string, e: React.MouseEvent) => {
            e.stopPropagation();
            if (deletingTemplates.has(templateId)) return;

            setDeletingTemplates(prev => new Set(prev).add(templateId));
            try {
                await deleteSubgraphTemplate({ id: templateId });
                toast.success(`Deleted "${templateName}"`);
            } catch (error) {
                console.error('Failed to delete subgraph template:', error);
                const message = getErrorMessage(error);
                toast.error(message);
                posthog.capture('error_occurred', { context: 'delete_subgraph_template', error: message });
            } finally {
                setDeletingTemplates(prev => {
                    const next = new Set(prev);
                    next.delete(templateId);
                    return next;
                });
            }
        },
        [deleteSubgraphTemplate, deletingTemplates]
    );

    const handleDeleteCodeNodeTemplate = useCallback(
        async (templateId: Id<"codeNodeTemplates">, templateName: string, e: React.MouseEvent) => {
            e.stopPropagation();
            if (deletingTemplates.has(templateId)) return;

            setDeletingTemplates(prev => new Set(prev).add(templateId));
            try {
                await deleteCodeNodeTemplate({ id: templateId });
                toast.success(`Deleted "${templateName}"`);
            } catch (error) {
                console.error('Failed to delete code node template:', error);
                const message = getErrorMessage(error);
                toast.error(message);
                posthog.capture('error_occurred', { context: 'delete_code_node_template', error: message });
            } finally {
                setDeletingTemplates(prev => {
                    const next = new Set(prev);
                    next.delete(templateId);
                    return next;
                });
            }
        },
        [deleteCodeNodeTemplate, deletingTemplates]
    );

    // Show custom section if we have the code node dialog button or templates
    const showCustomSection = !!onOpenCodeNodeDialog;

    // Filter nodes by category, handling anchor nodes and material nodes specially
    const filteredNodesByCategory = useMemo(() => {
        const result: Record<string, typeof nodesByCategory[string]> = {};
        const query = searchQuery.toLowerCase();

        for (const [category, categoryNodes] of Object.entries(nodesByCategory)) {
            // In subgraph mode: skip entire Material category
            if (editorMode === 'subgraph' && category === 'Material') {
                continue;
            }

            if (editorMode === 'main' && activeRootGraph === 'material' && (category === 'Post' || category === 'Post FX')) {
                continue;
            }

            if (editorMode === 'main' && activeRootGraph === 'post' && category === 'Material') {
                continue;
            }

            const filtered = categoryNodes.filter(node => {
                // Search filter
                if (query && !node.label.toLowerCase().includes(query)) {
                    return false;
                }

                // Hide loop nodes (created only via toolbar action)
                if (node.type === 'loop' || node.type.startsWith('loop/')) {
                    return false;
                }

                if (editorMode === 'subgraph' && node.type === 'const/uniform') {
                    return false;
                }

                if (editorMode === 'main' && activeRootGraph === 'post' && node.type === 'const/uniform') {
                    return false;
                }

                if ((POST_ANCHOR_NODE_TYPES as readonly string[]).includes(node.type)) {
                    return false;
                }

                if (editorMode === 'main' && activeRootGraph === 'post' && node.type === 'texture/viewportShared') {
                    return false;
                }

                const isAnchorNode = ANCHOR_NODE_TYPES.includes(node.type as typeof ANCHOR_NODE_TYPES[number]);

                if (isAnchorNode) {
                    // In main editor: never show anchor nodes
                    if (editorMode === 'main') return false;

                    // In subgraph edit mode: only show if that anchor is missing
                    if (node.type === 'subgraph/input' && hasInputAnchor) return false;
                    if (node.type === 'subgraph/output' && hasOutputAnchor) return false;
                }

                return true;
            });

            if (filtered.length > 0) {
                // Sort nodes alphabetically by label
                filtered.sort((a, b) => a.label.localeCompare(b.label));
                result[category] = filtered;
            }
        }

        return result;
    }, [nodesByCategory, editorMode, activeRootGraph, hasInputAnchor, hasOutputAnchor, searchQuery]);

    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    const globalPickerEntries = useMemo(() => {
        const entries = buildGlobalPickerEntries(globals);
        if (!normalizedSearchQuery) return entries;
        return entries.filter((entry) => (
            entry.label.toLowerCase().includes(normalizedSearchQuery) ||
            entry.searchText.includes(normalizedSearchQuery)
        ));
    }, [globals, normalizedSearchQuery]);

    const localPickerEntries = useMemo(() => {
        const nodesById = new Map(nodes.map((node) => [node.id, node]));
        const seeds = nodes
            .filter((node) => isLocalSetNode(node))
            .map((setNode) => ({
                id: setNode.id,
                name: getLocalSetReferenceLabel(setNode, nodesById, edges),
                outputType: resolveNodeOutputTypeById(setNode.id, 'out', nodesById, edges, globals, subgraphs),
            }));
        const entries = buildLocalGetQuickCreateEntries(seeds).map((entry) => ({
            pickerKey: entry.key,
            label: entry.label,
            localSourceId: entry.localSourceId,
            searchText: `${entry.label.toLowerCase()} local`,
        }));

        if (!normalizedSearchQuery) return entries;
        return entries.filter((entry) => (
            entry.label.toLowerCase().includes(normalizedSearchQuery) ||
            entry.searchText.includes(normalizedSearchQuery)
        ));
    }, [edges, globals, nodes, normalizedSearchQuery, subgraphs]);

    const categoryEntries = useMemo(() => {
        const entries = Object.entries(filteredNodesByCategory);
        const hasGlobalsCategory = entries.some(([category]) => category === 'Globals');
        if (!hasGlobalsCategory && globalPickerEntries.length > 0) {
            entries.push(['Globals', []]);
        }
        const hasLocalsCategory = entries.some(([category]) => category === 'Locals');
        if (!hasLocalsCategory && localPickerEntries.length > 0) {
            entries.push(['Locals', []]);
        }
        return entries.sort(([catA], [catB]) => catA.localeCompare(catB));
    }, [filteredNodesByCategory, globalPickerEntries, localPickerEntries]);

    // Menu button styles matching shadcn SidebarMenuButton
    const menuButtonStyles = cn(
        'flex w-full items-center gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left text-xs outline-none',
        'ring-sidebar-ring transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:ring-2',
        'text-sidebar-foreground/80'
    );

    return (
        <div className="pointer-events-auto nowheel bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-xl shadow-lg w-52 h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-sidebar-border shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Nodes</h2>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm hover:bg-sidebar-accent transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
                    <SidebarInput
                        placeholder="Search..."
                        className="pl-7 h-8 text-xs bg-sidebar-accent/30 focus:bg-sidebar-accent/50 transition-colors"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {categoryEntries.map(([category, categoryNodes]) => (
                    <CategoryGroup
                        key={category}
                        title={category}
                        count={
                            categoryNodes.length +
                            (category === 'Globals' ? globalPickerEntries.length : 0) +
                            (category === 'Locals' ? localPickerEntries.length : 0)
                        }
                        forceOpen={!!searchQuery}
                    >
                        <SidebarMenu>
                            {category === 'Globals' && globalPickerEntries.map((entry) => (
                                <SidebarMenuItem key={entry.pickerKey}>
                                    <button
                                        onClick={() => handleAddNode('global/ref', { values: { globalId: entry.globalId } })}
                                        className={menuButtonStyles}
                                    >
                                        {entry.label}
                                    </button>
                                </SidebarMenuItem>
                            ))}
                            {category === 'Locals' && localPickerEntries.map((entry) => (
                                <SidebarMenuItem key={entry.pickerKey}>
                                    <button
                                        onClick={() => handleAddNode('local/get', { values: { localSourceId: entry.localSourceId } })}
                                        className={menuButtonStyles}
                                    >
                                        {entry.label}
                                    </button>
                                </SidebarMenuItem>
                            ))}
                            {categoryNodes.map((node) => (
                                <SidebarMenuItem key={node.type}>
                                    <button
                                        onClick={() => handleAddNode(node.type)}
                                        className={menuButtonStyles}
                                    >
                                        {node.label}
                                    </button>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </CategoryGroup>
                ))}

                {/* Custom Nodes Section - User's templates + Community templates */}
                {(showCustomSection || hasProjectSubgraphs || hasUserTemplates || hasPublicTemplates) && (
                    <CategoryGroup
                        title="Custom Nodes"
                        count={
                            filteredProjectSubgraphs.length +
                            filteredUserSubgraphTemplates.length +
                            filteredUserCodeNodeTemplates.length +
                            filteredPublicSubgraphTemplates.length +
                            filteredPublicCodeNodeTemplates.length
                        }
                        forceOpen={!!searchQuery}
                    >
                        <SidebarMenu>
                            {/* Create Node from Code button */}
                            {onOpenCodeNodeDialog && (
                                <SidebarMenuItem>
                                    <button
                                        onClick={onOpenCodeNodeDialog}
                                        className={cn(
                                            menuButtonStyles,
                                            'border border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5 text-primary/70 hover:text-primary gap-2'
                                        )}
                                    >
                                        <Plus className="w-3 h-3" />
                                        <Code className="w-3 h-3" />
                                        Create from Code...
                                    </button>
                                </SidebarMenuItem>
                            )}

                            {/* Loading State */}
                            {(!userSubgraphTemplates || !userCodeNodeTemplates) && (
                                <SidebarMenuItem>
                                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Loading templates...
                                    </div>
                                </SidebarMenuItem>
                            )}

                            {/* Project Subgraphs */}
                            {filteredProjectSubgraphs.length > 0 && (
                                <div className="my-1.5 px-2">
                                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider block">Project</span>
                                </div>
                            )}
                            {filteredProjectSubgraphs.map((subgraph) => (
                                <SidebarMenuItem key={subgraph.id}>
                                    <button
                                        onClick={() => handleAddProjectSubgraph(
                                            subgraph.id,
                                            [...(subgraph.inputs || []), ...(subgraph.outputs || [])]
                                        )}
                                        className={cn(
                                            menuButtonStyles,
                                            'hover:bg-primary/10 text-primary/80 hover:text-primary gap-2'
                                        )}
                                    >
                                        <Layers className="w-3 h-3" />
                                        <span className="truncate flex-1 text-left">{subgraph.name}</span>
                                    </button>
                                </SidebarMenuItem>
                            ))}

                            {hasUserTemplates && (
                                <div className="my-1.5 px-2">
                                    {filteredProjectSubgraphs.length > 0 && <div className="h-px bg-sidebar-border/50" />}
                                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-1 block">Library</span>
                                </div>
                            )}

                            {/* User's Subgraph Templates */}
                            {filteredUserSubgraphTemplates.map((template) => (
                                <SidebarMenuItem key={template._id}>
                                    <div className="flex items-center w-full group">
                                        <button
                                            onClick={() => handleAddSubgraphTemplate(template)}
                                            className={cn(
                                                menuButtonStyles,
                                                'hover:bg-primary/10 text-primary/80 hover:text-primary gap-2 flex-1'
                                            )}
                                        >
                                            <Layers className="w-3 h-3" />
                                            <span className="truncate flex-1 text-left">{template.name}</span>
                                        </button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent rounded transition-opacity"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <MoreVertical className="w-3 h-3 text-muted-foreground" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-32">
                                                <DropdownMenuItem
                                                    variant="destructive"
                                                    onClick={(e) => handleDeleteSubgraphTemplate(template._id, template.name, e)}
                                                    disabled={deletingTemplates.has(template._id)}
                                                >
                                                    <Trash2 className="w-3 h-3 mr-2" />
                                                    {deletingTemplates.has(template._id) ? 'Deleting...' : 'Delete'}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </SidebarMenuItem>
                            ))}

                            {/* User's Code Node Templates */}
                            {filteredUserCodeNodeTemplates.map((template) => (
                                <SidebarMenuItem key={template._id}>
                                    <div className="flex items-center w-full group">
                                        <button
                                            onClick={() => handleAddCodeNodeTemplate(template)}
                                            className={cn(
                                                menuButtonStyles,
                                                'hover:bg-primary/10 text-primary/80 hover:text-primary gap-2 flex-1'
                                            )}
                                        >
                                            <Code className="w-3 h-3" />
                                            <span className="truncate flex-1 text-left">{template.name}</span>
                                        </button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent rounded transition-opacity"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <MoreVertical className="w-3 h-3 text-muted-foreground" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-32">
                                                <DropdownMenuItem
                                                    variant="destructive"
                                                    onClick={(e) => handleDeleteCodeNodeTemplate(template._id, template.name, e)}
                                                    disabled={deletingTemplates.has(template._id)}
                                                >
                                                    <Trash2 className="w-3 h-3 mr-2" />
                                                    {deletingTemplates.has(template._id) ? 'Deleting...' : 'Delete'}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </SidebarMenuItem>
                            ))}

                            {/* Divider if we have both user and public templates */}
                            {hasUserTemplates && hasPublicTemplates && (
                                <div className="my-1.5 px-2">
                                    <div className="h-px bg-sidebar-border/50" />
                                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-1 block">Community</span>
                                </div>
                            )}

                            {/* Public Subgraph Templates */}
                            {filteredPublicSubgraphTemplates.map((template) => (
                                <SidebarMenuItem key={template._id}>
                                    <button
                                        onClick={() => handleAddSubgraphTemplate(template)}
                                        className={cn(
                                            menuButtonStyles,
                                            'hover:bg-green-500/10 text-green-500/80 hover:text-green-500 gap-2'
                                        )}
                                    >
                                        <Cloud className="w-3 h-3" />
                                        <Layers className="w-3 h-3" />
                                        {template.name}
                                    </button>
                                </SidebarMenuItem>
                            ))}

                            {/* Public Code Node Templates */}
                            {filteredPublicCodeNodeTemplates.map((template) => (
                                <SidebarMenuItem key={template._id}>
                                    <button
                                        onClick={() => handleAddCodeNodeTemplate(template)}
                                        className={cn(
                                            menuButtonStyles,
                                            'hover:bg-green-500/10 text-green-500/80 hover:text-green-500 gap-2'
                                        )}
                                    >
                                        <Cloud className="w-3 h-3" />
                                        <Code className="w-3 h-3" />
                                        {template.name}
                                    </button>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </CategoryGroup>
                )}
            </div>
        </div>
    );
}

export const NodePicker = memo(NodePickerComponent);
