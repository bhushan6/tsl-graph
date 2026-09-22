import { describe, expect, it, vi } from 'vitest';
import { getPublicStandalone, selectProjectSummary, selectPublicStandaloneProject } from './projects';
import type { Id } from './_generated/dataModel';

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

describe('project summary projection', () => {
    const makeProject = () => ({
        _id: 'projects:1' as Id<'projects'>,
        name: 'Heavy graph',
        description: 'A project',
        isPublic: true,
        graphData: { nodes: [{ id: 'n1' }] },
        thumbnail: 'https://example.com/thumb.png',
        thumbnailStorageId: 'storage:1',
        likeCount: 3,
        createdAt: 1,
        updatedAt: 2,
    });

    it('returns only card metadata and never ships graphData', () => {
        const summary = selectProjectSummary(makeProject());
        expect(summary).toEqual({
            _id: 'projects:1',
            name: 'Heavy graph',
            thumbnail: 'https://example.com/thumb.png',
            updatedAt: 2,
            isPublic: true,
            likeCount: 3,
        });
        expect(summary).not.toHaveProperty('graphData');
    });

    it('defaults a missing likeCount to zero', () => {
        const project = { ...makeProject(), likeCount: undefined };
        expect(selectProjectSummary(project).likeCount).toBe(0);
    });
});

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
