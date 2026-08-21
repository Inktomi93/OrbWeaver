// screen-record's programmatic front door (`pnpm record`) — what tests and sibling tools import; the
// cli fronts this surface. One tool, one API (docs/design/tooling-package.md §2.5).
export type { Args, Recording, Step } from "./contract/types.ts";
export { parseRecordArgs, RECORD_HELP } from "./ops/parse.ts";
export { runScreenRecord } from "./ops/run.ts";
