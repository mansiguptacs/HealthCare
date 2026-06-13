import { defineConfig } from "drizzle-kit";

const isNeon = Boolean(process.env.DATABASE_URL);

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  ...(isNeon
    ? {
        driver: undefined,
        dbCredentials: { url: process.env.DATABASE_URL! },
      }
    : {
        driver: "pglite" as never,
        dbCredentials: { url: process.env.PGLITE_DATA_DIR ?? "./.pgdata" },
      }),
});
