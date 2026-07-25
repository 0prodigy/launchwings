import type { Config } from "drizzle-kit";

// drizzle-kit reads this for `db:generate` (creates migration SQL files in
// migrations/) and for the studio command. Runtime clients are wired in
// src/client-{http,pool}.ts and do not depend on this file.

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/launchwings_dev",
  },
  strict: true,
  verbose: true,
} satisfies Config;
