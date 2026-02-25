import { Suspense } from 'react';
import NodesIndex from '@/components/docs/NodesIndex';
import { getNodeDocs } from '@/lib/docs/nodes';

export default function NodesPage() {
    const { categories } = getNodeDocs();
    return (
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading docs…</div>}>
            <NodesIndex categories={categories} />
        </Suspense>
    );
}
