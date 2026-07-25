import { z } from "zod";

// Either DATABASE_URL or DATABASE_URL_POOLED must be set in any process that
// imports a client from this package. We accept both because Neon publishes two
// connection strings: the HTTP/edge one and the pooled (PgBouncer) one.
//
// In dev: pnpm dev sets both via .env.local from a Neon dev branch.
// In Vercel / Fly: set as env vars in the platform UI.
const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_POOLED: z.string().url().optional(),
});

export const dbEnv = schema.parse(process.env);

export function requireUrl(): string {
  if (!dbEnv.DATABASE_URL) {
    throw new Error(
      "@launchwings/db: DATABASE_URL not set (used by the HTTP / serverless driver).",
    );
  }
  return dbEnv.DATABASE_URL;
}

export function requirePooledUrl(): string {
  const url = dbEnv.DATABASE_URL_POOLED ?? dbEnv.DATABASE_URL;
  if (!url) {
    throw new Error(
      "@launchwings/db: DATABASE_URL_POOLED (or DATABASE_URL) must be set for the pooled / pg driver.",
    );
  }
  return url;
}
