import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Local-first database using PGlite (embedded Postgres, WASM). This gives us a
 * real Postgres dialect with zero external setup so the project is testable
 * immediately. For production on Vercel, swap this file for a Neon/Vercel
 * Postgres client (drizzle-orm/neon-http) pointed at process.env.DATABASE_URL.
 *
 * The drizzle instance is created lazily on first use so that build-time /
 * static-generation workers never open the single-process PGlite store (which
 * would risk corrupting the local file database).
 */

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "./.pgdata";

const globalForDb = globalThis as unknown as {
  __pglite?: PGlite;
  __db?: DrizzleDb;
  __pgliteHooked?: boolean;
};

function init(): DrizzleDb {
  if (globalForDb.__db) return globalForDb.__db;

  const client = globalForDb.__pglite ?? new PGlite(DATA_DIR);
  if (process.env.NODE_ENV !== "production") globalForDb.__pglite = client;

  // Flush PGlite to disk on clean shutdown so a Ctrl+C doesn't corrupt the file
  // store. (A hard kill -9 can still corrupt it; recover with `npm run db:reset`.)
  if (typeof process !== "undefined" && !globalForDb.__pgliteHooked) {
    globalForDb.__pgliteHooked = true;
    const close = () => {
      void client.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  }

  const instance = drizzle(client, { schema, casing: "snake_case" });
  if (process.env.NODE_ENV !== "production") globalForDb.__db = instance;
  return instance;
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const real = init();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
