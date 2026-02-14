'use client';

import { useMemo, useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { useEditorStore } from '@/store/editor';
import { compileGraph, compileSubgraphCode, getRequiredImports } from '@/lib/compiler';
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
        return compileGraph(nodes, edges, subgraphs, codeNodes, { globals });
    }, [nodes, edges, subgraphs, codeNodes, globals, subgraphDefinition]);

    const imports = useMemo(() => {
        if (subgraphDefinition) {
            const subgraphImports = getRequiredImports(subgraphDefinition.nodes, subgraphs, codeNodes, globals);
            const importSet = new Set(subgraphImports);
            importSet.add('Fn');
            return Array.from(importSet).sort();
        }
        return getRequiredImports(nodes, subgraphs, codeNodes, globals);
    }, [nodes, subgraphs, codeNodes, globals, subgraphDefinition]);

    const handleCopy = useCallback(async () => {
        const fullCode = imports.length > 0
            ? `import { ${imports.join(', ')} } from 'three/tsl';\n\n${compiledCode}`
            : compiledCode;

        await navigator.clipboard.writeText(fullCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [compiledCode, imports]);

    return (
        <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()} >
            <DialogContent className="max-h-[80vh] flex flex-col sm:max-w-[90vw] z-[10000]">
                <DialogHeader>
                    <DialogTitle className="flex flex-col gap-1">
                        <span>{subgraphDefinition ? 'Subgraph Output' : 'TSL Output'}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            ({subgraphDefinition ? subgraphDefinition.nodes.length : nodes.length} node{(subgraphDefinition ? subgraphDefinition.nodes.length : nodes.length) !== 1 ? 's' : ''})
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col overflow-hidden border border-border rounded-lg w-full">
                    {/* Imports line */}
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border shrink-0">
                        <span className="text-xs text-muted-foreground font-mono truncate">
                            {imports.length > 0 && (
                                <>import {'{'} {imports.join(', ')} {'}'} from &apos;three/tsl&apos;;</>
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
