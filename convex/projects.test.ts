import { describe, expect, it, vi } from 'vitest';
import { getPublicStandalone, selectPublicStandaloneProject } from './projects';

type Project = {
    graphData: unknown;
    name: string;
    isPublic: boolean;
};

const invokePublicStandalone = async (id: string, project: Project | null) => {
    const normalizeId = vi.fn((_table: string, candidate: string) => (
        candidate === 'valid-project' ? 'projects:valid-project' : null
    ));
    const get = vi.fn().mockResolvedValue(project);
    const handler = (getPublicStandalone as unknown as {
        _handler: (ctx: unknown, args: { id: string }) => Promise<unknown>;
    })._handler;
    const result = await handler({ db: { normalizeId, get } }, { id });
    return { result, normalizeId, get };
};

describe('public standalone project projection', () => {
    it('returns only graph data and name for public projects', () => {
        expect(selectPublicStandaloneProject({
            graphData: { nodes: [] },
            name: 'Public graph',
            isPublic: true,
        })).toEqual({ graphData: { nodes: [] }, name: 'Public graph' });
    });

    it('hides private and missing projects', () => {
        expect(selectPublicStandaloneProject({
            graphData: { nodes: [{ id: 'secret' }] },
            name: 'Private graph',
            isPublic: false,
        })).toBeNull();
        expect(selectPublicStandaloneProject(null)).toBeNull();
    });

    it('returns null for malformed ids without reading the database', async () => {
        const { result, normalizeId, get } = await invokePublicStandalone('not-an-id', null);
        expect(result).toBeNull();
        expect(normalizeId).toHaveBeenCalledWith('projects', 'not-an-id');
        expect(get).not.toHaveBeenCalled();
    });

    it('serves public data without requiring auth and hides private or missing rows', async () => {
        const publicResult = await invokePublicStandalone('valid-project', {
            graphData: { nodes: [{ id: 'public' }] },
            name: 'Public graph',
            isPublic: true,
        });
        expect(publicResult.result).toEqual({
            graphData: { nodes: [{ id: 'public' }] },
            name: 'Public graph',
        });
        expect(publicResult.get).toHaveBeenCalledWith('projects:valid-project');

        await expect(invokePublicStandalone('valid-project', null)
            .then(({ result }) => result)).resolves.toBeNull();
        await expect(invokePublicStandalone('valid-project', {
            graphData: { nodes: [{ id: 'private' }] },
            name: 'Private graph',
            isPublic: false,
        }).then(({ result }) => result)).resolves.toBeNull();
    });
});
