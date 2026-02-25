'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { slugFromType, type CategoryDoc } from '@/lib/docs/nodes';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQueryState } from 'nuqs';

type NodesIndexProps = {
    categories: CategoryDoc[];
};

export default function NodesIndex({ categories }: NodesIndexProps) {
    const [query, setQuery] = useQueryState('q');
    const normalized = (query ?? '').trim().toLowerCase();

    const filtered = useMemo(() => {
        if (!normalized) return categories;
        return categories
            .map((category) => {
                const nodes = category.nodes.filter((node) =>
                    node.label.toLowerCase().includes(normalized) ||
                    node.type.toLowerCase().includes(normalized)
                );
                return { ...category, nodes };
            })
            .filter((category) => category.nodes.length > 0);
    }, [categories, normalized]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-3">
                <h1 className="text-3xl font-semibold">Nodes</h1>
                <p className="text-muted-foreground">
                    Browse all built-in node types. Search by name or type.
                </p>
                <div className="max-w-md">
                    <Input
                        value={query ?? ''}
                        onChange={(event) => {
                            const value = event.target.value;
                            setQuery(value.length ? value : null);
                        }}
                        placeholder="Search nodes..."
                    />
                </div>
            </div>

            <div className="space-y-10">
                {filtered.map((category) => (
                    <section key={category.name} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-semibold">{category.name}</h2>
                            <Badge variant="outline" className="text-xs">
                                {category.nodes.length}
                            </Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {category.nodes.map((node) => (
                                <Link
                                    key={node.type}
                                    href={`/docs/nodes/${slugFromType(node.type)}`}
                                    className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/60"
                                >
                                    <div className="font-medium text-foreground">{node.label}</div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {node.type}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
