// In-memory stand-in for the Convex ctx used by function handler tests.
// Indexes come from the real schema, so a query on a missing index fails.
// (Multiple dots in the file name keep Convex from deploying this module.)
import schema from "./schema";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Op = "eq" | "gt" | "gte" | "lt" | "lte";
interface Condition { field: string; op: Op; value: unknown }

const compareValues = (a: unknown, b: unknown): number => {
    if (a === b) return 0;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return (a as number | string) < (b as number | string) ? -1 : 1;
};

const matches = (value: unknown, { op, value: expected }: Condition) => {
    const order = compareValues(value, expected);
    if (op === "eq") return order === 0;
    if (op === "gt") return order > 0;
    if (op === "gte") return order >= 0;
    if (op === "lt") return order < 0;
    return order <= 0;
};

export function createFakeConvex({ now = 1_000_000_000 }: { now?: number } = {}) {
    let clock = now;
    let counter = 0;
    const tables = new Map<string, Map<string, Row>>();
    const files = new Map<string, Row & { size: number; contentType?: string; sha256: string }>();
    const scheduled: Array<{ args: unknown }> = [];
    let identity: { subject: string; email?: string; name?: string } | null = null;

    const tableRows = (table: string) => {
        if (!tables.has(table)) tables.set(table, new Map());
        return tables.get(table)!;
    };
    const indexFields = (table: string, index: string) => {
        if (index === "by_creation_time") return ["_creationTime"];
        const definitions = (schema as unknown as { tables: Record<string, { indexes: Array<{ indexDescriptor: string; fields: string[] }> }> }).tables;
        const definition = definitions[table]?.indexes.find((candidate) => candidate.indexDescriptor === index);
        if (!definition) throw new Error(`Unknown index ${table}.${index}`);
        return [...definition.fields, "_creationTime"];
    };

    function makeQuery(table: string, source: () => Row[]) {
        const conditions: Condition[] = [];
        let sortFields = ["_creationTime"];
        let descending = false;
        const run = () => {
            const rows = source().filter((row) => conditions.every((condition) => matches(row[condition.field], condition)));
            rows.sort((a, b) => {
                for (const field of sortFields) {
                    const order = compareValues(a[field], b[field]);
                    if (order !== 0) return order;
                }
                return 0;
            });
            return descending ? rows.reverse() : rows;
        };
        const query = {
            withIndex(index: string, build?: (q: unknown) => unknown) {
                sortFields = indexFields(table, index);
                const builder: Record<Op, (field: string, value: unknown) => unknown> = {} as never;
                for (const op of ["eq", "gt", "gte", "lt", "lte"] as const) {
                    builder[op] = (field, value) => { conditions.push({ field, op, value }); return builder; };
                }
                build?.(builder);
                return query;
            },
            order(direction: "asc" | "desc") { descending = direction === "desc"; return query; },
            async first() { return run()[0] ?? null; },
            async unique() {
                const rows = run();
                if (rows.length > 1) throw new Error(`unique() matched ${rows.length} rows in ${table}`);
                return rows[0] ?? null;
            },
            async collect() { return run(); },
            async take(count: number) { return run().slice(0, count); },
            async paginate({ cursor, numItems }: { cursor: string | null; numItems: number }) {
                const rows = run();
                const start = cursor ? Number(cursor) : 0;
                return { page: rows.slice(start, start + numItems), isDone: start + numItems >= rows.length, continueCursor: String(start + numItems) };
            },
        };
        return query;
    }

    const db = {
        async get(tableOrId: string, maybeId?: string) {
            const id = maybeId ?? tableOrId;
            return tableRows(id.split(":")[0]).get(id) ?? null;
        },
        query: (table: string) => makeQuery(table, () => [...tableRows(table).values()]),
        async insert(table: string, value: Record<string, unknown>) {
            const id = `${table}:${++counter}`;
            tableRows(table).set(id, { ...value, _id: id, _creationTime: clock + counter / 1000 });
            return id;
        },
        async patch(id: string, value: Record<string, unknown>) {
            const row = tableRows(id.split(":")[0]).get(id);
            if (!row) throw new Error(`patch: missing ${id}`);
            for (const [key, field] of Object.entries(value)) {
                if (field === undefined) delete row[key];
                else row[key] = field;
            }
        },
        async delete(id: string) {
            if (!tableRows(id.split(":")[0]).delete(id)) throw new Error(`delete: missing ${id}`);
        },
        system: {
            get: async (_table: string, id: string) => files.get(id) ?? null,
            query: (table: "_storage") => makeQuery(table, () => [...files.values()]),
        },
    };

    const ctx = {
        db,
        storage: {
            generateUploadUrl: async () => "https://upload.test/url",
            getUrl: async (id: string) => (files.has(id) ? `https://files.test/${id}` : null),
            delete: async (id: string) => {
                if (!files.delete(id)) throw new Error(`storage.delete: missing ${id}`);
            },
        },
        scheduler: {
            runAfter: async (_delay: number, _fn: unknown, args: unknown) => { scheduled.push({ args }); },
        },
        auth: {
            getUserIdentity: async () => identity,
        },
    };

    return {
        ctx,
        files,
        scheduled,
        rows: (table: string) => [...tableRows(table).values()],
        now: () => clock,
        advance(ms: number) { clock += ms; },
        setIdentity(next: typeof identity) { identity = next; },
        /** Simulate a file landing in storage (e.g. via an upload URL) at the current time. */
        upload({ size = 1024, contentType = "image/png", at = clock }: { size?: number; contentType?: string; at?: number } = {}) {
            const id = `_storage:${++counter}`;
            files.set(id, { _id: id, _creationTime: at, size, contentType, sha256: "x" });
            return id;
        },
        insert: (table: string, value: Record<string, unknown>) => db.insert(table, value),
    };
}

export type FakeConvex = ReturnType<typeof createFakeConvex>;

/** Registered Convex functions keep their implementation on `_handler`. */
export function handlerOf<Args, Result = unknown>(fn: unknown) {
    return (fn as { _handler: (ctx: unknown, args: Args) => Promise<Result> })._handler;
}
