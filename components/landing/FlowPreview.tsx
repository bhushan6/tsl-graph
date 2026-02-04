'use client';

import { ReactFlow, Background, Node, Edge, NodeTypes, Position, Handle, useReactFlow, NodeProps, applyNodeChanges, applyEdgeChanges, addEdge, NodeChange, EdgeChange, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FakeNode } from './FakeNode';
import { DotGridShader } from './DotGridShader';
import { useCallback, useState } from 'react';
import { uniform } from 'three/tsl';

interface FakeNodeData extends Record<string, unknown> {
    title: string;
    category?: 'Math' | 'Constants' | 'Geometry' | 'Material' | 'Subgraph' | 'Texture' | 'Model' | 'Advanced' | 'Noise' | 'Utils' | 'Default';
    inputs: {
        label: string;
        value: number;
        min: number;
        max: number;
        step?: number;
    }[];
}

// Wrapper to adapt React Flow NodeProps to FakeNodeProps
const FakeNodeWrapper = ({ id, data }: NodeProps<Node<FakeNodeData>>) => {
    const { updateNodeData } = useReactFlow();

    const inputsWithHandlers = data.inputs.map((input, index) => ({
        ...input,
        onChange: (val: number) => {
            const newInputs = [...data.inputs];
            newInputs[index] = { ...newInputs[index], value: val };
            updateNodeData(id, { inputs: newInputs });
        }
    }));

    return (
        <div className="relative">
            {/* We need handles for React Flow edges to connect, even if visually we use FakeNode's simulated handles */}
            <Handle type="target" position={Position.Left} className="opacity-0 w-full h-full" />
            <FakeNode
                title={data.title}
                category={data.category}
                inputs={inputsWithHandlers}
                style={{
                    pointerEvents: "all"
                }}
            >
                {data.title === 'Output' && (
                    <div className="flex flex-col gap-2">
                        <div className="w-[300px] h-[300px] rounded-lg overflow-hidden border border-border mt-2 bg-black/80 nodrag cursor-auto">
                            <DotGridShader />
                        </div>
                        <a
                            href="https://www.tsl-graph.xyz/share/jn77yctrgpz23thmvan45zwa0n80e6jc"
                            className="text-xs text-muted-foreground hover:text-primary text-center underline transition-colors"
                        >
                            Open in Editor ↗
                        </a>
                    </div>
                )}
            </FakeNode>
            <Handle type="source" position={Position.Right} className="opacity-0 w-full h-full" />
        </div>
    );
};

const nodeTypes: NodeTypes = {
    fakeNode: FakeNodeWrapper,
};

const initialEdges: Edge[] = [
    { id: 'e1-2', source: '1', target: '3', animated: true, style: { stroke: '#a855f7', strokeWidth: 2 } },
    { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
    { id: 'e4-3', source: '4', target: '3', animated: true, style: { stroke: '#22c55e', strokeWidth: 2 } },
];

const defaultSpeed = 2;
const defaultFreq = 0.5;
const defaultSize = 0.5;

const initialNodes: Node[] = [{
    id: '1',
    type: 'fakeNode',
    position: { x: 500, y: -200 },
    data: {
        title: 'Float',
        category: 'Utils',
        inputs: [
            { label: 'Speed', value: defaultSpeed, min: 0, max: 10 },
        ]
    },
},
{
    id: '2',
    type: 'fakeNode',
    position: { x: 900, y: 0 },
    data: {
        title: 'Float',
        category: 'Utils',
        inputs: [
            { label: 'Frequency', value: defaultFreq * 10, min: 1, max: 20 },
        ]
    },
},
{
    id: '4',
    type: 'fakeNode',
    position: { x: 500, y: 200 },
    data: {
        title: 'Float',
        category: 'Utils',
        inputs: [
            { label: 'Size', value: defaultSize, min: 0.1, max: 1 },
        ]
    },
},
{
    id: '3',
    type: 'fakeNode',
    position: { x: 1200, y: -200 },
    data: {
        title: 'Output',
        category: 'Default',
        inputs: []
    }
}]

export const uniforms = {
    uSpacing: uniform(1.5),
    uSpeed: uniform(defaultSpeed),
    uFreq: uniform(defaultFreq),
    uSize: uniform(defaultSize),
}


export function FlowPreview() {
    const [nodes, setNodes] = useState<Node[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);

    const onNodesChange = useCallback(
        (changes: NodeChange<Node>[]) => {
            changes.forEach((change) => {
                if (change.type === "replace") {
                    const item = change.item;
                    const data = item.data;
                    const inputs = data.inputs as { label: string; value: number; min: number; max: number; }[];
                    inputs.forEach((input) => {
                        if (input.label === "Speed") {
                            uniforms.uSpeed.value = input.value;
                        }
                        if (input.label === "Frequency") {
                            uniforms.uFreq.value = input.value / 10;
                        }
                        if (input.label === "Strength") {
                            uniforms.uSpacing.value = input.value;
                        }
                        if (input.label === "Size") {
                            uniforms.uSize.value = input.value;
                        }
                    })
                }
            })
            setNodes((nodesSnapshot) => {
                return applyNodeChanges<Node>(changes, nodesSnapshot)
            })
        },
        [],
    );
    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
        [],
    );
    const onConnect = useCallback(
        (params: Connection) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
        [],
    );
    return (
        <div className="w-full h-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                nodesConnectable={false}
                autoPanOnNodeDrag={false}
                panOnDrag={false}
                zoomOnScroll={false}
                preventScrolling={false}
                elementsSelectable={false}
                proOptions={{ hideAttribution: true }}
                style={{
                    backgroundColor: "#000",
                }}
                fitView
            >
                <Background color="#444" gap={20} size={1} />
            </ReactFlow>
        </div>
    );
}
