'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/store/editor';
import { registry } from '@/lib/registry';
import { nodeMatchesNoteQuery } from '@/lib/note-search';
import type { AppNode } from '@/lib/types';
import { cn, getAbsolutePosition, getNodeDimensions } from '@/lib/utils';

interface NoteSearchBarProps {
    open: boolean;
    onClose: () => void;
}

// Jumping to a match at the current zoom can land on a node too small to read;
// zoom in to at least this level so the result is always legible.
const MIN_FOCUS_ZOOM = 0.85;

export function NoteSearchBar({ open, onClose }: NoteSearchBarProps) {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastAutoQueryRef = useRef('');

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
            .filter((node) => nodeMatchesNoteQuery(node, getDisplayName(node), normalizedQuery))
            .map((node) => node.id);
    }, [nodes, debouncedQuery, getDisplayName]);

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
                zoom: Math.max(getZoom(), MIN_FOCUS_ZOOM),
                duration: 300,
            });
        },
        [matchIds, nodes, selectSingleNode, setCenter, getZoom]
    );

    const handleNext = useCallback(() => {
        focusMatch(activeIndex + 1);
    }, [activeIndex, focusMatch]);

    const handlePrev = useCallback(() => {
        focusMatch(activeIndex - 1);
    }, [activeIndex, focusMatch]);

    useEffect(() => {
        if (!open) return;
        const handle = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(handle);
    }, [open]);

    useEffect(() => {
        if (!open) {
            lastAutoQueryRef.current = '';
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const trimmed = debouncedQuery.trim();
        if (!trimmed) {
            lastAutoQueryRef.current = '';
            if (activeIndex !== 0) {
                setActiveIndex(0);
            }
            return;
        }
        if (lastAutoQueryRef.current !== trimmed) {
            lastAutoQueryRef.current = trimmed;
            if (matchIds.length > 0) {
                focusMatch(0);
            } else if (activeIndex !== 0) {
                setActiveIndex(0);
            }
        }
    }, [open, debouncedQuery, matchIds.length, focusMatch, activeIndex]);

    useEffect(() => {
        if (activeIndex >= matchIds.length) {
            setActiveIndex(matchIds.length > 0 ? matchIds.length - 1 : 0);
        }
    }, [activeIndex, matchIds.length]);

    const matchCount = matchIds.length;
    const matchDisplay = matchCount === 0 ? '0/0' : `${activeIndex + 1}/${matchCount}`;

    return (
        <div
            className={cn(
                "pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-background/95 px-2 py-1 shadow-sm",
                open ? "opacity-100" : "hidden"
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
