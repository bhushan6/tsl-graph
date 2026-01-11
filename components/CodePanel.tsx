'use client';

import { useMemo, useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { Highlight, themes } from 'prism-react-renderer';
import { useTheme } from 'next-themes';
import { useEditorStore } from '@/store/editor';
import { compileGraph, getRequiredImports } from '@/lib/compiler';
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

    const codeTheme = resolvedTheme === 'dark' ? themes.oneDark : themes.oneLight;

    const compiledCode = useMemo(() => {
        return compileGraph(nodes, edges, subgraphs);
    }, [nodes, edges, subgraphs]);

    const imports = useMemo(() => {
        return getRequiredImports(nodes, subgraphs);
    }, [nodes, subgraphs]);

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
            <DialogContent className="max-h-[80vh] flex flex-col sm:max-w-fit z-[10000]">
                <DialogHeader>
                    <DialogTitle className="flex flex-col gap-1">
                        <span>TSL Output</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            ({nodes.length} node{nodes.length !== 1 ? 's' : ''})
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col overflow-hidden border border-border rounded-lg w-fit">
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
                    <Highlight
                        theme={codeTheme}
                        code={compiledCode}
                        language="tsx"
                    >
                        {({ style, tokens, getLineProps, getTokenProps }) => (
                            <pre
                                className="flex-1 px-4 py-3 overflow-auto text-sm font-mono !bg-transparent"
                                style={{ ...style, background: 'transparent' }}
                            >
                                {tokens.map((line, i) => (
                                    <div key={i} {...getLineProps({ line })}>
                                        {line.map((token, key) => (
                                            <span key={key} {...getTokenProps({ token })} />
                                        ))}
                                    </div>
                                ))}
                            </pre>
                        )}
                    </Highlight>
                </div>
            </DialogContent>
        </Dialog>
    );
}
