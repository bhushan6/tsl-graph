import type { EditorPersistenceAdapter } from '../types';
import {
    createRequestId,
    DEFAULT_POSTMESSAGE_TARGET_ORIGIN,
    EDITOR_POSTMESSAGE_SOURCE,
    HOST_POSTMESSAGE_SOURCE,
    isHostMessage,
    postMessageToHost,
    type PostMessageEnvelope,
} from '../postmessage';

export interface PostMessageEditorRef {
    docId: string;
}

export interface PostMessageAdapterOptions {
    targetOrigin?: string;
    requestTimeoutMs?: number;
    hostSource?: string;
}

interface LoadPayload {
    graphData: unknown;
    projectName?: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

function requestHostResponse<TPayload = unknown>({
    requestType,
    responseType,
    payload,
    targetOrigin,
    timeoutMs,
    hostSource,
}: {
    requestType: string;
    responseType: string;
    payload: unknown;
    targetOrigin: string;
    timeoutMs: number;
    hostSource: string;
}): Promise<TPayload | null> {
    if (typeof window === 'undefined') {
        return Promise.resolve(null);
    }

    const requestId = createRequestId();

    return new Promise<TPayload | null>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            window.removeEventListener('message', handleMessage);
        };

        const handleMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!isHostMessage(data, hostSource)) return;
            if (data.type !== responseType) return;
            if (data.requestId !== requestId) return;

            cleanup();

            if (typeof data.error === 'string' && data.error.length > 0) {
                reject(new Error(data.error));
                return;
            }

            resolve((data.payload as TPayload) ?? null);
        };

        window.addEventListener('message', handleMessage);
        timeoutId = setTimeout(() => {
            cleanup();
            resolve(null);
        }, timeoutMs);

        const sent = postMessageToHost(
            {
                source: EDITOR_POSTMESSAGE_SOURCE,
                type: requestType,
                requestId,
                payload,
            },
            targetOrigin
        );

        if (!sent) {
            cleanup();
            resolve(null);
        }
    });
}

export function createPostMessageEditorAdapter(
    options: PostMessageAdapterOptions = {}
): EditorPersistenceAdapter<PostMessageEditorRef> {
    const targetOrigin = options.targetOrigin ?? DEFAULT_POSTMESSAGE_TARGET_ORIGIN;
    const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const hostSource = options.hostSource ?? HOST_POSTMESSAGE_SOURCE;

    return {
        async load(ref) {
            try {
                const result = await requestHostResponse<LoadPayload>({
                    requestType: 'tsl:request:load',
                    responseType: 'tsl:response:load',
                    payload: { ref },
                    targetOrigin,
                    timeoutMs: requestTimeoutMs,
                    hostSource,
                });

                if (!result || result.graphData === undefined || result.graphData === null) {
                    return null;
                }

                return {
                    graphData: result.graphData,
                    projectName: result.projectName,
                };
            } catch (error) {
                console.error('postMessage load failed:', error);
                return null;
            }
        },

        async save(input) {
            try {
                await requestHostResponse({
                    requestType: 'tsl:request:save',
                    responseType: 'tsl:response:save',
                    payload: input,
                    targetOrigin,
                    timeoutMs: requestTimeoutMs,
                    hostSource,
                });
            } catch (error) {
                console.error('postMessage save failed:', error);
            }
        },
    };
}

export function postEditorResponse(
    message: Omit<PostMessageEnvelope, 'source'>,
    targetOrigin = DEFAULT_POSTMESSAGE_TARGET_ORIGIN
): boolean {
    return postMessageToHost(
        {
            source: EDITOR_POSTMESSAGE_SOURCE,
            ...message,
        },
        targetOrigin
    );
}
