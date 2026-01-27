import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { type NodeProps } from '@xyflow/react';
import { useEditorStore } from '@/store/editor';
import { Edit2, Group } from 'lucide-react';
import type { AppNode } from '@/lib/types';
import "../app/globals.css"

function GroupNode({ id, data, selected }: NodeProps<AppNode>) {
    const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
    const inputRef = useRef<HTMLInputElement>(null);

    const [isEditing, setIsEditing] = useState(false);
    const label = (data.values.label as string) || 'Group';
    const [inputValue, setInputValue] = useState(label);



    const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    }, []);

    const handleEdit = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setInputValue(label);
        setIsEditing(true);
    }, [label]);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        updateNodeValue(id, 'label', inputValue);
    }, [id, inputValue, updateNodeValue]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Save immediately on Enter
            setIsEditing(false);
            updateNodeValue(id, 'label', inputValue);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // Revert changes
            setInputValue(label);
            setIsEditing(false);
        }
    }, [label, id, inputValue, updateNodeValue]);

    // Focus input when editing starts
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    return (
        <>


            {/* Group visual border - pointer-events-none so children can be interacted with */}
            <div
                className={`
                    w-full h-full
                    rounded-xl
                    bg-foreground/5
                    border-2 border-dashed
                    ${selected ? 'border-primary/60 bg-primary/5' : 'border-foreground/20'}
                    transition-colors duration-200
                    pointer-events-none
                    dark:bg-[#f0f0f040]
                    bg-[#f0f0f080]
                `}

            />

            {/* Header with label - separate element with pointer events enabled */}
            <div className="absolute top-0 left-0 translate-y-[-100%] right-0 px-3 py-2 flex items-center gap-2 pointer-events-auto">
                <div className={`p-1 rounded-md ${selected ? 'bg-primary/20' : 'bg-muted/50'}`}>
                    <Group className={`w-3.5 h-3.5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleLabelChange}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        className="
                            bg-background/80 backdrop-blur-sm
                            border border-border rounded px-1
                            text-sm font-medium
                            text-foreground placeholder:text-muted-foreground
                            outline-none
                            nodrag nopan
                        "
                        placeholder="Group name..."
                        // Stop propagation to prevent canvas interaction
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div className="flex items-center gap-2 group pointer-events-auto">
                        <span
                            onDoubleClick={handleEdit}
                            className="
                            text-sm font-medium
                            text-foreground/80
                            cursor-text select-none
                            truncate
                            nodrag nopan
                        "
                        >
                            {label}
                        </span>
                        <Edit2
                            className="w-3.5 h-3.5 cursor-pointer opacity-0 group-hover:opacity-100"
                            onClick={handleEdit}
                        />
                    </div>
                )}
            </div>
        </>
    );
}

export default memo(GroupNode);
