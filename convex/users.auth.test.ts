import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
    authComponent: { getAnyUserById: vi.fn() },
}));

import { api, internal } from "./_generated/api";
import { authComponent } from "./auth";
import { transferGuestDataToUser } from "./users";

const getAnyUserByIdMock = vi.mocked(authComponent.getAnyUserById);
const handler = (transferGuestDataToUser as unknown as {
    _handler: (ctx: unknown, args: { guestUserId: string; targetUserId: string }) => Promise<unknown>;
})._handler;

type User = { _id: string; isAnonymous?: boolean };
type Row = { _id: string; userId: string };

function makeContext(rows: Record<string, Row[]>) {
    const patches: Array<[string, { userId: string }]> = [];
    const queries: string[] = [];
    const ctx = {
        db: {
            query: (table: string) => {
                queries.push(table);
                return {
                    withIndex: (_index: string, build: (q: { eq: (field: string, value: string) => unknown }) => unknown) => {
                        build({ eq: () => undefined });
                        return { collect: async () => rows[table] ?? [] };
                    },
                };
            },
            patch: async (id: string, update: { userId: string }) => {
                patches.push([id, update]);
            },
        },
    };
    return { ctx, patches, queries };
}

function setUsers(users: Record<string, User | null>) {
    getAnyUserByIdMock.mockImplementation(async (_ctx, id) => (users[id] ?? null) as never);
}

describe("guest data migration", () => {
    beforeEach(() => getAnyUserByIdMock.mockReset());

    it("is internal and absent from the generated public API", () => {
        expect((transferGuestDataToUser as unknown as { isInternal?: boolean }).isInternal).toBe(true);
        expect((transferGuestDataToUser as unknown as { isPublic?: boolean }).isPublic).toBeUndefined();
        expect(internal.users.transferGuestDataToUser).toBeDefined();
    });

    // This compile-time assertion ensures client code cannot reference the migration.
    function publicApiMustNotExposeMigration() {
        // @ts-expect-error Internal mutations are excluded from the generated public API.
        return api.users.transferGuestDataToUser;
    }
    void publicApiMustNotExposeMigration;

    it("rejects a non-anonymous source and an anonymous target", async () => {
        const sourceContext = makeContext({});
        setUsers({ guest: { _id: "convex:guest", isAnonymous: false }, target: { _id: "convex:target" } });
        await expect(handler(sourceContext.ctx, { guestUserId: "guest", targetUserId: "target" }))
            .rejects.toThrow("Source user must be an existing anonymous user");
        expect(sourceContext.patches).toEqual([]);

        const targetContext = makeContext({});
        setUsers({ guest: { _id: "convex:guest", isAnonymous: true }, target: { _id: "convex:target", isAnonymous: true } });
        await expect(handler(targetContext.ctx, { guestUserId: "guest", targetUserId: "target" }))
            .rejects.toThrow("Target user must be an existing non-anonymous user");
        expect(targetContext.patches).toEqual([]);
    });

    it("rejects missing users and identical source and target IDs", async () => {
        const context = makeContext({});
        setUsers({ guest: { _id: "convex:guest", isAnonymous: true } });

        await expect(handler(context.ctx, { guestUserId: "guest", targetUserId: "missing" }))
            .rejects.toThrow("Target user must be an existing non-anonymous user");
        await expect(handler(context.ctx, { guestUserId: "guest", targetUserId: "guest" }))
            .rejects.toThrow("Guest and target users must be different");
        expect(context.patches).toEqual([]);
    });

    it("transfers every guest project plus assets and feedbacks", async () => {
        setUsers({
            guest: { _id: "convex:guest", isAnonymous: true },
            target: { _id: "convex:target", isAnonymous: false },
        });
        const context = makeContext({
            projects: [
                { _id: "projects:one", userId: "convex:guest" },
                { _id: "projects:two", userId: "convex:guest" },
            ],
            assets: [{ _id: "assets:one", userId: "convex:guest" }],
            feedbacks: [{ _id: "feedbacks:one", userId: "convex:guest" }],
        });

        await expect(handler(context.ctx, { guestUserId: "guest", targetUserId: "target" }))
            .resolves.toEqual({ success: true });
        expect(context.queries).toEqual(["projects", "assets", "feedbacks", "storageBindings", "uploadGrants"]);
        expect(context.patches).toEqual([
            ["projects:one", { userId: "convex:target" }],
            ["projects:two", { userId: "convex:target" }],
            ["assets:one", { userId: "convex:target" }],
            ["feedbacks:one", { userId: "convex:target" }],
        ]);
    });

    it("propagates a write failure so the Convex mutation can roll back", async () => {
        setUsers({
            guest: { _id: "convex:guest", isAnonymous: true },
            target: { _id: "convex:target", isAnonymous: false },
        });
        const context = makeContext({
            projects: [{ _id: "projects:one", userId: "convex:guest" }],
        });
        const writeError = new Error("database write failed");
        context.ctx.db.patch = async () => { throw writeError; };

        await expect(handler(context.ctx, { guestUserId: "guest", targetUserId: "target" }))
            .rejects.toBe(writeError);
    });
});
