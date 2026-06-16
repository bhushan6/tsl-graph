'use client';

import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { Check, Edit2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor';
import type { AppNode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useDebouncedCallback } from '@/utils/useDebouncedCallback';

const DEFAULT_TITLE = 'Comment';
const DEFAULT_MARKDOWN = '';

function toSafeHref(rawHref: string): string | null {
    const trimmed = rawHref.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:')) {
        return trimmed;
    }
    return null;
}

function renderInlineMarkdown(text: string): ReactNode[] {
    const tokens: ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    let cursor = 0;
    let keyIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > cursor) {
            tokens.push(text.slice(cursor, match.index));
        }

        const token = match[0];
        if (token.startsWith('**') && token.endsWith('**')) {
            tokens.push(<strong key={`inline-${keyIndex++}`}>{token.slice(2, -2)}</strong>);
        } else if (token.startsWith('*') && token.endsWith('*')) {
            tokens.push(<em key={`inline-${keyIndex++}`}>{token.slice(1, -1)}</em>);
        } else if (token.startsWith('`') && token.endsWith('`')) {
            tokens.push(
                <code key={`inline-${keyIndex++}`} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px] dark:bg-white/15">
                    {token.slice(1, -1)}
                </code>
            );
        } else if (token.startsWith('[')) {
            const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            const label = linkMatch?.[1] ?? token;
            const href = linkMatch?.[2] ?? '';
            const safeHref = toSafeHref(href);

            if (!safeHref) {
                tokens.push(label);
            } else {
                tokens.push(
                    <a
                        key={`inline-${keyIndex++}`}
                        href={safeHref}
                        className="text-blue-700 underline underline-offset-2 dark:text-blue-300"
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                    >
                        {label}
                    </a>
                );
            }
        } else {
            tokens.push(token);
        }

        cursor = match.index + token.length;
    }

    if (cursor < text.length) {
        tokens.push(text.slice(cursor));
    }

    return tokens;
}

function renderBasicMarkdown(markdown: string): ReactNode {
    const normalized = markdown.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const blocks: ReactNode[] = [];
    let index = 0;
    let blockKey = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            index += 1;
            continue;
        }

        if (trimmed.startsWith('```')) {
            const codeLines: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                codeLines.push(lines[index]);
                index += 1;
            }
            if (index < lines.length) index += 1;
            blocks.push(
                <pre key={`block-${blockKey++}`} className="mb-2 overflow-x-auto rounded-md border border-black/10 bg-black/5 p-2 font-mono text-[11px] dark:border-white/10 dark:bg-white/5">
                    <code>{codeLines.join('\n')}</code>
                </pre>
            );
            continue;
        }

        const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const content = renderInlineMarkdown(headingMatch[2].trim());
            if (level === 1) {
                blocks.push(<h1 key={`block-${blockKey++}`} className="mb-2 text-sm font-semibold">{content}</h1>);
            } else if (level === 2) {
                blocks.push(<h2 key={`block-${blockKey++}`} className="mb-2 text-sm font-semibold">{content}</h2>);
            } else {
                blocks.push(<h3 key={`block-${blockKey++}`} className="mb-1 text-xs font-semibold">{content}</h3>);
            }
            index += 1;
            continue;
        }

        if (/^\s*[-*]\s+/.test(line)) {
            const items: string[] = [];
            while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^\s*[-*]\s+/, '').trim());
                index += 1;
            }
            blocks.push(
                <ul key={`block-${blockKey++}`} className="mb-2 list-disc space-y-1 pl-4">
                    {items.map((item, itemIndex) => (
                        <li key={`ul-${blockKey}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                    ))}
                </ul>
            );
            continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            const items: string[] = [];
            while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^\s*\d+\.\s+/, '').trim());
                index += 1;
            }
            blocks.push(
                <ol key={`block-${blockKey++}`} className="mb-2 list-decimal space-y-1 pl-4">
                    {items.map((item, itemIndex) => (
                        <li key={`ol-${blockKey}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                    ))}
                </ol>
            );
            continue;
        }

        if (/^>\s?/.test(line)) {
            const quoteLines: string[] = [];
            while (index < lines.length && /^>\s?/.test(lines[index])) {
                quoteLines.push(lines[index].replace(/^>\s?/, ''));
                index += 1;
            }
            blocks.push(
                <blockquote key={`block-${blockKey++}`} className="mb-2 border-l-2 border-foreground/30 pl-2 italic text-foreground/75">
                    {renderInlineMarkdown(quoteLines.join(' '))}
                </blockquote>
            );
            continue;
        }

        const paragraphLines: string[] = [];
        while (index < lines.length) {
            const current = lines[index];
            const currentTrimmed = current.trim();
            if (!currentTrimmed) break;
            if (currentTrimmed.startsWith('```')) break;
            if (/^(#{1,3})\s+/.test(current)) break;
            if (/^\s*[-*]\s+/.test(current)) break;
            if (/^\s*\d+\.\s+/.test(current)) break;
            if (/^>\s?/.test(current)) break;
            paragraphLines.push(currentTrimmed);
            index += 1;
        }

        blocks.push(
            <p key={`block-${blockKey++}`} className="mb-2 whitespace-pre-wrap">
                {renderInlineMarkdown(paragraphLines.join(' '))}
            </p>
        );
    }

    return <>{blocks}</>;
}

type CommentNodeProps = NodeProps<AppNode>;

function CommentNodeComponent({ id, data, selected }: CommentNodeProps) {
    const updateCommentNodeDraft = useEditorStore((s) => s.updateCommentNodeDraft);
    const commitCommentNodeDraft = useEditorStore((s) => s.commitCommentNodeDraft);

    const savedTitle = typeof data.values?.title === 'string' ? data.values.title : DEFAULT_TITLE;
    const savedMarkdown = typeof data.values?.markdown === 'string' ? data.values.markdown : DEFAULT_MARKDOWN;

    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(savedTitle);
    const [markdown, setMarkdown] = useState(savedMarkdown);
    const containerRef = useRef<HTMLDivElement>(null);
    const moveCursorToEndOnNextFocusRef = useRef(false);

    const debouncedTitleUpdate = useDebouncedCallback((nextTitle: string) => {
        updateCommentNodeDraft(id, { title: nextTitle });
    }, 140);

    const debouncedMarkdownUpdate = useDebouncedCallback((nextMarkdown: string) => {
        updateCommentNodeDraft(id, { markdown: nextMarkdown });
    }, 140);

    const handleTitleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value;
        setTitle(next);
        updateCommentNodeDraft(id, { title: next });
        debouncedTitleUpdate(next);
    }, [debouncedTitleUpdate, id, updateCommentNodeDraft]);

    const handleMarkdownChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const next = event.target.value;
        setMarkdown(next);
        updateCommentNodeDraft(id, { markdown: next });
        debouncedMarkdownUpdate(next);
    }, [debouncedMarkdownUpdate, id, updateCommentNodeDraft]);

    const commitAndClose = useCallback(() => {
        const normalizedTitle = title.trim() || DEFAULT_TITLE;
        updateCommentNodeDraft(id, {
            title: normalizedTitle,
            markdown,
        });
        commitCommentNodeDraft(id);
        setIsEditing(false);
    }, [commitCommentNodeDraft, id, markdown, title, updateCommentNodeDraft]);

    const beginEditing = useCallback(() => {
        setTitle(savedTitle);
        setMarkdown(savedMarkdown);
        moveCursorToEndOnNextFocusRef.current = true;
        setIsEditing(true);
    }, [savedMarkdown, savedTitle]);

    const openEditor = useCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        beginEditing();
    }, [beginEditing]);

    const handleBlurCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
        if (!isEditing) return;
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && containerRef.current?.contains(nextTarget)) {
            return;
        }
        commitAndClose();
    }, [commitAndClose, isEditing]);

    const renderedMarkdown = useMemo(() => renderBasicMarkdown(savedMarkdown), [savedMarkdown]);

    return (
        <>
            <NodeResizer
                isVisible={selected}
                minWidth={240}
                minHeight={160}
                lineClassName="border-primary/60"
                handleClassName="bg-background border border-primary/60"
            />

            <div
                ref={containerRef}
                className={cn(
                    'relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border transition-all duration-200 overflow-y-auto',
                    'shadow-[0_10px_26px_-16px_rgba(0,0,0,0.8)]',
                    isEditing
                        ? 'z-10 scale-[1.01] border-primary/60 bg-card text-foreground'
                        : 'border-sidebar-border/90 bg-sidebar-accent/95 text-sidebar-foreground',
                    selected && !isEditing && 'ring-2 ring-primary/50',
                    selected && isEditing && 'ring-2 ring-primary/40'
                )}
                onDoubleClick={(event) => {
                    event.stopPropagation();
                    beginEditing();
                }}
                onBlurCapture={handleBlurCapture}
            >
                <div
                    className={cn(
                        'flex items-center justify-between px-4 pt-4 pb-2',
                        isEditing ? 'border-b border-border/80' : 'border-b border-sidebar-border/70'
                    )}
                >
                    <div className="min-w-0 flex-1 pr-2">
                        {isEditing ? (
                            <input
                                type="text"
                                value={title}
                                onChange={handleTitleChange}
                                className="nodrag nopan w-full border-0 bg-transparent p-0 text-[17px] font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
                                placeholder={DEFAULT_TITLE}
                                onClick={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                            />
                        ) : (
                            <button
                                type="button"
                                className="nodrag nopan w-full truncate text-left text-[17px] font-semibold tracking-tight text-sidebar-foreground"
                                onClick={openEditor}
                                onMouseDown={(event) => event.stopPropagation()}
                                title={savedTitle}
                            >
                                {savedTitle}
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        className={cn(
                            'nodrag nopan inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
                            isEditing
                                ? 'border-border text-foreground/70 hover:border-primary/40 hover:text-foreground'
                                : 'border-transparent text-sidebar-foreground/60 hover:border-sidebar-border hover:bg-sidebar hover:text-sidebar-foreground'
                        )}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (isEditing) {
                                commitAndClose();
                            } else {
                                beginEditing();
                            }
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        title={isEditing ? 'Done' : 'Edit'}
                    >
                        {isEditing ? <Check className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
                    </button>
                </div>

                <div className="flex flex-1 flex-col px-4 pt-2 pb-4">
                    {isEditing ? (
                        <>
                            <textarea
                                autoFocus
                                value={markdown}
                                onChange={handleMarkdownChange}
                                onFocus={(event) => {
                                    if (!moveCursorToEndOnNextFocusRef.current) return;
                                    moveCursorToEndOnNextFocusRef.current = false;
                                    const target = event.currentTarget;
                                    requestAnimationFrame(() => {
                                        const pos = target.value.length;
                                        target.setSelectionRange(pos, pos);
                                    });
                                }}
                                className="nodrag nopan nowheel mt-1 h-full min-h-[84px] w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                                placeholder="Write markdown notes..."
                                onClick={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                                onWheel={(event) => event.stopPropagation()}
                            />
                        </>
                    ) : (
                        <>
                            <div
                                className="nowheel mt-1 flex-1 overflow-auto text-[13px] leading-relaxed text-sidebar-foreground/90"
                                onWheel={(event) => event.stopPropagation()}
                            >
                                {savedMarkdown.trim().length > 0 ? (
                                    renderedMarkdown
                                ) : (
                                    <button
                                        type="button"
                                        className="nodrag nopan text-left text-xs text-sidebar-foreground/55 hover:text-sidebar-foreground/75"
                                        onClick={openEditor}
                                        onMouseDown={(event) => event.stopPropagation()}
                                    >
                                        Add markdown notes...
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function areCommentNodePropsEqual(prev: CommentNodeProps, next: CommentNodeProps) {
    return (
        prev.id === next.id &&
        prev.type === next.type &&
        prev.selected === next.selected &&
        prev.data === next.data
    );
}

export const CommentNode = memo(CommentNodeComponent, areCommentNodePropsEqual);
