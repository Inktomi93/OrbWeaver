// wire-tap's programmatic front door — what tests and sibling tools import; the cli fronts this
// surface (subcommands sse|captures|trpc). One tool, one API (docs/design/tooling-package.md §2.5).
export { capturesOp } from "./ops/captures.ts";
export { sseOp } from "./ops/sse.ts";
export { trpcOp } from "./ops/trpc.ts";
