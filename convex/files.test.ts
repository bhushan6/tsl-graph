import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type User = { _id: string; isAnonymous?: boolean };
let currentUser: User | null = null;
vi.mock("./auth", () => ({
    authComponent: {
        getAuthUser: vi.fn(async () => {
            if (!currentUser) throw new Error("Unauthenticated");
            return currentUser;
        }),
        safeGetAuthUser: vi.fn(async () => currentUser ?? undefined),
        getAnyUserById: vi.fn(),
    },
}));

import { createFakeConvex, handlerOf, type FakeConvex } from "./fake-ctx.testutil";
import {
    FILE_POLICIES,
    backfillStorageBindings,
    claimUpload,
    deleteOwnedFile,
    issueUploadUrl,
    runStorageMaintenance,
    transferFileOwnership,
} from "./files";
import { garbageCollectAssets, generateUploadUrl as generateAssetUploadUrl, getAssetUrl, getNodeAssets, registerAsset } from "./assets";
import { clone, generateThumbnailUploadUrl, remove, updateThumbnail } from "./projects";
import { deleteSelf } from "./users";
import type { Id } from "./_generated/dataModel";

const HOUR = 60 * 60 * 1000;
const alice: User = { _id: "user:alice" };
const mallory: User = { _id: "user:mallory" };
let fake: FakeConvex;
// Handlers are typed against Convex's ctx; the fake implements the subset they use.
const ctx = () => fake.ctx as never;
const as = (user: User | null) => {
    currentUser = user;
    fake.setIdentity(user ? { subject: user._id } : null);
};
const storageId = (id: string) => id as Id<"_storage">;

/** Alice requests an upload URL for `purpose` and uploads a file through it. */
async function uploadAs(user: User, purpose: keyof typeof FILE_POLICIES, file: { size?: number; contentType?: string } = {}) {
    await issueUploadUrl(ctx(), user._id, purpose);
    fake.advance(1000);
    return storageId(fake.upload(file));
}

const bindingFor = (id: string) => fake.rows("storageBindings").find((row) => row.storageId === id);

beforeEach(() => {
    fake = createFakeConvex();
    vi.spyOn(Date, "now").mockImplementation(() => fake.now());
    as(null);
});
afterEach(() => vi.restoreAllMocks());

describe("claimUpload", () => {
    it("binds a fresh upload made through the caller's grant, once", async () => {
        const id = await uploadAs(alice, "asset");
        await expect(claimUpload(ctx(), { storageId: id, userId: alice._id, purpose: "asset" }))
            .resolves.toEqual({ size: 1024, contentType: "image/png" });
        expect(bindingFor(id)).toMatchObject({ userId: alice._id, purpose: "asset" });
        expect(fake.rows("uploadGrants")[0].consumedAt).toBe(fake.now());

        await expect(claimUpload(ctx(), { storageId: id, userId: alice._id, purpose: "asset" }))
            .rejects.toThrow();
    });

    it("cannot adopt another user's claimed file", async () => {
        const victimFile = await uploadAs(alice, "asset");
        await claimUpload(ctx(), { storageId: victimFile, userId: alice._id, purpose: "asset" });
        await issueUploadUrl(ctx(), mallory._id, "asset");
        await expect(claimUpload(ctx(), { storageId: victimFile, userId: mallory._id, purpose: "asset" }))
            .rejects.toThrow("already registered");
        expect(bindingFor(victimFile)?.userId).toBe(alice._id);
    });

    it("cannot adopt a legacy file created before the caller's grant", async () => {
        const legacy = storageId(fake.upload());
        fake.advance(10 * 60 * 1000);
        await issueUploadUrl(ctx(), mallory._id, "asset");
        await expect(claimUpload(ctx(), { storageId: legacy, userId: mallory._id, purpose: "asset" }))
            .rejects.toThrow("not authorized");
    });

    it("requires a grant for the same purpose and rejects reuse of a consumed grant", async () => {
        const id = await uploadAs(alice, "thumbnail");
        await expect(claimUpload(ctx(), { storageId: id, userId: alice._id, purpose: "asset" })).rejects.toThrow();

        await claimUpload(ctx(), { storageId: id, userId: alice._id, purpose: "thumbnail" });
        const second = storageId(fake.upload());
        await expect(claimUpload(ctx(), { storageId: second, userId: alice._id, purpose: "thumbnail" })).rejects.toThrow();
    });

    it("rejects stale, oversized or wrongly typed uploads", async () => {
        const stale = await uploadAs(alice, "asset");
        fake.advance(2 * HOUR);
        await expect(claimUpload(ctx(), { storageId: stale, userId: alice._id, purpose: "asset" })).rejects.toThrow("expired");

        const big = await uploadAs(alice, "thumbnail", { size: FILE_POLICIES.thumbnail.maxBytes + 1, contentType: "image/jpeg" });
        await expect(claimUpload(ctx(), { storageId: big, userId: alice._id, purpose: "thumbnail" })).rejects.toThrow("Unsupported");

        const html = await uploadAs(alice, "asset", { contentType: "text/html" });
        await expect(claimUpload(ctx(), { storageId: html, userId: alice._id, purpose: "asset" })).rejects.toThrow("Unsupported");
        expect(bindingFor(html)).toBeUndefined();
    });
});

describe("issueUploadUrl", () => {
    it("rate-limits upload URLs per user and purpose", async () => {
        const limit = FILE_POLICIES.asset.uploadsPerHour;
        for (let index = 0; index < limit; index += 1) await issueUploadUrl(ctx(), alice._id, "asset");
        await expect(issueUploadUrl(ctx(), alice._id, "asset")).rejects.toThrow();
        await expect(issueUploadUrl(ctx(), alice._id, "thumbnail")).resolves.toBe("https://upload.test/url");
        await expect(issueUploadUrl(ctx(), mallory._id, "asset")).resolves.toBe("https://upload.test/url");
        fake.advance(HOUR + 1);
        await expect(issueUploadUrl(ctx(), alice._id, "asset")).resolves.toBe("https://upload.test/url");
    });
});

describe("deleteOwnedFile", () => {
    it("deletes only files bound to the caller for that purpose", async () => {
        const id = await uploadAs(alice, "thumbnail");
        await claimUpload(ctx(), { storageId: id, userId: alice._id, purpose: "thumbnail" });

        expect(await deleteOwnedFile(ctx(), id, mallory._id, "thumbnail")).toBe(false);
        expect(await deleteOwnedFile(ctx(), id, alice._id, "asset")).toBe(false);
        expect(fake.files.has(id)).toBe(true);

        expect(await deleteOwnedFile(ctx(), id, alice._id, "thumbnail")).toBe(true);
        expect(fake.files.has(id)).toBe(false);
        expect(bindingFor(id)).toBeUndefined();
    });

    it("never deletes unbound or disputed files", async () => {
        const unbound = storageId(fake.upload());
        expect(await deleteOwnedFile(ctx(), unbound, alice._id, "asset")).toBe(false);

        const disputed = storageId(fake.upload());
        await fake.insert("storageBindings", { storageId: disputed, userId: alice._id, purpose: "asset", disputed: true, createdAt: 0 });
        expect(await deleteOwnedFile(ctx(), disputed, alice._id, "asset")).toBe(false);
        expect(fake.files.has(unbound) && fake.files.has(disputed)).toBe(true);
    });
});

describe("transferFileOwnership", () => {
    it("moves guest files to the account and revokes outstanding guest grants", async () => {
        const guest = { _id: "user:guest" };
        const id = await uploadAs(guest, "thumbnail");
        await claimUpload(ctx(), { storageId: id, userId: guest._id, purpose: "thumbnail" });
        await issueUploadUrl(ctx(), guest._id, "asset");

        await transferFileOwnership(ctx(), guest._id, alice._id);
        expect(bindingFor(id)?.userId).toBe(alice._id);
        expect(fake.rows("uploadGrants").filter((grant) => grant.userId === guest._id)).toEqual([]);
    });
});

describe("project thumbnails", () => {
    async function project(owner: User, extra: Record<string, unknown> = {}) {
        return fake.insert("projects", { userId: owner._id, name: "P", isPublic: false, graphData: {}, createdAt: 0, updatedAt: 0, ...extra });
    }

    it("refuses to attach another user's file, so it cannot be deleted by a later replacement", async () => {
        const victimFile = await uploadAs(alice, "asset");
        await claimUpload(ctx(), { storageId: victimFile, userId: alice._id, purpose: "asset" });
        const malloryProject = await project(mallory);

        as(mallory);
        await handlerOf(generateThumbnailUploadUrl)(ctx(), {});
        await expect(handlerOf(updateThumbnail)(ctx(), { id: malloryProject, storageId: victimFile })).rejects.toThrow();
        expect(fake.files.has(victimFile)).toBe(true);
    });

    it("replaces the owner's thumbnail and deletes the previous one", async () => {
        const projectId = await project(alice);
        as(alice);
        await handlerOf(generateThumbnailUploadUrl)(ctx(), {});
        fake.advance(1000);
        const first = storageId(fake.upload({ contentType: "image/jpeg" }));
        await handlerOf(updateThumbnail)(ctx(), { id: projectId, storageId: first });

        await handlerOf(generateThumbnailUploadUrl)(ctx(), {});
        fake.advance(1000);
        const second = storageId(fake.upload({ contentType: "image/jpeg" }));
        await handlerOf(updateThumbnail)(ctx(), { id: projectId, storageId: second });
        expect(fake.files.has(first)).toBe(false);
        expect(fake.rows("projects")[0].thumbnailStorageId).toBe(second);

        await handlerOf(remove)(ctx(), { id: projectId });
        expect(fake.files.has(second)).toBe(false);
    });

    it("keeps a planted legacy thumbnail that the project owner does not own", async () => {
        const victimFile = storageId(fake.upload());
        await fake.insert("storageBindings", { storageId: victimFile, userId: alice._id, purpose: "asset", createdAt: 0 });
        const projectId = await project(mallory, { thumbnailStorageId: victimFile });

        as(mallory);
        await handlerOf(generateThumbnailUploadUrl)(ctx(), {});
        fake.advance(1000);
        const own = storageId(fake.upload({ contentType: "image/png" }));
        await handlerOf(updateThumbnail)(ctx(), { id: projectId, storageId: own });
        expect(fake.files.has(victimFile)).toBe(true);
    });
});

describe("assets", () => {
    it("rejects registering another user's storage ID as your asset", async () => {
        const victimFile = await uploadAs(alice, "thumbnail");
        await claimUpload(ctx(), { storageId: victimFile, userId: alice._id, purpose: "thumbnail" });
        const legacyFile = storageId(fake.upload());
        fake.advance(60 * 1000);
        as(mallory);
        await handlerOf(generateAssetUploadUrl)(ctx(), {});
        await expect(handlerOf(registerAsset)(ctx(), { storageId: legacyFile, filename: "x.png", mimeType: "image/png", size: 1 }))
            .rejects.toThrow();
        await handlerOf(generateAssetUploadUrl)(ctx(), {});
        await expect(handlerOf(registerAsset)(ctx(), { storageId: victimFile, filename: "x.png", mimeType: "image/png", size: 1 }))
            .rejects.toThrow();
        expect(fake.rows("assets")).toEqual([]);
    });

    it("records server-side size and type for the caller's upload", async () => {
        as(alice);
        await handlerOf(generateAssetUploadUrl)(ctx(), {});
        fake.advance(1000);
        const id = storageId(fake.upload({ size: 2048, contentType: "image/webp" }));
        await handlerOf(registerAsset)(ctx(), { storageId: id, filename: "t.webp", mimeType: "text/html", size: 1 });
        expect(fake.rows("assets")[0]).toMatchObject({ userId: alice._id, size: 2048, mimeType: "image/webp" });
    });

    it("only reveals asset URLs to owners and viewers of a project that uses them", async () => {
        const file = storageId(fake.upload());
        const assetId = await fake.insert("assets", { userId: alice._id, storageId: file, filename: "t.png", mimeType: "image/png", size: 1, createdAt: 0, lastAccessedAt: 0 });
        const privateProject = await fake.insert("projects", { userId: alice._id, name: "P", isPublic: false, graphData: {}, createdAt: 0, updatedAt: 0 });
        await fake.insert("assetReferences", { assetId, nodeId: "node_1", graphId: privateProject, propertyName: "url", createdAt: 0 });

        as(null);
        expect(await handlerOf(getAssetUrl)(ctx(), { assetId })).toBeNull();
        expect(await handlerOf(getNodeAssets)(ctx(), { nodeId: "node_1", graphId: privateProject })).toEqual([]);
        as(mallory);
        expect(await handlerOf(getAssetUrl)(ctx(), { assetId })).toBeNull();
        as(alice);
        expect(await handlerOf(getAssetUrl)(ctx(), { assetId })).toMatchObject({ url: `https://files.test/${file}` });
        expect(await handlerOf(getNodeAssets)(ctx(), { nodeId: "node_1", graphId: privateProject })).toHaveLength(1);

        await fake.ctx.db.patch(privateProject, { isPublic: true });
        as(null);
        expect(await handlerOf(getAssetUrl)(ctx(), { assetId })).toMatchObject({ url: `https://files.test/${file}` });
    });

    it("garbage-collects only files the asset owner owns, and retries unbound legacy files", async () => {
        const graphId = await fake.insert("projects", { userId: alice._id, name: "P", isPublic: false, graphData: {}, createdAt: 0, updatedAt: 0 });
        const addAsset = async (file: string, owner: User) => {
            const assetId = await fake.insert("assets", { userId: owner._id, storageId: file, filename: "t.png", mimeType: "image/png", size: 1, createdAt: 0, lastAccessedAt: 0 });
            await fake.insert("deletedAssetReferences", { assetId, nodeId: "n", graphId, propertyName: "url", deletedAt: 0 });
            return assetId;
        };
        const owned = storageId(fake.upload());
        await fake.insert("storageBindings", { storageId: owned, userId: alice._id, purpose: "asset", createdAt: 0 });
        await addAsset(owned, alice);
        // Mallory registered Alice's storage ID in the past (before bindings existed).
        const victimFile = storageId(fake.upload());
        await fake.insert("storageBindings", { storageId: victimFile, userId: alice._id, purpose: "asset", createdAt: 0 });
        await addAsset(victimFile, mallory);
        const legacy = storageId(fake.upload());
        const legacyAsset = await addAsset(legacy, alice);

        fake.advance(8 * 24 * HOUR);
        await handlerOf(garbageCollectAssets)(ctx(), {});
        expect(fake.files.has(owned)).toBe(false);
        expect(fake.files.has(victimFile)).toBe(true);
        expect(fake.files.has(legacy)).toBe(true);
        expect(fake.rows("assets").map((asset) => asset._id)).toEqual([legacyAsset]);
        expect(fake.rows("deletedAssetReferences")).toHaveLength(1);
    });
});

describe("account deletion", () => {
    it("deletes the user's own files but not storage IDs planted in their rows", async () => {
        as(mallory);
        await handlerOf(generateThumbnailUploadUrl)(ctx(), {});
        fake.advance(1000);
        const own = storageId(fake.upload());
        await claimUpload(ctx(), { storageId: own, userId: mallory._id, purpose: "thumbnail" });

        const victimFile = storageId(fake.upload());
        await fake.insert("storageBindings", { storageId: victimFile, userId: alice._id, purpose: "asset", createdAt: 0 });
        await fake.insert("assets", { userId: mallory._id, storageId: victimFile, filename: "x", mimeType: "image/png", size: 1, createdAt: 0, lastAccessedAt: 0 });
        await fake.insert("projects", { userId: mallory._id, name: "P", isPublic: false, graphData: {}, thumbnailStorageId: victimFile, createdAt: 0, updatedAt: 0 });

        await handlerOf(deleteSelf)(ctx(), {});
        expect(fake.files.has(own)).toBe(false);
        expect(fake.files.has(victimFile)).toBe(true);
        expect(fake.rows("storageBindings").map((binding) => binding.userId)).toEqual([alice._id]);
    });
});

describe("guest project limit", () => {
    it("applies to clones as well as new projects", async () => {
        const guest = { _id: "user:guest", isAnonymous: true };
        const source = await fake.insert("projects", { userId: alice._id, name: "Public", isPublic: true, graphData: {}, createdAt: 0, updatedAt: 0 });
        as(guest);
        await handlerOf(clone)(ctx(), { sourceId: source, name: "Copy", graphData: {} });
        await expect(handlerOf(clone)(ctx(), { sourceId: source, name: "Copy 2", graphData: {} })).rejects.toThrow();

        as(alice);
        await handlerOf(clone)(ctx(), { sourceId: source, name: "Mine", graphData: {} });
        await handlerOf(clone)(ctx(), { sourceId: source, name: "Mine 2", graphData: {} });
    });
});

describe("legacy backfill and maintenance", () => {
    const runBackfill = async () => {
        let args: Record<string, unknown> = {};
        for (let step = 0; step < 50; step += 1) {
            const before = fake.scheduled.length;
            await handlerOf(backfillStorageBindings)(ctx(), args);
            if (fake.scheduled.length === before) return;
            args = fake.scheduled[fake.scheduled.length - 1].args as Record<string, unknown>;
        }
        throw new Error("backfill did not finish");
    };

    it("binds existing files to their single owner and marks shared ones disputed", async () => {
        const asset = storageId(fake.upload());
        const thumbnail = storageId(fake.upload());
        const shared = storageId(fake.upload());
        await fake.insert("assets", { userId: alice._id, storageId: asset, filename: "a", mimeType: "image/png", size: 1, createdAt: 0, lastAccessedAt: 0 });
        await fake.insert("assets", { userId: alice._id, storageId: shared, filename: "s", mimeType: "image/png", size: 1, createdAt: 0, lastAccessedAt: 0 });
        await fake.insert("projects", { userId: alice._id, name: "P", isPublic: false, graphData: {}, thumbnailStorageId: thumbnail, createdAt: 0, updatedAt: 0 });
        await fake.insert("projects", { userId: mallory._id, name: "M", isPublic: false, graphData: {}, thumbnailStorageId: shared, createdAt: 0, updatedAt: 0 });
        await fake.insert("assets", { userId: alice._id, storageId: "_storage:missing", filename: "m", mimeType: "image/png", size: 1, createdAt: 0, lastAccessedAt: 0 });

        await runBackfill();
        expect(bindingFor(asset)).toMatchObject({ userId: alice._id, purpose: "asset" });
        expect(bindingFor(thumbnail)).toMatchObject({ userId: alice._id, purpose: "thumbnail" });
        expect(bindingFor(shared)).toMatchObject({ disputed: true });
        expect(bindingFor("_storage:missing")).toBeUndefined();
        expect(fake.rows("storageMaintenance")[0].orphanSweepSince).toBe(fake.now());
    });

    it("sweeps only unclaimed uploads made after the backfill, once they are a day old", async () => {
        const legacyOrphan = storageId(fake.upload());
        fake.advance(1000);
        await handlerOf(runStorageMaintenance)(ctx(), {});
        expect(fake.files.has(legacyOrphan)).toBe(true);

        await runBackfill();
        fake.advance(1000);
        const abandoned = await uploadAs(alice, "asset");
        const claimed = await uploadAs(alice, "asset");
        await claimUpload(ctx(), { storageId: claimed, userId: alice._id, purpose: "asset" });

        await handlerOf(runStorageMaintenance)(ctx(), {});
        expect(fake.files.has(abandoned)).toBe(true);

        fake.advance(25 * HOUR);
        const recent = storageId(fake.upload());
        await handlerOf(runStorageMaintenance)(ctx(), {});
        expect(fake.files.has(abandoned)).toBe(false);
        expect(fake.files.has(claimed)).toBe(true);
        expect(fake.files.has(recent)).toBe(true);
        expect(fake.files.has(legacyOrphan)).toBe(true);
        expect(fake.rows("uploadGrants")).toEqual([]);
    });
});
