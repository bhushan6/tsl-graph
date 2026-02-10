'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HexColorPicker } from 'react-colorful';
import { useEdges } from '@xyflow/react';
import { VectorInput } from './inputs/VectorInput';
import { BooleanInput } from './inputs/BooleanInput';
import { AnyInput } from './inputs/AnyInput';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';
import type { SubgraphPort, TSLType, CodeNodeDefinition, TSLValueType, AppNode } from '@/lib/types';
import { getMultiOpInputs, getMultiOpLabel, type MultiOp } from '@/lib/multi-op';
import { Layers, Plus, Trash2, Upload, Code } from 'lucide-react';
import { NodePreview } from './NodePreview';
import { CodeNodeDialog } from './CodeNodeDialog';
import { AssetInput } from './inputs/AssetInput';
import { Id } from '@/convex/_generated/dataModel';
import { UNIFORM_KINDS, getUniformKindFromNode, getUniformDefaultValue, type UniformKind } from '@/lib/uniform-utils';
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarInput,
} from '@/components/ui/sidebar';

// Type options for port type selector
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

const LOOP_MODE_OPTIONS = [
    { label: 'Count', value: 'count' },
    { label: 'Range', value: 'range' },
    { label: 'Reverse', value: 'reverse' },
    { label: 'Nested', value: 'nested' },
    { label: 'Condition', value: 'condition' },
];

const LOOP_TYPE_OPTIONS = [
    { label: 'Int', value: 'int' },
    { label: 'Float', value: 'float' },
];

const LOOP_COMPARE_OPTIONS = [
    { label: '<', value: '<' },
    { label: '<=', value: '<=' },
    { label: '>', value: '>' },
    { label: '>=', value: '>=' },
];

interface AnchorNodePortEditorProps {
    nodeId: string;
    dynamicPorts: SubgraphPort[];
    isInputAnchor: boolean;
    onAddPort: (port: SubgraphPort) => void;
    onRemovePort: (portId: string) => void;
    onUpdatePort: (portId: string, updates: Partial<SubgraphPort>) => void;
}

function AnchorNodePortEditor({
    dynamicPorts,
    isInputAnchor,
    onAddPort,
    onRemovePort,
    onUpdatePort,
}: AnchorNodePortEditorProps) {
    const handleAddPort = useCallback(() => {
        const newId = `${isInputAnchor ? 'in' : 'out'}_${Date.now()}`;
        const portNumber = dynamicPorts.length + 1;
        onAddPort({
            id: newId,
            label: `${isInputAnchor ? 'Input' : 'Output'} ${portNumber}`,
            type: 'any',
        });
    }, [isInputAnchor, dynamicPorts.length, onAddPort]);

    return (
        <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">
                    {isInputAnchor ? 'Subgraph Inputs' : 'Subgraph Outputs'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {isInputAnchor
                        ? 'Define inputs for your custom node'
                        : 'Define outputs for your custom node'}
                </p>
            </div>

            {/* Port List */}
            <div className="flex-1 overflow-y-auto p-4">
                {dynamicPorts.length === 0 ? (
                    <p className="text-sm text-muted-foreground mb-4">
                        No ports defined. Add ports to create the subgraph interface.
                    </p>
                ) : (
                    <SidebarGroup className="p-0">
                        <SidebarGroupContent className="gap-2">
                            {dynamicPorts.map((port, index) => (
                                <div
                                    key={port.id}
                                    className="flex flex-col gap-2 p-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground w-4 font-mono">
                                            #{index + 1}
                                        </span>
                                        <SidebarInput
                                            type="text"
                                            value={port.label}
                                            onChange={(e) =>
                                                onUpdatePort(port.id, { label: e.target.value })
                                            }
                                            placeholder="Port name"
                                            className="h-7 text-xs"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onRemovePort(port.id)}
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <select
                                        value={port.type}
                                        onChange={(e) =>
                                            onUpdatePort(port.id, { type: e.target.value as TSLType })
                                        }
                                        className="h-7 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
                                    >
                                        {PORT_TYPES.map((type) => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {/* For outputs, limit to 1 port (single output restriction) */}
                {(isInputAnchor || dynamicPorts.length === 0) && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddPort}
                        className="w-full gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add {isInputAnchor ? 'Input' : 'Output'}
                    </Button>
                )}
                {!isInputAnchor && dynamicPorts.length >= 1 && (
                    <p className="text-xs text-muted-foreground text-center">
                        Subgraphs are limited to a single output
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Hook to reactively get a node's input value from the store.
 */
function useNodeInputValue(nodeId: string, inputKey: string, defaultValue: TSLValueType | undefined): TSLValueType {
    return useEditorStore((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        const value = node?.data.values?.[inputKey];
        if (value !== undefined) return value;
        return defaultValue !== undefined ? defaultValue : 0;
    });
}

// Panel for subgraph instances - simplified since templates auto-save
interface SubgraphInstancePanelProps {
    subgraph: {
        id: string;
        name: string;
        templateId?: string;
        templateVersion?: number;
    };
    onEnterEditor: () => void;
}

function SubgraphInstancePanel({ subgraph, onEnterEditor }: SubgraphInstancePanelProps) {
    const isSynced = !!subgraph.templateId;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">{subgraph.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Custom Subgraph
                    {isSynced && (
                        <span className="ml-1 text-green-500">• Synced</span>
                    )}
                </p>
            </div>

            {/* Actions */}
            <div className="flex-1 p-4 space-y-3">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onEnterEditor}
                    className="w-full gap-2"
                >
                    <Layers className="w-4 h-4" />
                    Edit Subgraph
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                    Edit the internal graph of this custom node
                </p>
            </div>
        </div>
    );
}



function CodeNodeInstancePanel({
    codeNode,
    nodeId,
    connectedInputs,
    onEdit
}: {
    codeNode: CodeNodeDefinition;
    nodeId: string;
    connectedInputs: Set<string | null | undefined>;
    onEdit: () => void;
}) {
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);

    // Get unconnected inputs from the code node
    const editableInputs = codeNode.inputs.filter(
        input => !connectedInputs.has(input.id)
    );

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-sidebar-border">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Code Node</h3>
                    <Button variant="outline" size="sm" onClick={onEdit} className="h-7 text-xs gap-1.5">
                        <Code className="w-3.5 h-3.5" />
                        Edit Code
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {codeNode.name}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Editable Inputs Section */}
                {editableInputs.length > 0 && (
                    <div className="space-y-4">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Input Values
                        </h4>
                        <div className="flex flex-col gap-4">
                            {editableInputs.map((input) => (
                                <PropertyInputWrapper
                                    key={input.id}
                                    nodeId={nodeId}
                                    inputKey={input.id}
                                    inputType={input.type}
                                    inputLabel={input.label}
                                    inputDefault={getDefaultForType(input.type)}
                                    onChange={(v) => updateNodeValue(nodeId, input.id, v)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Show message if all inputs are connected */}
                {codeNode.inputs.length > 0 && editableInputs.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        All inputs are connected
                    </p>
                )}

                {/* Code Preview Section */}
                <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</h4>
                    <div className="font-mono text-[10px] bg-muted/50 p-2 rounded-md overflow-x-auto whitespace-pre text-muted-foreground/80 border border-border/50">
                        {codeNode.code}
                        {/* {codeNode.code.split('\n').length > 8 && '\n...'} */}
                    </div>
                </div>
            </div>
        </div>
    );
}

function LoopGroupPanel({ node }: { node: AppNode }) {
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const setLoopMode = useEditorStore((s) => s.setLoopMode);

    const loopMode = String(node.data.values?.loopMode ?? 'count');
    const loopType = String(node.data.values?.loopType ?? 'int');
    const loopCompare = String(node.data.values?.loopCompare ?? (loopMode === 'reverse' ? '>' : '<'));
    const showRangeOptions = loopMode === 'range' || loopMode === 'reverse';

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">Loop</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {node.data.localName || node.id}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                        Mode
                    </label>
                    <select
                        value={loopMode}
                        onChange={(e) => setLoopMode(node.id, e.target.value)}
                        className="h-8 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
                    >
                        {LOOP_MODE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {showRangeOptions && (
                    <>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                                Type
                            </label>
                            <select
                                value={loopType}
                                onChange={(e) => updateNodeValue(node.id, 'loopType', e.target.value)}
                                className="h-8 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
                            >
                                {LOOP_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                                Compare
                            </label>
                            <select
                                value={loopCompare}
                                onChange={(e) => updateNodeValue(node.id, 'loopCompare', e.target.value)}
                                className="h-8 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
                            >
                                {LOOP_COMPARE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function UniformNodePanel({
    node,
    debugMode,
    updateNodeValue,
    setUniformType,
}: {
    node: AppNode;
    debugMode: boolean;
    updateNodeValue: (nodeId: string, key: string, value: TSLValueType) => void;
    setUniformType: (nodeId: string, newKind: UniformKind) => void;
}) {
    const uniformKind = getUniformKindFromNode(node);
    const uniformValue = useNodeInputValue(node.id, 'value', getUniformDefaultValue(uniformKind));

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">Uniform</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {node.data.localName || node.id}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {debugMode && <NodePreview />}

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                            Type
                        </label>
                        <select
                            value={uniformKind}
                            onChange={(e) => setUniformType(node.id, e.target.value as UniformKind)}
                            className="h-8 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
                        >
                            {UNIFORM_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {kind}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                            Value
                        </label>
                        <PropertyInput
                            type={uniformKind}
                            value={uniformValue}
                            onChange={(v) => updateNodeValue(node.id, 'value', v)}
                            nodeId={node.id}
                            propertyName="value"
                            immediate={true}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function MultiOpNodePanel({
    node,
    connectedInputs,
}: {
    node: AppNode;
    connectedInputs: Set<string | null | undefined>;
}) {
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const debugMode = useEditorStore((s) => s.debugMode);
    const operations = Array.isArray(node.data.operations) ? (node.data.operations as MultiOp[]) : [];
    const inputs = getMultiOpInputs(operations);
    const editableInputs = inputs.filter((input) => !connectedInputs.has(input.handleId));

    const inputsByOp = operations.map((op, index) => ({
        op,
        index,
        inputs: editableInputs.filter((input) => input.opId === op.id),
    }));

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">Multi-op</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {node.data.localName || node.id}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {debugMode && <NodePreview />}
                {operations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No operations yet. Add operations on the node.
                    </p>
                ) : editableInputs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">All inputs are connected</p>
                ) : (
                    <div className="flex flex-col gap-6">
                        {inputsByOp.map((group) => (
                            <div key={group.op.id} className="space-y-3">
                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                    Step {group.index + 1} · {getMultiOpLabel(group.op.op)}
                                </div>
                                <div className="rounded-md border border-sidebar-border/60 bg-sidebar-accent/30 p-3">
                                    {group.inputs.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">All inputs connected</p>
                                    ) : (
                                        <div className="flex flex-col gap-4">
                                            {group.inputs.map((input) => (
                                                <PropertyInputWrapper
                                                    key={input.handleId}
                                                    nodeId={node.id}
                                                    inputKey={input.handleId}
                                                    inputType={input.param.type}
                                                    inputLabel={input.param.label}
                                                    inputDefault={input.param.default}
                                                    onChange={(v) => updateNodeValue(node.id, input.handleId, v)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper function to get default value for a type
function getDefaultForType(type: string): TSLValueType {
    switch (type) {
        case 'color': return '#ffffff';
        case 'bool': return false;
        case 'vec2': return [0, 0];
        case 'vec3': return [0, 0, 0];
        case 'vec4': return [0, 0, 0, 0];
        case 'int':
        case 'uint':
        case 'float':
        default: return 0;
    }
}

function PropertiesPanelContent() {
    const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
    // Subscribe to the selected node reactively
    const node = useEditorStore((s) =>
        s.nodes.find((n) => n.id === s.selectedNodeId)
    );
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const setUniformType = useEditorStore((s) => s.setUniformType);
    const addDynamicPort = useEditorStore((s) => s.addDynamicPort);
    const removeDynamicPort = useEditorStore((s) => s.removeDynamicPort);
    const updateDynamicPort = useEditorStore((s) => s.updateDynamicPort);
    const enterSubgraphEditor = useEditorStore((s) => s.enterSubgraphEditor);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const getCodeNode = useEditorStore((s) => s.getCodeNode);
    const codeNodes = useEditorStore((s) => s.codeNodes);
    const debugMode = useEditorStore((s) => s.debugMode);
    const edges = useEdges();

    const [editingCodeNodeId, setEditingCodeNodeId] = useState<string | null>(null);

    // Handle no node selected
    if (!node) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a node to edit properties
            </div>
        );
    }

    // Check if this is an anchor node
    const isAnchorNode = node.data.type === 'subgraph/input' || node.data.type === 'subgraph/output';
    const isInputAnchor = node.data.type === 'subgraph/input';

    // Check if this is a subgraph instance (custom node)
    const isSubgraphInstance = node.data.type.startsWith('custom/');
    const subgraph = isSubgraphInstance ? subgraphs[node.data.type] : null;

    // For subgraph instances, show edit button
    if (isSubgraphInstance && subgraph) {
        return (
            <SubgraphInstancePanel
                subgraph={subgraph}
                onEnterEditor={() => enterSubgraphEditor(node.data.type)}
            />
        );
    }

    // Compute connected inputs before code node check (needed for both cases)
    const connectedInputs = new Set(
        edges.filter((e) => e.target === selectedNodeId).map((e) => e.targetHandle)
    );

    // Check if this is a code node instance
    const isCodeNodeInstance = node.data.type.startsWith('code/') || !!codeNodes[node.data.type];
    const codeNode = isCodeNodeInstance ? (getCodeNode(node.data.type) || codeNodes[node.data.type]) : null;

    if (isCodeNodeInstance && codeNode) {
        return (
            <>
                <CodeNodeInstancePanel
                    codeNode={codeNode}
                    nodeId={node.id}
                    connectedInputs={connectedInputs}
                    onEdit={() => setEditingCodeNodeId(codeNode.id)}
                />
                {editingCodeNodeId && (
                    <CodeNodeDialog
                        open={!!editingCodeNodeId}
                        onOpenChange={(open) => !open && setEditingCodeNodeId(null)}
                        mode="edit"
                        nodeId={editingCodeNodeId}
                        initialName={codeNode.name}
                        initialCode={codeNode.code}
                    />
                )}
            </>
        );
    }

    if (node.data.type === 'const/uniform') {
        return (
            <UniformNodePanel
                node={node}
                debugMode={debugMode}
                updateNodeValue={updateNodeValue}
                setUniformType={setUniformType}
            />
        );
    }

    if (node.data.type === 'math/multiOp') {
        return (
            <MultiOpNodePanel
                node={node}
                connectedInputs={connectedInputs}
            />
        );
    }

    if (node.data.type === 'loop') {
        return <LoopGroupPanel node={node} />;
    }

    const def = registry.get(node.data.type);

    if (!def) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a node to edit properties
            </div>
        );
    }

    // For anchor nodes, show port management UI
    if (isAnchorNode) {
        return (
            <AnchorNodePortEditor
                nodeId={node.id}
                dynamicPorts={node.data.dynamicPorts || []}
                isInputAnchor={isInputAnchor}
                onAddPort={(port) => addDynamicPort(node.id, port)}
                onRemovePort={(portId) => removeDynamicPort(node.id, portId)}
                onUpdatePort={(portId, updates) => updateDynamicPort(node.id, portId, updates)}
            />
        );
    }

    const inputs = def.inputs ?? {};
    const inputKeys = Object.keys(inputs);
    const editableInputs = inputKeys.filter((key) =>
        !connectedInputs.has(key) && !inputs[key].connectionOnly
    );

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 py-3 border-b border-sidebar-border">
                <h3 className="font-semibold text-sm">{def.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {node.data.localName || node.id}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* Node Preview - only shown in debug mode */}
                {debugMode && <NodePreview />}

                {editableInputs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {inputKeys.length === 0
                            ? 'This node has no editable properties'
                            : 'All inputs are connected'}
                    </p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {editableInputs.map((key) => {
                            const input = inputs[key];

                            return (
                                <PropertyInputWrapper
                                    key={key}
                                    nodeId={node.id}
                                    inputKey={key}
                                    inputType={input.type}
                                    inputLabel={input.label}
                                    inputDefault={input.default}
                                    inputOptions={input.options}
                                    onChange={(v) => updateNodeValue(node.id, key, v)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

interface PropertyInputWrapperProps {
    nodeId: string;
    inputKey: string;
    inputType: string;
    inputLabel: string;
    inputDefault: TSLValueType | undefined;
    inputOptions?: readonly { label: string; value: string | number }[];
    onChange: (value: TSLValueType) => void;
}

/**
 * Wrapper that subscribes to the store for this specific input's value.
 */
function PropertyInputWrapper({
    nodeId,
    inputKey,
    inputType,
    inputLabel,
    inputDefault,
    inputOptions,
    onChange
}: PropertyInputWrapperProps) {
    // Subscribe reactively to this specific value
    const value = useNodeInputValue(nodeId, inputKey, inputDefault);
    const projectId = useEditorStore((s) => s.projectId);

    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium text-sidebar-foreground/70 uppercase tracking-wider">
                {inputLabel}
            </label>
            <PropertyInput
                type={inputType}
                value={value}
                options={inputOptions}
                onChange={onChange}
                nodeId={nodeId}
                propertyName={inputKey}
                projectId={projectId}
            />
        </div>
    );
}

interface PropertyInputProps {
    type: string;
    value: TSLValueType;
    options?: readonly { label: string; value: string | number }[];
    onChange: (value: TSLValueType) => void;
    nodeId?: string;
    propertyName?: string;
    projectId?: string | null;
    immediate?: boolean;
}

function PropertyInput({ type, value, options, onChange, nodeId, propertyName, projectId, immediate = false }: PropertyInputProps) {
    if (options && options.length > 0) {
        return (
            <select
                value={String(value ?? options[0].value)}
                onChange={(e) => {
                    // Try to preserve type if original values were numbers
                    const val = e.target.value;
                    const originalOption = options.find(o => String(o.value) === val);
                    onChange(originalOption ? originalOption.value : val);
                }}
                className="h-8 px-2 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground w-full outline-none focus:ring-2 focus:ring-sidebar-ring"
            >
                {options.map((opt) => (
                    <option key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    if (type === 'any') {
        return <AnyInput value={value} onChange={onChange} immediate={immediate} />;
    }
    if (type === 'string') {
        // Use AssetInput for string types when we have nodeId (for texture uploads)
        if (nodeId && propertyName) {
            return (
                <AssetInput
                    value={value as string}
                    onChange={(url) => onChange(url)}
                    graphId={projectId as Id<"projects"> | undefined}
                    nodeId={nodeId}
                    propertyName={propertyName}
                    accept="image/*"
                />
            );
        }
        return <StringInput value={String(value ?? '')} onChange={onChange} />;
    }
    if (type === 'color') {
        return <ColorInput value={String(value ?? '#ffffff')} onChange={onChange} immediate={immediate} />;
    }
    if (type === 'bool') {
        return <BooleanInput value={value} onChange={onChange} />;
    }
    if (type === 'vec2') {
        return <VectorInput size={2} value={Array.isArray(value) ? value : Number(value ?? 0)} onChange={onChange} labels={['X', 'Y']} immediate={immediate} />;
    }
    if (type === 'vec3') {
        return <VectorInput size={3} value={Array.isArray(value) ? value : Number(value ?? 0)} onChange={onChange} labels={['X', 'Y', 'Z']} immediate={immediate} />;
    }
    if (type === 'vec4') {
        return <VectorInput size={4} value={Array.isArray(value) ? value : Number(value ?? 0)} onChange={onChange} labels={['X', 'Y', 'Z', 'W']} immediate={immediate} />;
    }

    return (
        <NumberInput
            value={Number(value ?? 0)}
            onChange={onChange}
            step={type === 'int' || type === 'uint' ? 1 : 0.1}
            immediate={immediate}
        />
    );
}

function StringInput({ value, onChange }: { value: string; onChange: (value: TSLValueType) => void }) {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            onChange(url);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2">
                <SidebarInput
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-8 text-xs flex-1"
                    placeholder="Image URL..."
                />
                <div className="relative">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        title="Upload image"
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                        <Upload className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {value && (
                <div className="relative w-full aspect-square rounded-md overflow-hidden border border-sidebar-border bg-checkered">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={value}
                        alt="Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function ColorInput({
    value,
    onChange,
    immediate = false,
}: {
    value: string;
    onChange: (value: TSLValueType) => void;
    immediate?: boolean;
}) {
    const [localColor, setLocalColor] = useState(value);
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalColor(value);
    }, [value]);

    const handleColorChange = useCallback((newColor: string) => {
        setLocalColor(newColor);
        if (immediate) {
            onChange(newColor);
        } else {
            debouncedOnChange(newColor);
        }
    }, [debouncedOnChange, immediate, onChange]);

    return (
        <div className="flex flex-col gap-3">
            <div className="relative">
                <HexColorPicker
                    color={localColor}
                    onChange={handleColorChange}
                    style={{ width: '100%', height: '140px' }}
                />
            </div>
            <div className="flex items-center gap-2">
                <div
                    className="w-8 h-8 rounded-md border border-sidebar-border shadow-sm shrink-0"
                    style={{ backgroundColor: localColor }}
                />
                <SidebarInput
                    type="text"
                    value={localColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="h-8 font-mono uppercase text-xs"
                    maxLength={7}
                />
            </div>
        </div>
    );
}

function NumberInput({
    value,
    onChange,
    step,
    immediate = false,
}: {
    value: number;
    onChange: (value: TSLValueType) => void;
    step?: number;
    immediate?: boolean;
}) {
    const [localValue, setLocalValue] = useState<string>(String(value));
    const debouncedOnChange = useDebouncedCallback(onChange, 100);

    useEffect(() => {
        setLocalValue(String(value));
    }, [value]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        // Allow empty, minus sign, or valid number patterns (including negative)
        if (inputValue === '' || inputValue === '-' || inputValue === '.' || inputValue === '-.') {
            setLocalValue(inputValue);
            return;
        }
        // Check if it's a valid number pattern
        if (/^-?\d*\.?\d*$/.test(inputValue)) {
            setLocalValue(inputValue);
            const parsed = parseFloat(inputValue);
            if (!isNaN(parsed)) {
                if (immediate) {
                    onChange(parsed);
                } else {
                    debouncedOnChange(parsed);
                }
            }
        }
    }, [debouncedOnChange, immediate, onChange]);

    const handleBlur = useCallback(() => {
        // On blur, normalize the value
        const parsed = parseFloat(localValue);
        const normalized = isNaN(parsed) ? 0 : parsed;
        setLocalValue(String(normalized));
        onChange(normalized);
    }, [localValue, onChange]);

    return (
        <SidebarInput
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            className="h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-xs"
        />
    );
}

function PropertiesPanelComponent() {
    const selectedNodeId = useEditorStore((s) => s.selectedNodeId);

    // Hide panel when no node is selected
    if (!selectedNodeId) {
        return null;
    }

    return (
        <div
            className={cn(
                'pointer-events-auto w-72 shrink flex-1 min-h-0',
                'bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-xl shadow-lg',
                'flex flex-col overflow-hidden'
            )}
        >
            <PropertiesPanelContent />
        </div>
    );
}

export const PropertiesPanel = memo(PropertiesPanelComponent);
