'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useConvex } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEditorStore } from '@/store/editor';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface StaleTemplate {
    id: string;
    name: string;
    templateId: string;
    currentVersion: number;
    latestVersion: number;
    type: 'subgraph' | 'codeNode';
}

export function StaleTemplatesNotification() {
    const [staleTemplates, setStaleTemplates] = useState<StaleTemplate[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [updating, setUpdating] = useState<Set<string>>(new Set());
    const convex = useConvex();

    // Get embedded definitions from store
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);
    const updateSubgraphDefinition = useEditorStore((s) => s.updateSubgraphDefinition);
    const updateCodeNode = useEditorStore((s) => s.updateCodeNode);

    // Collect template IDs for version check
    const subgraphTemplateIds = Object.values(subgraphs)
        .filter(sg => sg.templateId)
        .map(sg => sg.templateId as Id<"subgraphTemplates">);

    const codeNodeTemplateIds = Object.values(codeNodes)
        .filter(cn => cn.templateId)
        .map(cn => cn.templateId as Id<"codeNodeTemplates">);

    // Query latest versions from DB
    const subgraphVersions = useQuery(
        api.templates.getSubgraphTemplateVersions,
        subgraphTemplateIds.length > 0 ? { ids: subgraphTemplateIds } : 'skip'
    );

    const codeNodeVersions = useQuery(
        api.templates.getCodeNodeTemplateVersions,
        codeNodeTemplateIds.length > 0 ? { ids: codeNodeTemplateIds } : 'skip'
    );

    // Check for stale templates when versions are loaded
    useEffect(() => {
        const stale: StaleTemplate[] = [];

        // Check subgraphs
        if (subgraphVersions) {
            for (const sg of Object.values(subgraphs)) {
                if (sg.templateId && sg.templateVersion) {
                    const latest = subgraphVersions[sg.templateId];
                    if (latest && latest.version > sg.templateVersion) {
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
        }

        // Check code nodes
        if (codeNodeVersions) {
            for (const cn of Object.values(codeNodes)) {
                if (cn.templateId && cn.templateVersion) {
                    const latest = codeNodeVersions[cn.templateId];
                    if (latest && latest.version > cn.templateVersion) {
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
        }

        setStaleTemplates(stale);
    }, [subgraphs, codeNodes, subgraphVersions, codeNodeVersions]);

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
        } finally {
            setUpdating(prev => {
                const next = new Set(prev);
                next.delete(template.id);
                return next;
            });
        }
    }, [convex, updateSubgraphDefinition, updateCodeNode]);

    const handleDismiss = useCallback((templateId: string) => {
        setDismissed(prev => new Set(prev).add(templateId));
    }, []);

    // Filter out dismissed templates
    const visibleStale = staleTemplates.filter(t => !dismissed.has(t.id));

    const handleDismissAll = useCallback(() => {
        setDismissed(new Set(staleTemplates.map(t => t.id)));
    }, [staleTemplates]);

    const handleUpdateAll = useCallback(async () => {
        const promises = visibleStale.map(t => handleUpdate(t));
        await Promise.all(promises);
    }, [visibleStale, handleUpdate]);

    if (staleTemplates.length > 0 && visibleStale.length === 0) {
        return (
            <div className="fixed bottom-4 right-4 z-50">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2 bg-background/95 backdrop-blur shadow-lg border-orange-500/30 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => setDismissed(new Set())}
                >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{staleTemplates.length} Updates Available</span>
                </Button>
            </div>
        );
    }

    if (visibleStale.length === 0) return null;

    const isUpdatingAny = updating.size > 0;
    const showUpdateAll = visibleStale.length >= 2;

    return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
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
        </div>
    );
}
