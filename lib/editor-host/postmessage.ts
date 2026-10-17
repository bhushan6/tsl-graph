import type { EditorGraphKind } from './types';
import type { TSLValueType } from '../types';
import type { UniformKind } from '../uniform-utils';

export const EDITOR_POSTMESSAGE_SOURCE = 'tsl-graph-editor';
export const HOST_POSTMESSAGE_SOURCE = 'tsl-graph-host';
export const DEFAULT_POSTMESSAGE_TARGET_ORIGIN = '*';

export type EditorPostMessageType =
    | 'tsl:event:ready'
    | 'tsl:event:graph-changed'
    | 'tsl:event:uniforms-changed'
    | 'tsl:response:load'
    | 'tsl:response:clear-graph'
    | 'tsl:response:set-root-material'
    | 'tsl:response:get-graph'
    | 'tsl:response:get-code'
    | 'tsl:response:get-uniform-schema'
    | 'tsl:response:set-uniform-values';

export type HostPostMessageType =
    | 'tsl:command:load'
    | 'tsl:command:clear-graph'
    | 'tsl:command:set-root-material'
    | 'tsl:command:get-graph'
    | 'tsl:command:get-code'
    | 'tsl:command:get-uniform-schema'
    | 'tsl:command:set-uniform-values';

export interface PostMessageEnvelope<TPayload = unknown> {
    source: string;
    type: string;
    requestId?: string;
    payload?: TPayload;
    error?: string;
}

export interface EditorReadyPayload {
    version: 1;
    enabledGraphs: EditorGraphKind[];
}

export interface EditorGraphChangedPayload {
    revision: number;
}

export type RootMaterialType =
    | 'material/node'
    | 'material/standard'
    | 'material/basic'
    | 'material/physical'
    | 'material/phong'
    | 'material/sprite';

export interface SetRootMaterialPayload {
    materialType: RootMaterialType;
}

export interface LoadCommandPayload {
    graphData: unknown;
}

export interface LoadCommandResponsePayload {
    ok: true;
}

export interface ClearGraphResponsePayload {
    ok: true;
}

export interface UniformSchemaEntry {
    scope: 'node' | 'global';
    id: string;
    name: string;
    uniformType: UniformKind;
    value: TSLValueType;
    /** Optional UI hints for host tweak panels; absent when unset. */
    min?: number;
    max?: number;
    step?: number;
}

export interface GetUniformSchemaResponsePayload {
    uniforms: UniformSchemaEntry[];
}

export interface SetUniformValuesPayload {
    updates: Array<{
        scope: 'node' | 'global';
        id: string;
        value: TSLValueType;
    }>;
}

export interface SetUniformValuesResponsePayload {
    ok: boolean;
    uniforms: UniformSchemaEntry[];
    rejected?: Array<{
        scope: 'node' | 'global';
        id: string;
        reason: string;
    }>;
}

export interface UniformsChangedPayload {
    uniforms: UniformSchemaEntry[];
}

export interface CodeImportGroup {
    from: string;
    imports: string[];
}

export interface GetCodeResponsePayload {
    enabledGraphs: EditorGraphKind[];
    material: {
        code: string | null;
        error: string | null;
        imports: CodeImportGroup[];
    };
    postprocessing: {
        code: string | null;
        functionName: string | null;
        error: string | null;
        imports: CodeImportGroup[];
    };
}

export const createRequestId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const getHostWindow = (): Window | null => {
    if (typeof window === 'undefined') return null;
    if (window.parent && window.parent !== window) {
        return window.parent;
    }
    return null;
};

/**
 * Resolves the embed's `targetOrigin` parameter to `'*'` (any embedder, the
 * default) or one exact http(s) origin. Anything else returns null, which
 * disables the host channel instead of silently widening it.
 */
export const resolveHostTargetOrigin = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined || value === '' || value === DEFAULT_POSTMESSAGE_TARGET_ORIGIN) {
        return DEFAULT_POSTMESSAGE_TARGET_ORIGIN;
    }
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
        return url.origin;
    } catch {
        return null;
    }
};

/**
 * Host messages must come from the window embedding the editor (never a child
 * frame such as the sandboxed preview, a popup, or the page itself), and from
 * the pinned origin when one was configured.
 */
export const isFromHostWindow = (
    event: Pick<MessageEvent, 'source' | 'origin'>,
    targetOrigin: string | null
): boolean => {
    const hostWindow = getHostWindow();
    if (!hostWindow || targetOrigin === null || event.source !== hostWindow) return false;
    return targetOrigin === DEFAULT_POSTMESSAGE_TARGET_ORIGIN || event.origin === targetOrigin;
};

export const postMessageToHost = (
    message: PostMessageEnvelope,
    targetOrigin: string | null = DEFAULT_POSTMESSAGE_TARGET_ORIGIN
): boolean => {
    const hostWindow = getHostWindow();
    if (!hostWindow || targetOrigin === null) return false;

    hostWindow.postMessage(message, targetOrigin);
    return true;
};

export const isHostMessage = (
    data: unknown,
    expectedSource = HOST_POSTMESSAGE_SOURCE
): data is PostMessageEnvelope => {
    if (!data || typeof data !== 'object') return false;
    const envelope = data as Partial<PostMessageEnvelope>;
    return envelope.source === expectedSource && typeof envelope.type === 'string';
};
