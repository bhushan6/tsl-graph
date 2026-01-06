import { NodeDef } from './types';

class NodeRegistry {
    private defs = new Map<string, NodeDef>();

    register(def: NodeDef) {
        this.defs.set(def.type, def);
    }

    registerMany(defs: NodeDef[]) {
        defs.forEach((d) => this.register(d));
    }

    get(type: string): NodeDef | undefined {
        return this.defs.get(type);
    }

    has(type: string): boolean {
        return this.defs.has(type);
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
