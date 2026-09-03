// perf-meter's argv defaults that both ops/parse.ts (the parser) and contract/help.ts (the operator
// prose, which interpolates them) need — split out so help.ts never imports the parser.
export const DEFAULT_SETTLE_MS = 2000;
