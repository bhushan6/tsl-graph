'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import posthog from "posthog-js";
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEditorStore } from '@/store/editor';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

interface StaleTemplate {
    id: string;
    name: string;
    templateId: string;
    currentVersion: number;
    latestVersion: number;
    type: 'subgraph' | 'codeNode';
}

interface CloneableTemplate {
    id: string;
    name: string;
    originalTemplateId: string;
    type: 'subgraph' | 'codeNode';
}

export function StaleTemplatesNotification() {
    const [staleTemplates, setStaleTemplates] = useState<StaleTemplate[]>([]);
    const [cloneableTemplates, setCloneableTemplates] = useState<CloneableTemplate[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [dismissedCloneable, setDismissedCloneable] = useState<Set<string>>(new Set());
    const [updating, setUpdating] = useState<Set<string>>(new Set());
    const [cloning, setCloning] = useState<Set<string>>(new Set());
    const convex = useConvex();

    // Get embedded definitions and nodes from store
    const nodes = useEditorStore((s) => s.nodes);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);
    const updateSubgraphDefinition = useEditorStore((s) => s.updateSubgraphDefinition);
    const updateCodeNode = useEditorStore((s) => s.updateCodeNode);

    // Mutations for cloning
    const createSubgraphTemplate = useMutation(api.templates.createSubgraphTemplate);
    const createCodeNodeTemplate = useMutation(api.templates.createCodeNodeTemplate);

    // Query user's existing templates to avoid duplicate clones
    const userSubgraphTemplates = useQuery(api.templates.listSubgraphTemplates);
    const userCodeNodeTemplates = useQuery(api.templates.listCodeNodeTemplates);

    // Build sets of template names the user already owns
    const userOwnedSubgraphNames = useMemo(() => new Set(
        (userSubgraphTemplates || []).map(t => t.name.toLowerCase())
    ), [userSubgraphTemplates]);
    const userOwnedCodeNodeNames = useMemo(() => new Set(
        (userCodeNodeTemplates || []).map(t => t.name.toLowerCase())
    ), [userCodeNodeTemplates]);

    // Get the set of subgraph/code node types actually used in the current graph
    const usedSubgraphIds = useMemo(() => new Set(
        nodes
            .filter(n => n.data.type.startsWith('custom/'))
            .map(n => n.data.type)
    ), [nodes]);
    const usedCodeNodeIds = useMemo(() => new Set(
        nodes
            .filter(n => n.data.type.startsWith('code/'))
            .map(n => n.data.type)
    ), [nodes]);

    // Only collect template IDs for definitions that are actually used in the graph
    // Also deduplicate by templateId
    const subgraphTemplateIds = [...new Set(
        Object.values(subgraphs)
            .filter(sg => sg.templateId && usedSubgraphIds.has(sg.id))
            .map(sg => sg.templateId as Id<"subgraphTemplates">)
    )];

    const codeNodeTemplateIds = [...new Set(
        Object.values(codeNodes)
            .filter(cn => cn.templateId && usedCodeNodeIds.has(cn.id))
            .map(cn => cn.templateId as Id<"codeNodeTemplates">)
    )];

    // Query latest versions from DB
    const subgraphVersions = useQuery(
        api.templates.getSubgraphTemplateVersions,
        subgraphTemplateIds.length > 0 ? { ids: subgraphTemplateIds } : 'skip'
    );

    const codeNodeVersions = useQuery(
        api.templates.getCodeNodeTemplateVersions,
        codeNodeTemplateIds.length > 0 ? { ids: codeNodeTemplateIds } : 'skip'
    );

    // Check for stale and cloneable templates when versions are loaded
    useEffect(() => {
        const stale: StaleTemplate[] = [];
        const cloneable: CloneableTemplate[] = [];
        const seenTemplateIds = new Set<string>();

        // Check subgraphs - only those used in the graph
        if (subgraphVersions) {
            for (const sg of Object.values(subgraphs)) {
                // Skip if not used in graph
                if (!usedSubgraphIds.has(sg.id)) continue;
                // Skip if no template reference
                if (!sg.templateId || !sg.templateVersion) continue;
                // Skip if we've already processed this templateId (deduplication)
                if (seenTemplateIds.has(sg.templateId)) continue;
                seenTemplateIds.add(sg.templateId);

                const latest = subgraphVersions[sg.templateId];

                if (latest === null || !latest.isOwned) {
                    // Template doesn't exist or user doesn't own it
                    // Check if user already has a template with the same name (already cloned)
                    if (!userOwnedSubgraphNames.has(sg.name.toLowerCase())) {
                        cloneable.push({
                            id: sg.id,
                            name: sg.name,
                            originalTemplateId: sg.templateId,
                            type: 'subgraph',
                        });
                    }
                } else if (latest.isOwned && latest.version > sg.templateVersion) {
                    // User owns template but it's outdated - offer to update
                    stale.push({
                        id: sg.id,
                        name: sg.name,
                        templateId: sg.templateId,
                        currentVersion: sg.templateVersion,
                        latestVersion: latest.version,
                        type: 'subgraph',
                    });
                }
            }
        }

        // Check code nodes - only those used in the graph
        if (codeNodeVersions) {
            for (const cn of Object.values(codeNodes)) {
                // Skip if not used in graph
                if (!usedCodeNodeIds.has(cn.id)) continue;
                // Skip if no template reference
                if (!cn.templateId || !cn.templateVersion) continue;
                // Skip if we've already processed this templateId (deduplication)
                if (seenTemplateIds.has(cn.templateId)) continue;
                seenTemplateIds.add(cn.templateId);

                const latest = codeNodeVersions[cn.templateId];

                if (latest === null || !latest.isOwned) {
                    // Template doesn't exist or user doesn't own it
                    // Check if user already has a template with the same name (already cloned)
                    if (!userOwnedCodeNodeNames.has(cn.name.toLowerCase())) {
                        cloneable.push({
                            id: cn.id,
                            name: cn.name,
                            originalTemplateId: cn.templateId,
                            type: 'codeNode',
                        });
                    }
                } else if (latest.isOwned && latest.version > cn.templateVersion) {
                    // User owns template but it's outdated - offer to update
                    stale.push({
                        id: cn.id,
                        name: cn.name,
                        templateId: cn.templateId,
                        currentVersion: cn.templateVersion,
                        latestVersion: latest.version,
                        type: 'codeNode',
                    });
                }
            }
        }

        setStaleTemplates(stale);
        setCloneableTemplates(cloneable);
    }, [subgraphs, codeNodes, subgraphVersions, codeNodeVersions, usedSubgraphIds, usedCodeNodeIds, userOwnedSubgraphNames, userOwnedCodeNodeNames]);

    // Handle update - fetch latest template and update embedded definition
    const handleUpdate = useCallback(async (template: StaleTemplate) => {
        setUpdating(prev => new Set(prev).add(template.id));

        try {
            if (template.type === 'subgraph') {
                // Fetch the latest template data
                const latestTemplate = await convex.query(api.templates.getSubgraphTemplate, {
                    id: template.templateId as Id<"subgraphTemplates">,
                });

                if (latestTemplate?.data) {
                    // Update the embedded definition, keeping the local ID
                    updateSubgraphDefinition(template.id, {
                        ...latestTemplate.data,
                        id: template.id, // Keep the local embedded ID
                        templateId: template.templateId,
                        templateVersion: latestTemplate.version,
                    });
                }
            } else {
                // Fetch the latest code node template
                const latestTemplate = await convex.query(api.templates.getCodeNodeTemplate, {
                    id: template.templateId as Id<"codeNodeTemplates">,
                });

                if (latestTemplate?.data) {
                    updateCodeNode(template.id, {
                        ...latestTemplate.data,
                        id: template.id,
                        templateId: template.templateId,
                        templateVersion: latestTemplate.version,
                    });
                }
            }

            // Dismiss after successful update
            setDismissed(prev => new Set(prev).add(template.id));
        } catch (error) {
            console.error('Failed to update template:', error);
            const message = getErrorMessage(error);
            toast.error(message);
            posthog.capture('error_occurred', { context: 'clone_template_failed', error: message });
        } finally {
            setUpdating(prev => {
                const next = new Set(prev);
                next.delete(template.id);
                return next;
            });
        }
    }, [convex, updateSubgraphDefinition, updateCodeNode]);

    // Handle clone - create a new template in user's DB from embedded definition
    const handleClone = useCallback(async (template: CloneableTemplate) => {
        setCloning(prev => new Set(prev).add(template.id));

        try {
            if (template.type === 'subgraph') {
                const embeddedSubgraph = subgraphs[template.id];
                if (!embeddedSubgraph) {
                    throw new Error('Subgraph not found');
                }

                // Create new template from embedded data
                // Include all fields so NodePicker can properly instantiate it
                const result = await createSubgraphTemplate({
                    name: embeddedSubgraph.name,
                    data: {
                        id: embeddedSubgraph.id,
                        name: embeddedSubgraph.name,
                        inputs: embeddedSubgraph.inputs,
                        outputs: embeddedSubgraph.outputs,
                        nodes: embeddedSubgraph.nodes,
                        edges: embeddedSubgraph.edges,
                        inputNodePosition: embeddedSubgraph.inputNodePosition,
                        outputNodePosition: embeddedSubgraph.outputNodePosition,
                        createdAt: embeddedSubgraph.createdAt,
                        updatedAt: embeddedSubgraph.updatedAt,
                    },
                });

                // Update embedded definition with new template reference
                updateSubgraphDefinition(template.id, {
                    templateId: result.templateId,
                    templateVersion: result.version,
                });
            } else {
                const embeddedCodeNode = codeNodes[template.id];
                if (!embeddedCodeNode) {
                    throw new Error('Code node not found');
                }

                // Create new template from embedded data
                // Include all fields so NodePicker can properly instantiate it
                const result = await createCodeNodeTemplate({
                    name: embeddedCodeNode.name,
                    data: {
                        id: embeddedCodeNode.id,
                        name: embeddedCodeNode.name,
                        code: embeddedCodeNode.code,
                        inputs: embeddedCodeNode.inputs,
                        output: embeddedCodeNode.output,
                        createdAt: embeddedCodeNode.createdAt,
                        updatedAt: embeddedCodeNode.updatedAt,
                    },
                });

                // Update embedded definition with new template reference
                updateCodeNode(template.id, {
                    templateId: result.templateId,
                    templateVersion: result.version,
                });
            }

            // Dismiss after successful clone
            setDismissedCloneable(prev => new Set(prev).add(template.id));
            toast.success(`Cloned "${template.name}" to your library`);
        } catch (error) {
            console.error('Failed to clone template:', error);
            const message = getErrorMessage(error);
            toast.error(message);
            posthog.capture('error_occurred', { context: 'clone_template_failed', error: message });
        } finally {
            setCloning(prev => {
                const next = new Set(prev);
                next.delete(template.id);
                return next;
            });
        }
    }, [subgraphs, codeNodes, createSubgraphTemplate, createCodeNodeTemplate, updateSubgraphDefinition, updateCodeNode]);

    const handleDismiss = useCallback((templateId: string) => {
        setDismissed(prev => new Set(prev).add(templateId));
    }, []);

    const handleDismissCloneable = useCallback((templateId: string) => {
        setDismissedCloneable(prev => new Set(prev).add(templateId));
    }, []);

    // Filter out dismissed templates
    const visibleStale = staleTemplates.filter(t => !dismissed.has(t.id));
    const visibleCloneable = cloneableTemplates.filter(t => !dismissedCloneable.has(t.id));

    const handleDismissAll = useCallback(() => {
        setDismissed(new Set(staleTemplates.map(t => t.id)));
    }, [staleTemplates]);

    const handleDismissAllCloneable = useCallback(() => {
        setDismissedCloneable(new Set(cloneableTemplates.map(t => t.id)));
    }, [cloneableTemplates]);

    const handleUpdateAll = useCallback(async () => {
        const promises = visibleStale.map(t => handleUpdate(t));
        await Promise.all(promises);
    }, [visibleStale, handleUpdate]);

    const handleCloneAll = useCallback(async () => {
        const promises = visibleCloneable.map(t => handleClone(t));
        await Promise.all(promises);
    }, [visibleCloneable, handleClone]);

    const isUpdatingAny = updating.size > 0;
    const isCloningAny = cloning.size > 0;
    const showUpdateAll = visibleStale.length >= 2;
    const showCloneAll = visibleCloneable.length >= 2;

    // Minimized state buttons when all dismissed
    const minimizedButtons = [];

    if (staleTemplates.length > 0 && visibleStale.length === 0) {
        minimizedButtons.push(
            <Button
                key="stale"
                variant="outline"
                size="sm"
                className="h-8 gap-2 bg-background/95 backdrop-blur shadow-lg border-orange-500/30 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                onClick={() => setDismissed(new Set())}
            >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{staleTemplates.length} Updates Available</span>
            </Button>
        );
    }

    if (cloneableTemplates.length > 0 && visibleCloneable.length === 0) {
        minimizedButtons.push(
            <Button
                key="cloneable"
                variant="outline"
                size="sm"
                className="h-8 gap-2 bg-background/95 backdrop-blur shadow-lg border-blue-500/30 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={() => setDismissedCloneable(new Set())}
            >
                <Copy className="w-3.5 h-3.5" />
                <span>{cloneableTemplates.length} Cloneable</span>
            </Button>
        );
    }

    if (minimizedButtons.length > 0 && visibleStale.length === 0 && visibleCloneable.length === 0) {
        return (
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {minimizedButtons}
            </div>
        );
    }

    if (visibleStale.length === 0 && visibleCloneable.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm space-y-3">
            {/* Cloneable Templates Notification */}
            {visibleCloneable.length > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 shadow-lg backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                        <Copy className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm text-blue-500">
                                Cloneable Templates ({visibleCloneable.length})
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                Save these custom nodes to your library for reuse.
                            </p>

                            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                                {visibleCloneable.map(template => (
                                    <div
                                        key={template.id}
                                        className="flex items-center justify-between gap-2 p-2 bg-background/50 rounded text-xs"
                                    >
                                        <div className="min-w-0">
                                            <span className="font-medium truncate block">{template.name}</span>
                                            <span className="text-muted-foreground">
                                                {template.type === 'subgraph' ? 'Subgraph' : 'Code Node'}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-2 text-xs gap-1 text-blue-600 hover:text-blue-700"
                                                onClick={() => handleClone(template)}
                                                disabled={cloning.has(template.id)}
                                            >
                                                {cloning.has(template.id) ? (
                                                    <>
                                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                                        <span>Cloning...</span>
                                                    </>
                                                ) : (
                                                    'Clone'
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0"
                                                onClick={() => handleDismissCloneable(template.id)}
                                                disabled={cloning.has(template.id)}
                                            >
                                                <X className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-3 flex gap-2">
                                {showCloneAll && (
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="flex-1 h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white"
                                        onClick={handleCloneAll}
                                        disabled={isCloningAny}
                                    >
                                        {isCloningAny ? (
                                            <>
                                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                                Cloning All...
                                            </>
                                        ) : (
                                            'Clone All'
                                        )}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-7 text-xs"
                                    onClick={handleDismissAllCloneable}
                                    disabled={isCloningAny}
                                >
                                    {visibleCloneable.length > 1 ? 'Dismiss All' : 'Dismiss'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stale Templates Notification */}
            {visibleStale.length > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 shadow-lg backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm text-orange-500">
                                Outdated Templates ({visibleStale.length})
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                Some embedded templates have newer versions available.
                            </p>

                            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                                {visibleStale.map(template => (
                                    <div
                                        key={template.id}
                                        className="flex items-center justify-between gap-2 p-2 bg-background/50 rounded text-xs"
                                    >
                                        <div className="min-w-0">
                                            <span className="font-medium truncate block">{template.name}</span>
                                            <span className="text-muted-foreground">
                                                v{template.currentVersion} → v{template.latestVersion}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-2 text-xs gap-1"
                                                onClick={() => handleUpdate(template)}
                                                disabled={updating.has(template.id)}
                                            >
                                                {updating.has(template.id) ? (
                                                    <>
                                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                                        <span>Updating...</span>
                                                    </>
                                                ) : (
                                                    'Update'
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0"
                                                onClick={() => handleDismiss(template.id)}
                                                disabled={updating.has(template.id)}
                                            >
                                                <X className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-3 flex gap-2">
                                {showUpdateAll && (
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="flex-1 h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                                        onClick={handleUpdateAll}
                                        disabled={isUpdatingAny}
                                    >
                                        {isUpdatingAny ? (
                                            <>
                                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                                Updating All...
                                            </>
                                        ) : (
                                            'Update All'
                                        )}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-7 text-xs"
                                    onClick={handleDismissAll}
                                    disabled={isUpdatingAny}
                                >
                                    {visibleStale.length > 1 ? 'Dismiss All' : 'Dismiss'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
