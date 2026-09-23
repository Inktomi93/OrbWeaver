// render-trace's programmatic front door — what tests and sibling tools import; the cli fronts this
// surface (subcommands render|tail|fire). One tool, one API (docs/law/Core-Tooling-Law.md §2.5).
// RequestTrace/SerializedSpan re-export: TYPE-ONLY from the server's observability barrel, so a
// server-side shape change fails `tsc` here instead of silently desyncing the renderer.
export type { RequestTrace, SerializedSpan } from "@orb/server/foundation/observability";
export { emptySpansGap, fireEvidenceGap } from "./lib/evidence.ts";
export { renderTrace } from "./lib/render.ts";
export { fireOp } from "./ops/fire.ts";
export { renderOp } from "./ops/render.ts";
export { tailOp } from "./ops/tail.ts";
