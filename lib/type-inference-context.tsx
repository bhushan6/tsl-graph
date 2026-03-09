'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { TypeInferenceResolver } from './local-utils';

const fallbackResolver: TypeInferenceResolver = {
    resolveOutputType: () => 'any',
    resolveInputType: () => 'any',
};

const TypeInferenceContext = createContext<TypeInferenceResolver>(fallbackResolver);

export function TypeInferenceProvider({
    resolver,
    children,
}: {
    resolver: TypeInferenceResolver;
    children: ReactNode;
}) {
    return (
        <TypeInferenceContext.Provider value={resolver}>
            {children}
        </TypeInferenceContext.Provider>
    );
}

export function useTypeInferenceResolver(): TypeInferenceResolver {
    return useContext(TypeInferenceContext);
}
