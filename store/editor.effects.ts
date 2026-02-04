import posthog from 'posthog-js';
import { toast } from 'sonner';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { EditorAction, EditorState } from '@/packages/editor-store';

let effectsRegistered = false;

export function registerEditorEffects(store: UseBoundStore<StoreApi<EditorState>>): void {
    if (effectsRegistered) return;
    if (typeof window === 'undefined') return;

    effectsRegistered = true;
    let lastProjectId: string | null = null;
    let lastAction: EditorAction | null = null;
    const enableActionLogger = process.env.NODE_ENV === 'development';

    store.subscribe((state) => {
        const action = state.lastAction;
        if (!action || action === lastAction) return;
        lastAction = action;

        if (enableActionLogger) {
            console.debug('[editor action]', action);
        }

        switch (action.type) {
            case 'project/setId': {
                if (action.projectId && action.projectId !== lastProjectId) {
                    posthog.capture('project_opened', { project_id: action.projectId });
                }
                lastProjectId = action.projectId ?? null;
                break;
            }
            case 'autosave/success': {
                if (action.projectId) {
                    posthog.capture('project_saved', { project_id: action.projectId });
                }
                break;
            }
            case 'nodes/add': {
                const nodeType = action.node.data?.type ?? action.node.type;
                const projectId = store.getState().projectId;
                posthog.capture('node_added', {
                    node_type: nodeType,
                    project_id: projectId,
                });
                break;
            }
            case 'autosave/error': {
                toast.error(action.message);
                posthog.capture('error_occurred', { context: 'auto_save', error: action.message });
                break;
            }
            case 'event/error': {
                toast.error(action.message);
                posthog.capture('error_occurred', { context: action.context, error: action.message });
                break;
            }
            default:
                break;
        }
    });
}
