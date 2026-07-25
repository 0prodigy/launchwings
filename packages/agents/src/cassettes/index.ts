// Re-export the cassette public surface. Keep tests and recorded fixtures
// behind a tiny named export so callers don't reach into ./record directly.
export { withCassette, getCassetteMode, hashMessages, CASSETTE_ROOT } from "./record";
export type { CassetteMode } from "./record";
