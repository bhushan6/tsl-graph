'use client';

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarHeader,
} from '@/components/ui/sidebar';
import { registry } from '@/lib/registry';
import { useEditorStore } from '@/store/editor';

export function NodePicker() {
    const addNode = useEditorStore((s) => s.addNode);
    const { screenToFlowPosition, getViewport } = useReactFlow();
    const nodesByCategory = registry.byCategory();

    const handleAddNode = useCallback(
        (type: string) => {
            // Add node at center of current viewport
            const viewport = getViewport();
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            const position = screenToFlowPosition({
                x: centerX,
                y: centerY,
            });

            // Add some randomness to avoid stacking
            position.x += (Math.random() - 0.5) * 100;
            position.y += (Math.random() - 0.5) * 100;

            addNode(type, position);
        },
        [addNode, screenToFlowPosition, getViewport]
    );

    return (
        <Sidebar collapsible="none" className="border-r">
            <SidebarHeader className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Nodes</h2>
            </SidebarHeader>
            <SidebarContent>
                {Object.entries(nodesByCategory).map(([category, nodes]) => (
                    <SidebarGroup key={category}>
                        <SidebarGroupLabel>{category}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {nodes.map((node) => (
                                    <SidebarMenuItem key={node.type}>
                                        <SidebarMenuButton
                                            onClick={() => handleAddNode(node.type)}
                                            tooltip={node.label}
                                        >
                                            <span>{node.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
        </Sidebar>
    );
}
