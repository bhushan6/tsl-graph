import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { getNodeSearchFields, nodeMatchesNoteQuery } from './note-search';
import type { NodeType, TSLNodeData } from './types';

const createNode = (
    id: string,
    type: string,
    values: Record<string, unknown> = {},
    nodeTypeOverride?: string
): Node<TSLNodeData> => ({
    id,
    type: (nodeTypeOverride ?? type) as NodeType,
    position: { x: 0, y: 0 },
    data: {
        type: type as NodeType,
        values: values as TSLNodeData['values'],
        connected: {},
    },
});

describe('note search helpers', () => {
    it('includes comment title and markdown in searchable fields', () => {
        const commentNode = createNode('comment-1', 'utils/comment', {
            title: 'Lighting Notes',
            markdown: 'Use **soft** shadows',
        });

        const fields = getNodeSearchFields(commentNode, 'Comment');
        expect(fields).toContain('Lighting Notes');
        expect(fields).toContain('Use **soft** shadows');
        expect(nodeMatchesNoteQuery(commentNode, 'Comment', 'soft')).toBe(true);
        expect(nodeMatchesNoteQuery(commentNode, 'Comment', 'lighting')).toBe(true);
    });

    it('keeps existing search behavior for locals and groups', () => {
        const localNode = createNode('local-1', 'local/set', { localName: 'myVar' });
        expect(nodeMatchesNoteQuery(localNode, 'Set Local', 'myvar')).toBe(true);

        const groupNode = createNode('group-1', 'group', { label: 'Main Group' }, 'group');
        expect(nodeMatchesNoteQuery(groupNode, 'Group', 'main')).toBe(true);
    });
});
