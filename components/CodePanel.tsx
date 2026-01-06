'use client';

import { useMemo, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useEditorStore } from '@/store/editor';
import { compileGraph, getRequiredImports } from '@/lib/compiler';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function CodePanel() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [copied, setCopied] = useState(false);
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);

    const compiledCode = useMemo(() => {
        return compileGraph(nodes, edges);
    }, [nodes, edges]);

    const imports = useMemo(() => {
        return getRequiredImports(nodes);
    }, [nodes]);

    const handleCopy = useCallback(async () => {
        const fullCode = imports.length > 0
            ? `import { ${imports.join(', ')} } from 'three/tsl';\n\n${compiledCode}`
            : compiledCode;

        await navigator.clipboard.writeText(fullCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [compiledCode, imports]);

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-10">
            {/* Header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors"
            >
                <span className="text-sm font-medium text-foreground">
                    TSL Output
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {nodes.length} node{nodes.length !== 1 ? 's' : ''}
                    </span>
                    {isCollapsed ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                </div>
            </button>

            {/* Code content */}
            {!isCollapsed && (
                <div className="border-t border-border">
                    <div className="flex items-center justify-between px-4 py-1 bg-muted/30">
                        <span className="text-xs text-muted-foreground font-mono">
                            {imports.length > 0 && (
                                <>import {'{'} {imports.join(', ')} {'}'} from 'three/tsl';</>
                            )}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            className="h-6 px-2"
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
                    <pre className="px-4 py-3 overflow-auto max-h-48 text-xs font-mono text-foreground bg-muted/10">
                        <code>{compiledCode}</code>
                    </pre>
                </div>
            )}
        </div>
    );
}
