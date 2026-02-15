'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import type { AppNode } from '@/lib/types';
import { cn, getAbsolutePosition, getNodeDimensions } from '@/lib/utils';

interface NoteSearchBarProps {
    onClose: () => void;
}

export function NoteSearchBar({ onClose }: NoteSearchBarProps) {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const prevDebouncedRef = useRef('');

    const nodes = useEditorStore((s) => s.nodes);
    const subgraphs = useEditorStore((s) => s.subgraphs);
    const codeNodes = useEditorStore((s) => s.codeNodes);
    const selectSingleNode = useEditorStore((s) => s.selectSingleNode);

    const { setCenter, getZoom } = useReactFlow<AppNode>();

    const getDisplayName = useCallback(
        (node: AppNode) => {
            const def = registry.get(node.data.type);
            if (def?.label) return def.label;
            if (node.data.type.startsWith('custom/')) {
                return subgraphs[node.data.type]?.name || node.data.type.replace('custom/', '');
            }
            if (node.data.type.startsWith('code/')) {
                return codeNodes[node.data.type]?.name || node.data.type.replace('code/', '');
            }
            return node.data.type;
        },
        [subgraphs, codeNodes]
    );

    useEffect(() => {
        const handle = window.setTimeout(() => setDebouncedQuery(query), 500);
        return () => window.clearTimeout(handle);
    }, [query]);

    const matchIds = useMemo(() => {
        const normalizedQuery = debouncedQuery.trim().toLowerCase();
        if (!normalizedQuery) return [];

        return nodes
            .filter((node) => {
                const fields: string[] = [];

                const displayName = getDisplayName(node);
                if (displayName) fields.push(displayName);

                const localName = typeof node.data.values?.localName === 'string' ? node.data.values.localName : '';
                if (localName) fields.push(localName);

                const isGroupLike = node.type === 'group' || node.data.type === 'group' || node.data.type === 'loop';
                if (isGroupLike) {
                    const labelValue =
                        typeof node.data.values?.label === 'string'
                            ? node.data.values.label
                            : node.data.type === 'loop'
                                ? 'Loop'
                                : 'Group';
                    if (labelValue) fields.push(labelValue);
                }

                return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
            })
            .map((node) => node.id);
    }, [nodes, debouncedQuery, getDisplayName]);

    // Reset activeIndex when debounced query changes (render-time state adjustment)
    const trimmedDebounced = debouncedQuery.trim();
    if (trimmedDebounced !== prevDebouncedRef.current) {
        prevDebouncedRef.current = trimmedDebounced;
        if (activeIndex !== 0) {
            setActiveIndex(0);
        }
    }

    // Derive clamped index instead of fixing it up in an effect
    const clampedIndex = matchIds.length > 0 ? Math.min(activeIndex, matchIds.length - 1) : 0;

    const focusMatch = useCallback(
        (index: number) => {
            if (matchIds.length === 0) return;
            const nextIndex = ((index % matchIds.length) + matchIds.length) % matchIds.length;
            const nodeId = matchIds[nextIndex];
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;

            setActiveIndex(nextIndex);
            selectSingleNode(nodeId);

            const absPosition = getAbsolutePosition(node, nodes);
            const { width, height } = getNodeDimensions(node);
            setCenter(absPosition.x + width / 2, absPosition.y + height / 2, {
                zoom: getZoom(),
                duration: 300,
            });
        },
        [matchIds, nodes, selectSingleNode, setCenter, getZoom]
    );

    const handleNext = useCallback(() => {
        focusMatch(clampedIndex + 1);
    }, [clampedIndex, focusMatch]);

    const handlePrev = useCallback(() => {
        focusMatch(clampedIndex - 1);
    }, [clampedIndex, focusMatch]);

    useEffect(() => {
        const handle = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(handle);
    }, []);

    // Navigate viewport to first match when search query changes
    useEffect(() => {
        if (!trimmedDebounced || matchIds.length === 0) return;
        const nodeId = matchIds[0];
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        selectSingleNode(nodeId);
        const absPosition = getAbsolutePosition(node, nodes);
        const { width, height } = getNodeDimensions(node);
        setCenter(absPosition.x + width / 2, absPosition.y + height / 2, {
            zoom: getZoom(),
            duration: 300,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery]);

    const matchCount = matchIds.length;
    const matchDisplay = matchCount === 0 ? '0/0' : `${clampedIndex + 1}/${matchCount}`;

    return (
        <div
            className={cn(
                "pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-background/95 px-2 py-1 shadow-sm",
                "opacity-100"
            )}
        >
            <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find notes..."
                className="h-7 w-56 text-xs"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            handlePrev();
                        } else {
                            handleNext();
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onClose();
                    }
                }}
            />

            <span className="text-[10px] tabular-nums text-muted-foreground min-w-[40px] text-center">
                {matchDisplay}
            </span>

            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePrev}
                disabled={matchCount === 0}
                title="Previous match"
            >
                <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNext}
                disabled={matchCount === 0}
                title="Next match"
            >
                <ChevronDown className="h-4 w-4" />
            </Button>

            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onClose}
                title="Close"
            >
                <X className="h-4 w-4" />
            </Button>
        </div>
    );
}
