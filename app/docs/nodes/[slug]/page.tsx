import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import NodeDetail from '@/components/docs/NodeDetail';
import { getNodeDocs, getNodeDocBySlug } from '@/lib/docs/nodes';

type PageProps = {
    params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
    const { nodesByType } = getNodeDocs();
    return Object.keys(nodesByType).map((type) => ({
        slug: type.replace(/\//g, '--'),
    }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const node = getNodeDocBySlug(slug);
    if (!node) return { title: 'Node Not Found' };
    return {
        title: `${node.label} Node`,
        description: `${node.label} (${node.type}) in ${node.category} category.`,
    };
}

export default async function NodePage({ params }: PageProps) {
    const { slug } = await params;
    const node = getNodeDocBySlug(slug);
    if (!node) notFound();
    return <NodeDetail node={node} />;
}
