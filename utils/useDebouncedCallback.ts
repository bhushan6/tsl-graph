'use client';

import { useEffect, useRef, useMemo } from 'react';

// Debounce hook for input values
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedCallback<T extends (...args: any[]) => void>(
    callback: T,
    delay: number
): T {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return useMemo(
        () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((...args: any[]) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    callbackRef.current(...args);
                }, delay);
            }) as T,
        [delay]
    );
}
