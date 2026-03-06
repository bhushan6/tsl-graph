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
    | 'tsl:request:load'
    | 'tsl:request:save'
    | 'tsl:response:set-root-material'
    | 'tsl:response:get-graph'
    | 'tsl:response:get-code'
    | 'tsl:response:get-uniform-schema'
    | 'tsl:response:set-uniform-values';

export type HostPostMessageType =
    | 'tsl:response:load'
    | 'tsl:response:save'
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

export interface UniformSchemaEntry {
    scope: 'node' | 'global';
    id: string;
    name: string;
    uniformType: UniformKind;
    value: TSLValueType;
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

export const createRequestId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const getHostWindow = (): Window | null => {
    if (typeof window === 'undefined') return null;
    if (window.parent && window.parent !== window) {
        return window.parent;
    }
    return null;
};

export const postMessageToHost = (
    message: PostMessageEnvelope,
    targetOrigin = DEFAULT_POSTMESSAGE_TARGET_ORIGIN
): boolean => {
    const hostWindow = getHostWindow();
    if (!hostWindow) return false;

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
