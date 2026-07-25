// Twitter card uses the same 1200×630 render as the default OG card.
// Re-exporting from opengraph-image keeps a single source of truth so when we
// iterate on layout the two stay locked. Next 15 picks up the file-convention
// exports (alt / size / contentType) and the default fn from this module.
//
// Note: `runtime` is re-declared inline here rather than re-exported because
// Next's static analyzer cannot follow re-exported route segment config across
// modules and falls back to the default runtime with a build warning.
export const runtime = "edge";
export { alt, size, contentType, default } from "./opengraph-image";
