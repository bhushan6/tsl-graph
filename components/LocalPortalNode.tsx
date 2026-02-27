'use client';

import { memo, useCallback, useMemo } from 'react';
import { Position } from '@xyflow/react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor';
import { TSLHandle } from './TSLHandle';
import { getLocalSetReferenceLabel, getLocalSourceId, isLocalGetType, isLocalSetType } from '@/lib/local-utils';
import type { AppNode } from '@/lib/types';
import type { NodeProps } from '@xyflow/react';

type LocalPortalNodeProps = NodeProps<AppNode>;

function LocalPortalNodeComponent({ id, data, selected }: LocalPortalNodeProps) {
    const edges = useEditorStore((s) => s.edges);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const isLocalSet = isLocalSetType(data.type);
    const isLocalGet = isLocalGetType(data.type);

    const connectedInputs = useMemo(() => {
        return new Set(
            edges.filter((edge) => edge.target === id).map((edge) => edge.targetHandle)
        );
    }, [edges, id]);
    const connectedOutputs = useMemo(() => {
        return new Set(
            edges.filter((edge) => edge.source === id).map((edge) => edge.sourceHandle)
        );
    }, [edges, id]);

    const localSourceIdValue = data.values?.localSourceId;
    const localSourceId = isLocalGet && typeof localSourceIdValue === 'string' && localSourceIdValue.length > 0
        ? localSourceIdValue
        : null;

    const setSourceLabel = useEditorStore(useCallback((s) => {
        if (!isLocalSet) return '';
        const nodesById = new Map(s.nodes.map((node) => [node.id, node]));
        return getLocalSetReferenceLabel({ id, data } as AppNode, nodesById, s.edges);
    }, [data, id, isLocalSet]));

    const localSetUsageCount = useEditorStore(useCallback((s) => {
        if (!isLocalSet) return 0;
        let count = 0;
        for (const node of s.nodes) {
            if (isLocalGetType(node.data.type) && getLocalSourceId(node) === id) count += 1;
        }
        return count;
    }, [id, isLocalSet]));

    const isBoundSetValid = useEditorStore(useCallback((s) => {
        if (!localSourceId) return false;
        const setNode = s.nodes.find((node) => node.id === localSourceId);
        return !!setNode && isLocalSetType(setNode.data.type);
    }, [localSourceId]));

    const boundVariableName = useEditorStore(useCallback((s) => {
        if (!localSourceId) return '';
        const nodesById = new Map(s.nodes.map((node) => [node.id, node]));
        const setNode = nodesById.get(localSourceId);
        if (!setNode || !isLocalSetType(setNode.data.type)) return localSourceId;
        return getLocalSetReferenceLabel(setNode, nodesById, s.edges);
    }, [localSourceId]));

    const isLinkedToSelection = useEditorStore(useCallback((s) => {
        if (selected) return false;
        const localBindingId = isLocalSet ? id : (isLocalGet ? localSourceId : null);
        if (!localBindingId) return false;

        const nodesById = new Map(s.nodes.map((node) => [node.id, node]));
        for (const selectedId of s.selectedNodeIds) {
            const selectedNode = nodesById.get(selectedId);
            if (!selectedNode) continue;

            if (isLocalSetType(selectedNode.data.type) && selectedNode.id === localBindingId) {
                return true;
            }

            if (isLocalGetType(selectedNode.data.type)) {
                const selectedSourceId = getLocalSourceId(selectedNode);
                if (selectedSourceId && selectedSourceId === localBindingId) {
                    return true;
                }
            }
        }
        return false;
    }, [id, isLocalGet, isLocalSet, localSourceId, selected]));

    const statusText = !localSourceId
        ? 'Unbound'
        : (isBoundSetValid ? `Var ${boundVariableName || 'local'}` : `Dangling (${localSourceId})`);

    return (
        <div
            className={cn(
                'min-w-[50px] flex flex-col rounded-xl shadow-lg overflow-hidden',
                'bg-white/95 shadow-gray-300/50',
                'dark:bg-card/95 dark:shadow-black/30',
                'backdrop-blur-sm transition-shadow duration-150',
                selected && 'shadow-xl dark:shadow-black/50 shadow-gray-400/50',
                isLinkedToSelection && 'ring-2 ring-amber-400/80'
            )}
        >
            <div
                className={cn(
                    'flex flex-col gap-0.5 px-3 pt-2 pb-1 rounded-t-xl border-b transition-colors duration-150',
                    'border-amber-500 bg-amber-100 dark:bg-amber-900/20',
                    selected ? 'border-blue-500' : 'border-gray-200 dark:border-white/10'
                )}
            >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-800 dark:text-white/90 truncate">
                    {isLocalSet ? 'Set Local' : 'Get Local'}
                </span>
                {isLocalSet ? (
                    <span className="text-[9px] text-gray-500 dark:text-white/50 tracking-wider truncate block">
                        {`Var ${setSourceLabel || 'Unbound'} • ${localSetUsageCount} use${localSetUsageCount === 1 ? '' : 's'}`}
                    </span>
                ) : (
                    <span className={cn(
                        'text-[9px] tracking-wider truncate block',
                        isBoundSetValid ? 'text-gray-500 dark:text-white/50' : 'text-red-500 dark:text-red-300'
                    )}>
                        {statusText}
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-0 pt-1 pb-1.5 rounded-b-xl">
                <div className="flex items-center justify-between min-h-[22px]">
                    <div className="flex items-center flex-1 min-w-0 mr-2">
                        {isLocalSet ? (
                            <TSLHandle
                                id="value"
                                type="target"
                                position={Position.Left}
                                dataType="any"
                                label="Value"
                                isConnected={connectedInputs.has('value')}
                                isDark={isDark}
                            />
                        ) : (
                            <div className="flex-1" />
                        )}
                    </div>
                    <div className="flex items-center shrink-0">
                        <TSLHandle
                            id="out"
                            type="source"
                            position={Position.Right}
                            dataType="any"
                            label="Out"
                            isConnected={connectedOutputs.has('out')}
                            isDark={isDark}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export const LocalPortalNode = memo(LocalPortalNodeComponent);
