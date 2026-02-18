'use client';

import { useMemo, useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { useEditorStore } from '@/store/editor';
import { compileGraph, compilePostGraph, compileSubgraphCode, getRequiredImports } from '@/lib/compiler';
import { SubgraphDefinition } from '@/lib/types';
import { Button } from '@/components/ui/button';
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

export function CodePanel({ isOpen, onClose }: CodePanelProps) {
    const [copied, setCopied] = useState(false);
    const { resolvedTheme } = useTheme();
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);
    const globals = useEditorStore((s) => s.globals);
    const editorMode = useEditorStore((s) => s.editorMode);
    const editingSubgraphId = useEditorStore((s) => s.editingSubgraphId);
    const getRootGraph = useEditorStore((s) => s.getRootGraph);

    const extensions = useMemo(() => [javascript()], []);

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
        if (subgraphDefinition) {
            return compileSubgraphCode(subgraphDefinition, subgraphs, codeNodes, { globals });
        }
        const materialGraph = getRootGraph('material');
        const postGraph = getRootGraph('post');
        const materialCode = compileGraph(materialGraph.nodes, materialGraph.edges, subgraphs, codeNodes, { globals });

        let postCode = '// Post graph could not be compiled.';
        let postFn: string | null = null;
        try {
            const postCompiled = compilePostGraph(postGraph.nodes, postGraph.edges, subgraphs, codeNodes, { globals });
            postCode = postCompiled.code;
            postFn = postCompiled.functionName;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Post graph could not be compiled.';
            postCode = `// ${message}`;
        }

        return [
            '// Material Graph',
            materialCode,
            '',
            '// Post Graph',
            postCode,
            '',
            '// Pipeline Wiring',
            'const scenePass = pass(scene, camera);',
            'const postProcessing = new PostProcessing(renderer);',
            ...(postFn
                ? [`postProcessing.outputNode = ${postFn}(scenePass, scenePass.getTextureNode(), scenePass.getLinearDepthNode(), scenePass.getTextureNode('depth'));`, 'postProcessing.render();']
                : ['renderer.render(scene, camera);']),
        ].join('\n');
    }, [nodes, edges, subgraphs, codeNodes, globals, subgraphDefinition, getRootGraph]);

    const imports = useMemo(() => {
        if (subgraphDefinition) {
            const subgraphImports = getRequiredImports(subgraphDefinition.nodes, subgraphs, codeNodes, globals);
            const importSet = new Set(subgraphImports);
            importSet.add('Fn');
            return Array.from(importSet).sort();
        }
        const materialGraph = getRootGraph('material');
        const postGraph = getRootGraph('post');
        const importSet = new Set([
            ...getRequiredImports(materialGraph.nodes, subgraphs, codeNodes, globals),
            ...getRequiredImports(postGraph.nodes, subgraphs, codeNodes, globals),
            'pass',
        ]);
        return Array.from(importSet).sort();
    }, [nodes, subgraphs, codeNodes, globals, subgraphDefinition, getRootGraph]);

    const displayedNodeCount = useMemo(() => {
        if (subgraphDefinition) return subgraphDefinition.nodes.length;
        const materialGraph = getRootGraph('material');
        const postGraph = getRootGraph('post');
        return materialGraph.nodes.length + postGraph.nodes.length;
    }, [subgraphDefinition, getRootGraph, nodes, edges]);

    const handleCopy = useCallback(async () => {
        const importBlock = imports.length > 0
            ? `import { ${imports.join(', ')} } from 'three/tsl';\n\n${compiledCode}`
            : compiledCode;
        const fullCode = subgraphDefinition
            ? importBlock
            : `import { PostProcessing } from 'three/webgpu';\n${importBlock.startsWith('import') ? '\n' : '\n\n'}${importBlock}`;

        await navigator.clipboard.writeText(fullCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [compiledCode, imports, subgraphDefinition]);

    return (
        <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()} >
            <DialogContent className="max-h-[80vh] flex flex-col sm:max-w-[90vw] z-[10000]">
                <DialogHeader>
                    <DialogTitle className="flex flex-col gap-1">
                        <span>{subgraphDefinition ? 'Subgraph Output' : 'TSL Output'}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            ({displayedNodeCount} node{displayedNodeCount !== 1 ? 's' : ''})
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col overflow-hidden border border-border rounded-lg w-full">
                    {/* Imports line */}
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border shrink-0">
                        <span className="text-xs text-muted-foreground font-mono truncate">
                            {imports.length > 0 && (
                                <>
                                    import {'{'} {imports.join(', ')} {'}'} from &apos;three/tsl&apos;;
                                    {!subgraphDefinition && ' | import { PostProcessing } from \'three/webgpu\';'}
                                </>
                            )}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            className="h-7 px-2 shrink-0 ml-2"
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

                    {/* Code content with syntax highlighting */}
                    <CodeMirror
                        value={compiledCode}
                        extensions={extensions}
                        theme={resolvedTheme === 'dark' ? oneDark : undefined}
                        editable={false}
                        readOnly={true}
                        basicSetup={{
                            lineNumbers: true,
                            foldGutter: false,
                            highlightActiveLine: false,
                            autocompletion: false,
                        }}
                        className="flex-1 overflow-auto text-sm"
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
