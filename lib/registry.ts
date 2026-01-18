import { NodeDef, NodeType } from './types';

class NodeRegistry {
    private defs = new Map<string, NodeDef>();

    register(def: NodeDef) {
        this.defs.set(def.type, def);
    }

    registerMany(defs: readonly NodeDef[]) {
        defs.forEach((d) => this.register(d));
    }

    get(type: unknown): NodeDef | undefined {
        if (typeof type !== 'string') return undefined;
        return this.defs.get(type as NodeType);
    }

    has(type: string): boolean {
        return this.defs.has(type as NodeType);
    }

    all(): NodeDef[] {
        return [...this.defs.values()];
    }

    byCategory(): Record<string, NodeDef[]> {
        const grouped: Record<string, NodeDef[]> = {};
        for (const def of this.defs.values()) {
            (grouped[def.category] ??= []).push(def);
        }
        return grouped;
    }

    types(): string[] {
        return [...this.defs.keys()];
    }
}

export const registry = new NodeRegistry();
