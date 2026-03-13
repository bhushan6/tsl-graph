import type { CodeNodeScope } from '@/lib/types';

type CodeNodeScopeSource = {
    scope?: CodeNodeScope;
    templateId?: string;
};

export const resolveCodeNodeScope = (
    codeNode: CodeNodeScopeSource | null | undefined
): CodeNodeScope => {
    if (codeNode?.scope === 'library' || codeNode?.scope === 'project') {
        return codeNode.scope;
    }

    return codeNode?.templateId ? 'library' : 'project';
};
