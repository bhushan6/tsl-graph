'use client';

import { useEffect, useRef, useMemo } from 'react';

// Debounce hook for input values
export function useDebouncedCallback<TArgs extends unknown[]>(
    callback: (...args: TArgs) => void,
    delay: number
): (...args: TArgs) => void {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    });

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return useMemo(
        () =>
            (...args: TArgs) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    callbackRef.current(...args);
                }, delay);
            },
        [delay]
    );
}
