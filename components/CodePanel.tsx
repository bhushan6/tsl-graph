'use client';

import { useMemo, useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { useEditorStore } from '@/store/editor';
import { compileGraph, compilePostGraph, compileSubgraphCode, getRequiredImportsByModule, type ImportGroup } from '@/lib/compiler';
import { SubgraphDefinition } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { inlineCustomTslImports } from '@/lib/editor-host/tsl-utils-inline';
import { useEditorHostConfig } from '@/lib/editor-host/context';
import { normalizeEnabledGraphs } from '@/lib/editor-host/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

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

export function needsThreeNamespaceImport(code: string): boolean {
    return /\bTHREE\./.test(code);
}

export function CodePanel({ isOpen, onClose }: CodePanelProps) {
    const [copied, setCopied] = useState(false);
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
            sections.push('const renderPipeline = new RenderPipeline(renderer);');
            if (postFn) {
                sections.push(`renderPipeline.outputNode = ${postFn}(scenePass, scenePass.getTextureNode(), scenePass.getLinearDepthNode(), scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'));`);
                sections.push('renderPipeline.render();');
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
            groups.push({ from: 'three/tsl', imports: ['Fn', 'pass', 'mrt', 'output', 'normalView'] });
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

    const inlinedImportsResult = useMemo(
        () => inlineCustomTslImports(importGroups),
        [importGroups]
    );

    const importBlock = useMemo(() => {
        return inlinedImportsResult.imports
            .map((group) => `import { ${group.imports.join(', ')} } from '${group.from}';`)
            .join('\n');
    }, [inlinedImportsResult.imports]);

    const generatedCodeDisplay = useMemo(() => {
        const helperBlock = inlinedImportsResult.helperCode?.trim();
        const codeWithHelpers = helperBlock
            ? `${helperBlock}\n\n${compiledCode}`
            : compiledCode;
        const codeWithImports = importBlock
            ? `${importBlock}\n\n${codeWithHelpers}`
            : codeWithHelpers;
        const prefixImports: string[] = [];
        if (!subgraphDefinition && needsThreeNamespaceImport(codeWithHelpers)) {
            prefixImports.push(`import * as THREE from 'three/webgpu';`);
        }
        if (postGraphEnabled && !subgraphDefinition) {
            prefixImports.push(`import { RenderPipeline } from 'three/webgpu';`);
        }

        const codeWithRuntimeImports = prefixImports.length > 0
            ? `${prefixImports.join('\n')}\n\n${codeWithImports}`
            : codeWithImports;

        return subgraphDefinition
            ? codeWithImports
            : codeWithRuntimeImports;
    }, [compiledCode, importBlock, inlinedImportsResult.helperCode, postGraphEnabled, subgraphDefinition]);

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

    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(generatedCodeDisplay);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [generatedCodeDisplay]);

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
                    <div className="flex items-center justify-end px-3 py-0 bg-muted/20 border-b border-border shrink-0 gap-3">
                        {/* <div className="h-9 min-w-[92px] rounded-none border-x border-t border-border border-b-0 bg-background px-3 text-xs font-medium text-foreground flex items-center">
                            main.js
                        </div> */}
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
                </div>
            </DialogContent>
        </Dialog>
    );
}
