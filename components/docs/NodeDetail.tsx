import { Badge } from '@/components/ui/badge';
import NodePreview from '@/components/docs/NodePreview';
import type { NodeDoc, PortDoc } from '@/lib/docs/nodes';

type NodeDetailProps = {
    node: NodeDoc;
};

function renderDefault(value: PortDoc['default']) {
    if (value === undefined) return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.join(', ')}]`;
    if (typeof value === 'object' && value && 'url' in value) return value.url;
    return String(value);
}

function PortTable({ title, ports }: { title: string; ports: PortDoc[] }) {
    if (ports.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                No {title.toLowerCase()}.
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                        <th className="px-4 py-2 text-left font-medium">Key</th>
                        <th className="px-4 py-2 text-left font-medium">Label</th>
                        <th className="px-4 py-2 text-left font-medium">Type</th>
                        <th className="px-4 py-2 text-left font-medium">Default</th>
                        <th className="px-4 py-2 text-left font-medium">Flags</th>
                    </tr>
                </thead>
                <tbody>
                    {ports.map((port) => {
                        const flags = [
                            port.connectionOnly ? 'connectionOnly' : null,
                            port.propertyOnly ? 'propertyOnly' : null,
                            port.hidden ? 'hidden' : null,
                            port.isMaterialProp ? 'materialProp' : null,
                        ].filter(Boolean);

                        return (
                            <tr key={port.key} className="border-t border-border">
                                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                    {port.key}
                                </td>
                                <td className="px-4 py-2">{port.label}</td>
                                <td className="px-4 py-2">
                                    <Badge variant="secondary" className="text-xs">
                                        {port.type}
                                    </Badge>
                                </td>
                                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                    {renderDefault(port.default)}
                                </td>
                                <td className="px-4 py-2">
                                    {flags.length === 0 ? (
                                        <span className="text-xs text-muted-foreground">-</span>
                                    ) : (
                                        <div className="flex flex-wrap gap-1">
                                            {flags.map((flag) => (
                                                <Badge key={flag} variant="outline" className="text-[10px]">
                                                    {flag}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default function NodeDetail({ node }: NodeDetailProps) {
    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-semibold">{node.label}</h1>
                    <Badge variant="outline">{node.category}</Badge>
                </div>
                <div className="text-sm text-muted-foreground font-mono">{node.type}</div>
                <p className="text-muted-foreground">{node.description}</p>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">TSL: {node.tsl}</Badge>
                    {node.importFrom && (
                        <Badge variant="secondary">Import: {node.importFrom}</Badge>
                    )}
                    {node.pure && <Badge variant="outline">pure</Badge>}
                    {node.callable && <Badge variant="outline">callable</Badge>}
                </div>
            </div>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold">Node UI</h2>
                <NodePreview node={node} />
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold">Inputs</h2>
                <PortTable title="Inputs" ports={node.inputs} />
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-semibold">Outputs</h2>
                <PortTable title="Outputs" ports={node.outputs} />
            </section>
        </div>
    );
}
