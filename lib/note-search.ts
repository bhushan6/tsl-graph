import type { AppNode } from './types';

export function getNodeSearchFields(node: AppNode, displayName: string): string[] {
    const fields: string[] = [];

    if (displayName) fields.push(displayName);

    const localName = typeof node.data.values?.localName === 'string' ? node.data.values.localName : '';
    if (localName) fields.push(localName);

    if (node.data.type === 'utils/comment') {
        const title = typeof node.data.values?.title === 'string' ? node.data.values.title : '';
        const markdown = typeof node.data.values?.markdown === 'string' ? node.data.values.markdown : '';
        if (title) fields.push(title);
        if (markdown) fields.push(markdown);
    }

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

    return fields;
}

export function nodeMatchesNoteQuery(node: AppNode, displayName: string, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return false;

    const fields = getNodeSearchFields(node, displayName);
    return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
}
