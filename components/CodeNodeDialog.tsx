'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Code, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { tslAutocompletion } from '@/lib/tsl-completions';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
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
import { CodeNodeLanguage, SubgraphPort, TSLType } from '@/lib/types';
import { toast } from 'sonner';

const PORT_TYPES: { value: TSLType; label: string }[] = [
    { value: 'any', label: 'Any' },
    { value: 'float', label: 'Float' },
    { value: 'vec2', label: 'Vec2' },
    { value: 'vec3', label: 'Vec3' },
    { value: 'vec4', label: 'Vec4' },
    { value: 'color', label: 'Color' },
    { value: 'int', label: 'Int' },
    { value: 'bool', label: 'Bool' },
];

interface CodeNodeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode?: 'create' | 'edit';
    nodeId?: string;
    initialName?: string;
    initialCode?: string;
    initialLanguage?: CodeNodeLanguage;
}

const PLACEHOLDER_TSL_CODE = `Fn(([a, b]) => {
    // Your TSL code here
    const result = a.add(b);
    return result;
})`;

const PLACEHOLDER_WGSL_CODE = `fn colorFn(baseColor: vec4f, uv: vec2f) -> vec4f {
  let red = (uv.x + 2.3) * 0.3;
  let green = (uv.y + 1.7) / 8.2;
  let blue = (uv.x + uv.y) % 10.0;
  return mix(baseColor, vec4f(red, green, blue, 1.0), uv.x);
}`;

export function CodeNodeDialog({
    open,
    onOpenChange,
    mode = 'create',
    nodeId,
    initialName = '',
    initialCode = '',
    initialLanguage = 'tsl'
}: CodeNodeDialogProps) {
    const [name, setName] = useState(initialName);
    const [code, setCode] = useState(initialCode);
    const [isSaving, setIsSaving] = useState(false);
    const [inputTypes, setInputTypes] = useState<Record<string, TSLType>>({});
    const [language, setLanguage] = useState<CodeNodeLanguage>(initialLanguage);
    const { createCodeNode, updateCodeNode, subgraphs, getCodeNode } = useEditorStore();

    const { resolvedTheme } = useTheme();
    const extensions = useMemo(() => [javascript(), tslAutocompletion], []);

    // When editing, load existing input types from the code node
    const existingCodeNode = mode === 'edit' && nodeId ? getCodeNode(nodeId) : null;

    // Parse code to extract arguments and validate
    const parseResult = useMemo(() => {
        if (!code.trim()) {
            return { arguments: [], isValid: false, error: 'Enter code to validate' };
        }
        return parseCodeNodeCode(code, language);
    }, [code, language]);

    // Reset input types when language changes
    React.useEffect(() => {
        setInputTypes({});
    }, [language]);

    // Sync input types when arguments change
    React.useEffect(() => {
        const newTypes: Record<string, TSLType> = {};
        for (const arg of parseResult.arguments) {
            // Try to get existing type from code node (if editing)
            const existingInput = existingCodeNode?.inputs.find(inp => inp.label === arg);
            newTypes[arg] = inputTypes[arg]
                || existingInput?.type as TSLType
                || parseResult.argTypes?.[arg]
                || 'any';
        }
        // Only update if different to avoid infinite loops
        const isDifferent = parseResult.arguments.some(arg => newTypes[arg] !== inputTypes[arg]) ||
            Object.keys(inputTypes).length !== parseResult.arguments.length;
        if (isDifferent) {
            setInputTypes(newTypes);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parseResult.arguments, parseResult.argTypes, existingCodeNode, inputTypes]);

    // Check for name conflicts
    const nameConflict = useMemo(() => {
        if (!name.trim()) return null;
        const normalizedName = name.trim().toLowerCase();

        // Check against existing code nodes
        // SKIPPED: Code node instances share names with templates (e.g. template "Add" vs instance "Add").
        // We enforce ID uniqueness, but names can be duplicated for instances.

        /* 
        const conflictingNode = Object.values(codeNodes).find(
            cn => cn.name.toLowerCase() === normalizedName && 
                  (mode !== 'edit' || !nodeId || cn.id !== nodeId)
        );
        
        if (conflictingNode) {
            return 'A code node with this name already exists';
        }
        */

        // Check against subgraphs - these should be unique as they are global types
        const existingSubgraph = Object.values(subgraphs).find(
            sg => sg.name.toLowerCase() === normalizedName
        );
        if (existingSubgraph) return 'A subgraph with this name already exists';

        return null;
    }, [name, subgraphs]);

    const canCreate = parseResult.isValid && name.trim() && !nameConflict;

    const handleSave = useCallback(async () => {
        if (!canCreate || isSaving) return;
        setIsSaving(true);
        try {

            // Create input ports from parsed arguments with user-configured types
            const inputs: SubgraphPort[] = parseResult.arguments.map((arg, i) => ({
                id: `in_${i}`,
                label: arg,
                type: language === 'wgsl'
                    ? (parseResult.argTypes?.[arg] || 'any')
                    : (inputTypes[arg] || 'any'),
            }));

            // Single output port
            const output: SubgraphPort = {
                id: 'out',
                label: 'Result',
                type: language === 'wgsl' ? (parseResult.returnType || 'any') : 'any',
            };

            if (mode === 'create') {
                const id = await createCodeNode(name.trim(), code.trim(), inputs, output, language);
                if (id) {
                    toast.success(`Created code node "${name}"`);
                    setName('');
                    setCode('');
                    onOpenChange(false);
                }
                // Error toast is already shown by createCodeNode
            } else {
                if (nodeId) {
                    updateCodeNode(nodeId, {
                        name: name.trim(),
                        code: code.trim(),
                        inputs,
                        output,
                        language
                    });
                    toast.success(`Updated code node "${name}"`);
                    onOpenChange(false);
                }
            }
        } finally {
            setIsSaving(false);
        }
    }, [canCreate, isSaving, name, code, parseResult.arguments, parseResult.returnType, inputTypes, createCodeNode, updateCodeNode, onOpenChange, mode, nodeId, language]);

    const handleClose = useCallback(() => {
        // Reset to initial values on close without saving
        setName(initialName);
        setCode(initialCode);
        setLanguage(initialLanguage);
        onOpenChange(false);
    }, [onOpenChange, initialName, initialCode, initialLanguage]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Code className="w-5 h-5" />
                        {mode === 'create' ? 'Create Node from Code' : 'Edit Code Node'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'create'
                            ? 'Create a reusable node by writing TSL or WGSL code. Arguments become input handles.'
                            : 'Edit the code. Changing arguments will update input handles.'}
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

                    {/* Language selector */}
                    <div className="space-y-2">
                        <Label htmlFor="node-language">Language</Label>
                        <select
                            id="node-language"
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as CodeNodeLanguage)}
                            className="w-full h-8 px-2 text-sm bg-muted border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                            <option value="tsl">TSL</option>
                            <option value="wgsl">WGSL</option>
                        </select>
                    </div>

                    {/* Code editor */}
                    <div className="space-y-2">
                        <Label>{language === 'wgsl' ? 'WGSL Code' : 'TSL Code'}</Label>
                        <div className="rounded-md border border-input overflow-hidden">
                            <CodeMirror
                                value={code}
                                onChange={setCode}
                                extensions={extensions}
                                theme={resolvedTheme === 'dark' ? oneDark : undefined}
                                placeholder={language === 'wgsl' ? PLACEHOLDER_WGSL_CODE : PLACEHOLDER_TSL_CODE}
                                height="200px"
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: false,
                                    highlightActiveLine: true,
                                    bracketMatching: true,
                                    autocompletion: false, // handled by tslAutocompletion extension
                                }}
                            />
                        </div>

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

                    {/* Input Types Configuration - only show if there are arguments */}
                    {parseResult.isValid && parseResult.arguments.length > 0 && language === 'tsl' && (
                        <div className="space-y-2">
                            <Label>Input Types</Label>
                            <p className="text-xs text-muted-foreground">
                                Configure the type for each input. Use &apos;Any&apos; to accept any value.
                            </p>
                            <div className="flex gap-4 flex-wrap">
                                {parseResult.arguments.map((arg) => (
                                    <div key={arg} className="flex items-center gap-2">
                                        <span className="text-sm font-mono min-w-[80px] text-muted-foreground">
                                            {arg}
                                        </span>
                                        <select
                                            value={inputTypes[arg] || 'any'}
                                            onChange={(e) => setInputTypes(prev => ({ ...prev, [arg]: e.target.value as TSLType }))}
                                            className="flex-1 h-8 px-2 text-sm bg-muted border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                                        >
                                            {PORT_TYPES.map((type) => (
                                                <option key={type.value} value={type.value}>
                                                    {type.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* For WGSL, input types are inferred and not editable */}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={!canCreate || isSaving}>
                        {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {mode === 'create' ? (isSaving ? 'Creating...' : 'Create Node') : (isSaving ? 'Saving...' : 'Save Changes')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
