'use client';

import { useState, useCallback, useMemo } from 'react';
import { Code, CheckCircle, AlertCircle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEditorStore } from '@/store/editor';
import { parseCodeNodeCode } from '@/lib/code-parser';
import { SubgraphPort } from '@/lib/types';
import { toast } from 'sonner';

interface CodeNodeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PLACEHOLDER_CODE = `Fn(([a, b]) => {
    // Your TSL code here
    const result = a.add(b);
    return result;
})`;

export function CodeNodeDialog({ open, onOpenChange }: CodeNodeDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const { createCodeNode, codeNodes, subgraphs } = useEditorStore();

    // Parse code to extract arguments and validate
    const parseResult = useMemo(() => {
        if (!code.trim()) {
            return { arguments: [], isValid: false, error: 'Enter code to validate' };
        }
        return parseCodeNodeCode(code);
    }, [code]);

    // Check for name conflicts
    const nameConflict = useMemo(() => {
        if (!name.trim()) return null;
        const normalizedName = name.trim().toLowerCase();

        // Check against existing code nodes
        const existingCodeNode = Object.values(codeNodes).find(
            cn => cn.name.toLowerCase() === normalizedName
        );
        if (existingCodeNode) return 'A code node with this name already exists';

        // Check against subgraphs
        const existingSubgraph = Object.values(subgraphs).find(
            sg => sg.name.toLowerCase() === normalizedName
        );
        if (existingSubgraph) return 'A subgraph with this name already exists';

        return null;
    }, [name, codeNodes, subgraphs]);

    const canCreate = parseResult.isValid && name.trim() && !nameConflict;

    const handleCreate = useCallback(() => {
        if (!canCreate) return;

        // Create input ports from parsed arguments
        const inputs: SubgraphPort[] = parseResult.arguments.map((arg, i) => ({
            id: `in_${i}`,
            label: arg,
            type: 'any',
        }));

        // Single output port
        const output: SubgraphPort = {
            id: 'out',
            label: 'Result',
            type: 'any',
        };

        const id = createCodeNode(name.trim(), code.trim(), inputs, output);
        if (id) {
            toast.success(`Created code node "${name}"`);
            setName('');
            setCode('');
            onOpenChange(false);
        }
    }, [canCreate, name, code, parseResult.arguments, createCodeNode, onOpenChange]);

    const handleClose = useCallback(() => {
        setName('');
        setCode('');
        onOpenChange(false);
    }, [onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Code className="w-5 h-5" />
                        Create Node from Code
                    </DialogTitle>
                    <DialogDescription>
                        Create a reusable node by writing TSL code. Arguments become input handles.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Name input */}
                    <div className="space-y-2">
                        <Label htmlFor="node-name">Node Name</Label>
                        <Input
                            id="node-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Custom Node"
                            className="w-full"
                        />
                        {nameConflict && (
                            <p className="text-xs text-destructive">{nameConflict}</p>
                        )}
                    </div>

                    {/* Code textarea */}
                    <div className="space-y-2">
                        <Label htmlFor="node-code">TSL Code</Label>
                        <textarea
                            id="node-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder={PLACEHOLDER_CODE}
                            className="w-full h-48 px-3 py-2 text-sm font-mono bg-muted rounded-md border border-input resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        />

                        {/* Validation status */}
                        <div className="flex items-center gap-2 text-xs">
                            {code.trim() ? (
                                parseResult.isValid ? (
                                    <>
                                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                        <span className="text-muted-foreground">
                                            Valid code with {parseResult.arguments.length} input{parseResult.arguments.length !== 1 ? 's' : ''}
                                            {parseResult.arguments.length > 0 && (
                                                <span className="text-foreground ml-1">
                                                    ({parseResult.arguments.join(', ')})
                                                </span>
                                            )}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                                        <span className="text-destructive">{parseResult.error}</span>
                                    </>
                                )
                            ) : (
                                <span className="text-muted-foreground">Enter code to validate</span>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={!canCreate}>
                        Create Node
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
