/**
 * Dual-mode database client.
 *
 * Production (DATABASE_URL set):  Neon serverless HTTP — real Postgres,
 *   persistent across requests, works in Vercel serverless functions.
 *
 * Local dev (no DATABASE_URL):  PGlite — embedded Postgres WASM, zero setup,
 *   data stored in .pgdata directory.
 */

import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

const globalForDb = globalThis as unknown as {
  __db?: AnyDb;
  __pglite?: import("@electric-sql/pglite").PGlite;
  __pgliteHooked?: boolean;
};

function init(): AnyDb {
  if (globalForDb.__db) return globalForDb.__db;

  if (process.env.DATABASE_URL) {
    // ── Neon serverless (production) ────────────────────────────────────────
    // Both neon() and drizzle() are synchronous — only query execution is async.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neon } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/neon-http") as typeof import("drizzle-orm/neon-http");
    const sql = neon(process.env.DATABASE_URL);
    const db = drizzle(sql, { schema, casing: "snake_case" });
    globalForDb.__db = db;
    return db;
  }

  // ── PGlite (local dev) ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");

  const dataDir = process.env.PGLITE_DATA_DIR ?? "./.pgdata";
  const client = globalForDb.__pglite ?? new PGlite(dataDir);
  globalForDb.__pglite = client;

  if (!globalForDb.__pgliteHooked) {
    globalForDb.__pgliteHooked = true;
    const close = () => void client.close().finally(() => process.exit(0));
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  }

  const db = drizzle(client, { schema, casing: "snake_case" });
  globalForDb.__db = db;
  return db;
}

// Proxy defers init until first use so build-time static-generation workers
// never open PGlite (which would corrupt the local file store).
export const db: AnyDb = new Proxy({} as AnyDb, {
  get(_target, prop, receiver) {
    if (prop === "then") return undefined; // not a Promise itself
    const real = init();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
