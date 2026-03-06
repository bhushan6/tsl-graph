import type { ConvexReactClient } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type {
    EditorAssetsAdapter,
    EditorHostServices,
    EditorPersistenceAdapter,
    EditorTemplateRecord,
    EditorTemplateVersionInfo,
} from '../types';

export interface ConvexProjectRef {
    projectId: Id<'projects'>;
}

export function createConvexProjectAdapter(
    convex: ConvexReactClient
): EditorPersistenceAdapter<ConvexProjectRef> {
    return {
        async load(ref) {
            const project = await convex.query(api.projects.get, { id: ref.projectId });
            if (!project) return null;

            return {
                graphData: project.graphData,
                projectName: project.name,
            };
        },

        async save({ ref, graphData }) {
            await convex.mutation(api.projects.update, {
                id: ref.projectId,
                graphData,
            });
        },
    };
}

function toTemplateRecord(template: {
    _id: string;
    name: string;
    data: unknown;
    version: number;
    isPublic?: boolean;
    description?: string;
    createdAt?: number;
    updatedAt?: number;
}): EditorTemplateRecord {
    return {
        _id: String(template._id),
        name: template.name,
        data: template.data,
        version: template.version,
        isPublic: template.isPublic,
        description: template.description,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
    };
}

export function createConvexProjectServices(
    convex: ConvexReactClient
): EditorHostServices<ConvexProjectRef> {
    return {
        project: {
            async getProject({ ref }) {
                const project = await convex.query(api.projects.get, { id: ref.projectId });
                if (!project) return null;

                return {
                    name: project.name,
                    isPublic: project.isPublic,
                    thumbnail: project.thumbnail ?? null,
                };
            },

            async renameProject({ ref, name }) {
                await convex.mutation(api.projects.update, {
                    id: ref.projectId,
                    name,
                });
            },

            async setProjectPublic({ ref, isPublic }) {
                await convex.mutation(api.projects.update, {
                    id: ref.projectId,
                    isPublic,
                });
            },

            async uploadThumbnail({ ref, blob, mimeType }) {
                const uploadUrl = await convex.mutation(api.projects.generateThumbnailUploadUrl, {});
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': mimeType || 'image/jpeg' },
                    body: blob,
                });

                if (!response.ok) {
                    throw new Error('Failed to upload thumbnail');
                }

                const { storageId } = await response.json() as { storageId: Id<'_storage'> };
                await convex.mutation(api.projects.updateThumbnail, {
                    id: ref.projectId,
                    storageId,
                });

                return {
                    storageId: String(storageId),
                };
            },
        },

        templates: {
            async listSubgraphTemplates() {
                const templates = await convex.query(api.templates.listSubgraphTemplates, {});
                return templates.map(toTemplateRecord);
            },

            async listCodeNodeTemplates() {
                const templates = await convex.query(api.templates.listCodeNodeTemplates, {});
                return templates.map(toTemplateRecord);
            },

            async listPublicSubgraphTemplates() {
                const templates = await convex.query(api.templates.listPublicSubgraphTemplates, {});
                return templates.map(toTemplateRecord);
            },

            async listPublicCodeNodeTemplates() {
                const templates = await convex.query(api.templates.listPublicCodeNodeTemplates, {});
                return templates.map(toTemplateRecord);
            },

            async getSubgraphTemplate(id) {
                const template = await convex.query(api.templates.getSubgraphTemplate, {
                    id: id as Id<'subgraphTemplates'>,
                });

                return template ? toTemplateRecord(template) : null;
            },

            async getCodeNodeTemplate(id) {
                const template = await convex.query(api.templates.getCodeNodeTemplate, {
                    id: id as Id<'codeNodeTemplates'>,
                });

                return template ? toTemplateRecord(template) : null;
            },

            async getSubgraphTemplateVersions(ids) {
                const result = await convex.query(api.templates.getSubgraphTemplateVersions, { ids });
                return result as Record<string, EditorTemplateVersionInfo | null>;
            },

            async getCodeNodeTemplateVersions(ids) {
                const result = await convex.query(api.templates.getCodeNodeTemplateVersions, { ids });
                return result as Record<string, EditorTemplateVersionInfo | null>;
            },

            async createSubgraphTemplate(input) {
                const result = await convex.mutation(api.templates.createSubgraphTemplate, {
                    name: input.name,
                    description: input.description,
                    isPublic: input.isPublic,
                    data: input.data,
                });
                return {
                    templateId: String(result.templateId),
                    version: result.version,
                };
            },

            async updateSubgraphTemplate(input) {
                const result = await convex.mutation(api.templates.updateSubgraphTemplate, {
                    id: input.id as Id<'subgraphTemplates'>,
                    name: input.name,
                    description: input.description,
                    isPublic: input.isPublic,
                    data: input.data,
                });

                return { version: result.version };
            },

            async createCodeNodeTemplate(input) {
                const result = await convex.mutation(api.templates.createCodeNodeTemplate, {
                    name: input.name,
                    description: input.description,
                    isPublic: input.isPublic,
                    data: input.data,
                });
                return {
                    templateId: String(result.templateId),
                    version: result.version,
                };
            },

            async updateCodeNodeTemplate(input) {
                const result = await convex.mutation(api.templates.updateCodeNodeTemplate, {
                    id: input.id as Id<'codeNodeTemplates'>,
                    name: input.name,
                    description: input.description,
                    isPublic: input.isPublic,
                    data: input.data,
                });

                return { version: result.version };
            },

            async deleteSubgraphTemplate(id) {
                await convex.mutation(api.templates.deleteSubgraphTemplate, {
                    id: id as Id<'subgraphTemplates'>,
                });
            },

            async deleteCodeNodeTemplate(id) {
                await convex.mutation(api.templates.deleteCodeNodeTemplate, {
                    id: id as Id<'codeNodeTemplates'>,
                });
            },
        },

        assets: createConvexAssetsAdapter(convex),
    };
}

export function createConvexAssetsAdapter(
    convex: ConvexReactClient
): EditorAssetsAdapter<ConvexProjectRef> {
    return {
        async uploadAndLinkAsset(input) {
            if (!input.ref?.projectId) {
                throw new Error('Project reference is required for asset uploads.');
            }

            if (input.replaceExisting) {
                try {
                    await convex.mutation(api.assets.unlinkAssetFromNode, {
                        nodeId: input.nodeId,
                        graphId: input.ref.projectId,
                        propertyName: input.propertyName,
                    });
                } catch {
                    // Ignore unlink errors when replacing.
                }
            }

            const uploadUrl = await convex.mutation(api.assets.generateUploadUrl, {});
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': input.file.type || 'application/octet-stream' },
                body: input.file,
            });

            if (!response.ok) {
                throw new Error('Failed to upload file');
            }

            const { storageId } = await response.json() as { storageId: string };
            const result = await convex.mutation(api.assets.registerAsset, {
                storageId: storageId as Id<'_storage'>,
                filename: input.file.name,
                mimeType: input.file.type || 'application/octet-stream',
                size: input.file.size,
            });

            if (!result.url) {
                throw new Error('Failed to resolve uploaded asset URL');
            }

            await convex.mutation(api.assets.linkAssetToNode, {
                assetId: result.assetId,
                nodeId: input.nodeId,
                graphId: input.ref.projectId,
                propertyName: input.propertyName,
            });

            return {
                assetId: String(result.assetId),
                url: result.url,
            };
        },

        async unlinkAsset(input) {
            if (!input.ref?.projectId) {
                throw new Error('Project reference is required for asset unlink.');
            }
            await convex.mutation(api.assets.unlinkAssetFromNode, {
                nodeId: input.nodeId,
                graphId: input.ref.projectId,
                propertyName: input.propertyName,
            });
        },
    };
}
