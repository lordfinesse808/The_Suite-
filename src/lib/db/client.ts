import fs from "node:fs";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { env } from "../env";

export type DB = PgliteDatabase<typeof schema>;

interface Holder {
  db: DB;
  kind: "pglite" | "postgres";
  ready: Promise<void>;
  /** Run a multi-statement SQL script. */
  exec: (q: string) => Promise<void>;
  /** Session-level advisory lock (postgres only; PGlite is single-connection). */
  withLock: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
  /** Close underlying connection (tests/scripts). */
  close: () => Promise<void>;
}

const g = globalThis as unknown as { __ileDb?: Holder };

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");

export function migrationFiles(): { name: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }));
}

async function create(): Promise<Holder> {
  const url = env().DATABASE_URL;
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { prepare: false, max: 5 });
    const db = drizzle(client, { schema }) as unknown as DB;
    return {
      db,
      kind: "postgres",
      exec: async (q: string) => {
        await client.unsafe(q);
      },
      withLock: async (key, fn) => {
        const conn = await client.reserve();
        try {
          await conn`select pg_advisory_lock(hashtext(${key}))`;
          return await fn();
        } finally {
          await conn`select pg_advisory_unlock(hashtext(${key}))`.catch(() => undefined);
          conn.release();
        }
      },
      ready: Promise.resolve(),
      close: async () => {
        await client.end();
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = url && url !== "" ? url : path.join(process.cwd(), ".data", "pglite");
  if (!dataDir.startsWith("memory://")) fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  const exec = async (q: string) => {
    await client.exec(q);
  };
  const holder: Holder = {
    db,
    kind: "pglite",
    exec,
    withLock: (_key, fn) => fn(),
    ready: Promise.resolve(),
    close: async () => {
      await client.close();
    },
  };
  holder.ready = (async () => {
    await runMigrations(db, exec);
    if (process.env.NODE_ENV !== "test" && process.env.AUTO_SEED !== "false") {
      const { seedIfEmpty } = await import("./seed");
      await seedIfEmpty(db);
    }
  })();
  return holder;
}

let creating: Promise<Holder> | null = null;

async function holder(): Promise<Holder> {
  if (g.__ileDb) return g.__ileDb;
  if (!creating) {
    creating = create().then((h) => {
      g.__ileDb = h;
      return h;
    });
  }
  const h = await creating;
  return h;
}

/** Returns the database, migrated (and seeded on first local boot). */
export async function getDb(): Promise<DB> {
  const h = await holder();
  await h.ready;
  return h.db;
}

const localLocks = new Map<string, Promise<unknown>>();

/** Serialise work per key (one lead's messages are handled in order). */
export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = localLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => mine);
  localLocks.set(key, chained);
  await prev.catch(() => undefined);
  try {
    const h = await holder();
    return await h.withLock(key, fn);
  } finally {
    release();
    if (localLocks.get(key) === chained) localLocks.delete(key);
  }
}

export async function dbKind(): Promise<"pglite" | "postgres"> {
  return (await holder()).kind;
}

export async function closeDb() {
  if (g.__ileDb) {
    await g.__ileDb.close();
    g.__ileDb = undefined;
    creating = null;
  }
}

export async function migrate() {
  const h = await holder();
  await h.ready;
  await runMigrations(h.db, h.exec);
}

export async function runMigrations(db: DB, exec: (q: string) => Promise<void>) {
  await db.execute(sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set(rows<{ name: string }>(await db.execute(sql`select name from _migrations`)).map((r) => r.name));
  for (const m of migrationFiles()) {
    if (done.has(m.name)) continue;
    await exec(m.sql);
    await db.execute(sql`insert into _migrations (name) values (${m.name})`);
  }
}

/** Normalises raw query results across drivers (pglite returns {rows}, postgres-js an array). */
export function rows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = res as { rows?: T[] };
  return r.rows ?? [];
}

export async function query<T>(q: SQL): Promise<T[]> {
  const db = await getDb();
  return rows<T>(await db.execute(q));
}
