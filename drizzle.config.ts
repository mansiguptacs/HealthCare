import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  driver: "pglite",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.PGLITE_DATA_DIR ?? "./.pgdata",
  },
});
