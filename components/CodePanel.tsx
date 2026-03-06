'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { useEditorStore } from '@/store/editor';
import { compileGraph, compilePostGraph, compileSubgraphCode, getRequiredImportsByModule, type ImportGroup } from '@/lib/compiler';
import { SubgraphDefinition } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useEditorHostConfig } from '@/lib/editor-host/context';
import { normalizeEnabledGraphs } from '@/lib/editor-host/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface CodePanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export function mergeImportGroups(groups: ImportGroup[]): ImportGroup[] {
    const grouped = new Map<string, Set<string>>();

    for (const group of groups) {
        const current = grouped.get(group.from) ?? new Set<string>();
        for (const item of group.imports) current.add(item);
        grouped.set(group.from, current);
    }

    return Array.from(grouped.entries())
        .map(([from, importSet]) => ({ from, imports: Array.from(importSet).sort() }))
        .filter((group) => group.imports.length > 0)
        .sort((a, b) => a.from.localeCompare(b.from));
}

export function CodePanel({ isOpen, onClose }: CodePanelProps) {
    const [activeTab, setActiveTab] = useState<'main-js' | 'tsl-utils'>('main-js');
    const [copied, setCopied] = useState(false);
    const [tslUtilsSource, setTslUtilsSource] = useState('');
    const [tslUtilsSourceError, setTslUtilsSourceError] = useState<string | null>(null);
    const { resolvedTheme } = useTheme();
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);
    const globals = useEditorStore((s) => s.globals);
    const graphStructureVersion = useEditorStore((s) => s.graphStructureVersion);
    const editorMode = useEditorStore((s) => s.editorMode);
    const editingSubgraphId = useEditorStore((s) => s.editingSubgraphId);
    const getRootGraph = useEditorStore((s) => s.getRootGraph);
    const hostConfig = useEditorHostConfig();

    const extensions = useMemo(() => [javascript()], []);
    const enabledGraphs = useMemo(
        () => normalizeEnabledGraphs(hostConfig?.enabledGraphs),
        [hostConfig?.enabledGraphs]
    );
    const materialGraphEnabled = enabledGraphs.includes('material');
    const postGraphEnabled = enabledGraphs.includes('postprocessing');

    const subgraphDefinition = useMemo<SubgraphDefinition | null>(() => {
        if (editorMode !== 'subgraph' || !editingSubgraphId) return null;
        const base = subgraphs[editingSubgraphId];
        if (!base) return null;

        const internalNodes = nodes.filter(
            (node) => node.id !== 'subgraph-input' && node.id !== 'subgraph-output'
        );
        const inputNode = nodes.find((node) => node.id === 'subgraph-input');
        const outputNode = nodes.find((node) => node.id === 'subgraph-output');

        return {
            ...base,
            nodes: internalNodes,
            edges,
            inputs: inputNode?.data.dynamicPorts ?? base.inputs,
            outputs: outputNode?.data.dynamicPorts ?? base.outputs,
            updatedAt: base.updatedAt,
        };
    }, [editorMode, editingSubgraphId, subgraphs, nodes, edges]);

    const compiledCode = useMemo(() => {
        // Force recompute when the root graph mutates even if only getRootGraph() output changed.
        void graphStructureVersion;
        if (subgraphDefinition) {
            return compileSubgraphCode(subgraphDefinition, subgraphs, codeNodes, { globals });
        }

        const sections: string[] = [];

        if (materialGraphEnabled) {
            const materialGraph = getRootGraph('material');
            let materialCode = '// Material graph could not be compiled.';
            try {
                materialCode = compileGraph(materialGraph.nodes, materialGraph.edges, subgraphs, codeNodes, { globals });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Material graph could not be compiled.';
                materialCode = `// ${message}`;
            }

            sections.push('// Material Graph');
            sections.push(materialCode);
        }

        let postFn: string | null = null;
        if (postGraphEnabled) {
            const postGraph = getRootGraph('post');
            let postCode = '// Post graph could not be compiled.';
            try {
                const postCompiled = compilePostGraph(postGraph.nodes, postGraph.edges, subgraphs, codeNodes, { globals });
                postCode = postCompiled.code;
                postFn = postCompiled.functionName;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Post graph could not be compiled.';
                postCode = `// ${message}`;
            }

            if (sections.length > 0) {
                sections.push('');
            }
            sections.push('// Post Graph');
            sections.push(postCode);
            sections.push('');
            sections.push('// Pipeline Wiring');
            sections.push('const scenePass = pass(scene, camera);');
            sections.push('scenePass.setMRT(mrt({ output, normal: normalView }));');
            sections.push('const postProcessing = new PostProcessing(renderer);');
            if (postFn) {
                sections.push(`postProcessing.outputNode = ${postFn}(scenePass, scenePass.getTextureNode(), scenePass.getLinearDepthNode(), scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'));`);
                sections.push('postProcessing.render();');
            } else {
                sections.push('renderer.render(scene, camera);');
            }
        }

        if (sections.length === 0) {
            return '// No root graphs are enabled in host configuration.';
        }

        return sections.join('\n');
    }, [
        graphStructureVersion,
        subgraphs,
        codeNodes,
        globals,
        subgraphDefinition,
        getRootGraph,
        materialGraphEnabled,
        postGraphEnabled,
    ]);

    const importGroups = useMemo<ImportGroup[]>(() => {
        // Keep import list in sync with graph topology changes.
        void graphStructureVersion;
        if (subgraphDefinition) {
            return mergeImportGroups(
                getRequiredImportsByModule(subgraphDefinition.nodes, subgraphs, codeNodes, globals)
            );
        }
        const groups: ImportGroup[] = [];

        if (materialGraphEnabled) {
            const materialGraph = getRootGraph('material');
            groups.push(...getRequiredImportsByModule(materialGraph.nodes, subgraphs, codeNodes, globals));
        }

        if (postGraphEnabled) {
            const postGraph = getRootGraph('post');
            groups.push(...getRequiredImportsByModule(postGraph.nodes, subgraphs, codeNodes, globals));
            groups.push({ from: 'three/tsl', imports: ['pass', 'mrt', 'output', 'normalView'] });
        }

        return mergeImportGroups(groups);
    }, [
        graphStructureVersion,
        subgraphs,
        codeNodes,
        globals,
        subgraphDefinition,
        getRootGraph,
        materialGraphEnabled,
        postGraphEnabled,
    ]);

    const importBlock = useMemo(() => {
        return importGroups
            .map((group) => `import { ${group.imports.join(', ')} } from '${group.from}';`)
            .join('\n');
    }, [importGroups]);

    const generatedCodeDisplay = useMemo(() => {
        const codeWithImports = importBlock
            ? `${importBlock}\n\n${compiledCode}`
            : compiledCode;
        const needsPostProcessingImport = postGraphEnabled && !subgraphDefinition;
        return subgraphDefinition
            ? codeWithImports
            : needsPostProcessingImport
                ? `import { PostProcessing } from 'three/webgpu';\n\n${codeWithImports}`
                : codeWithImports;
    }, [compiledCode, importBlock, postGraphEnabled, subgraphDefinition]);

    const displayedNodeCount = useMemo(() => {
        // Keep displayed count synced when root graph changes.
        void graphStructureVersion;
        if (subgraphDefinition) return subgraphDefinition.nodes.length;
        let totalNodes = 0;
        if (materialGraphEnabled) {
            totalNodes += getRootGraph('material').nodes.length;
        }
        if (postGraphEnabled) {
            totalNodes += getRootGraph('post').nodes.length;
        }
        return totalNodes;
    }, [graphStructureVersion, subgraphDefinition, getRootGraph, materialGraphEnabled, postGraphEnabled]);

    useEffect(() => {
        if (!isOpen || tslUtilsSource.length > 0 || tslUtilsSourceError) return;

        let isMounted = true;

        const loadTSLUtilsSource = async () => {
            try {
                const response = await fetch('/api/tsl-utils-source', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to load tsl-utils source (${response.status})`);
                }
                const source = await response.text();
                if (isMounted) {
                    setTslUtilsSource(source);
                    setTslUtilsSourceError(null);
                }
            } catch (error) {
                if (!isMounted) return;
                const message = error instanceof Error ? error.message : 'Failed to load tsl-utils source';
                setTslUtilsSourceError(message);
            }
        };

        void loadTSLUtilsSource();

        return () => {
            isMounted = false;
        };
    }, [isOpen, tslUtilsSource, tslUtilsSourceError]);

    const tslUtilsSourceDisplay = useMemo(() => {
        if (tslUtilsSource.length > 0) return tslUtilsSource;
        if (tslUtilsSourceError) return `// ${tslUtilsSourceError}`;
        return '// Loading tsl-utils source...';
    }, [tslUtilsSource, tslUtilsSourceError]);

    const handleCopy = useCallback(async () => {
        const textToCopy = activeTab === 'main-js'
            ? generatedCodeDisplay
            : tslUtilsSourceDisplay;

        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [activeTab, generatedCodeDisplay, tslUtilsSourceDisplay]);

    return (
        <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()} >
            <DialogContent className="h-[80vh] max-h-[80vh] flex flex-col sm:max-w-[90vw] z-[10000] overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex flex-col gap-1">
                        <span>{subgraphDefinition ? 'Subgraph Output' : 'TSL Output'}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            ({displayedNodeCount} node{displayedNodeCount !== 1 ? 's' : ''})
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden border border-border rounded-lg w-full">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'main-js' | 'tsl-utils')} className="flex-1 min-h-0 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-0 bg-muted/20 border-b border-border shrink-0 gap-3">
                            <TabsList
                                variant="line"
                                className="h-9 gap-0 bg-transparent p-0 rounded-none"
                            >
                                <TabsTrigger
                                    value="main-js"
                                    className="h-9 min-w-[92px] rounded-none border-x border-t border-border border-b-0 bg-muted/50 px-3 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=inactive]:hover:bg-muted/70 after:hidden"
                                >
                                    main.js
                                </TabsTrigger>
                                <TabsTrigger
                                    value="tsl-utils"
                                    className="h-9 min-w-[108px] rounded-none border-x border-t border-border border-b-0 bg-muted/50 px-3 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=inactive]:hover:bg-muted/70 after:hidden"
                                >
                                    tsl-utils.js
                                </TabsTrigger>
                            </TabsList>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopy}
                                className="h-7 px-2 shrink-0"
                            >
                                {copied ? (
                                    <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                    <Copy className="w-3 h-3" />
                                )}
                                <span className="ml-1 text-xs">
                                    {copied ? 'Copied!' : 'Copy'}
                                </span>
                            </Button>
                        </div>

                        <TabsContent value="main-js" className="flex-1 min-h-0 mt-0 flex flex-col overflow-hidden">
                            <CodeMirror
                                value={generatedCodeDisplay}
                                extensions={extensions}
                                theme={resolvedTheme === 'dark' ? oneDark : undefined}
                                height="100%"
                                editable={false}
                                readOnly={true}
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: false,
                                    highlightActiveLine: false,
                                    autocompletion: false,
                                }}
                                className="flex-1 min-h-0 overflow-hidden text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:max-h-full [&_.cm-scroller]:overflow-auto [&_.cm-gutters]:h-full"
                            />
                        </TabsContent>

                        <TabsContent value="tsl-utils" className="flex-1 min-h-0 mt-0 flex flex-col overflow-hidden">
                            <CodeMirror
                                value={tslUtilsSourceDisplay}
                                extensions={extensions}
                                theme={resolvedTheme === 'dark' ? oneDark : undefined}
                                height="100%"
                                editable={false}
                                readOnly={true}
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: false,
                                    highlightActiveLine: false,
                                    autocompletion: false,
                                }}
                                className="flex-1 min-h-0 overflow-hidden text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:max-h-full [&_.cm-scroller]:overflow-auto [&_.cm-gutters]:h-full"
                            />
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
