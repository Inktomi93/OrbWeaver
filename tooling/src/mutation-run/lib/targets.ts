// The files `pnpm test:mutation:targets` runs, one row each. Add or remove a target by adding or removing its row;
// `--candidates` prints what the change history ranks and this list lacks. A row names `tests` only when the lookup in
// ./target-tests.ts misses the tests that reach the file; those tests then replace the lookup.

/** One file the hand-run mutation pass covers, and why it is worth the run. */
export interface MutationTarget {
  readonly file: string;
  readonly tests?: readonly string[];
  readonly reason: string;
}

export const MUTATION_TARGETS: readonly MutationTarget[] = [
  { file: "packages/server/src/infra/plugin-host/process-runtime.ts", reason: "the plugin runtime pool and the parent side of each guest process" },
  { file: "packages/server/src/domain/chat/verbs/turn.ts", reason: "the turn front door: gate, identity, connection, speakers, round" },
  { file: "packages/server/src/entry/lifecycle.ts", reason: "boot and shutdown order" },
  { file: "packages/server/src/domain/chat/engine/engine.ts", reason: "the turn lifecycle shell around one speaker" },
  { file: "packages/server/src/domain/chat/verbs/read.ts", reason: "chat reads and the membership gate on each" },
  { file: "packages/server/src/infra/plugin-host/budgets.ts", reason: "the plugin host's abuse limits" },
  { file: "packages/ui/src/content/theme-scope/clamp.ts", reason: "the theme value boundary: parse, clamp or drop" },
  { file: "packages/server/src/domain/chat/verbs/edit.ts", reason: "canon edits on slots and variants" },
  { file: "packages/server/src/infra/plugin-host/membrane.ts", reason: "the capability-gated host calls a plugin makes" },
  { file: "packages/server/src/domain/chat/persistence/queries.ts", reason: "membership-scoped chat, canon and stream-log reads" },
  { file: "packages/server/src/infra/network/egress.ts", reason: "outbound address and port policy" },
  { file: "packages/server/src/domain/connection/verbs/connections.ts", reason: "the one writer of connection rows and its refusals" },
  { file: "packages/client/src/data/invalidation.ts", reason: "which cached reads a bus event or mutation refreshes" },
  { file: "packages/server/src/domain/chat/engine/pipeline.ts", reason: "the per-turn pipeline: request, stream, history fit" },
  { file: "packages/inference/src/backends/openai-compat/chat.ts", reason: "one chat turn on the OpenAI-compatible wire" },
  { file: "packages/ui/src/lib/width.ts", tests: ["tests/ui/primitives/**/*.test.ts"], reason: "the named size steps primitive props map to" },
  { file: "packages/server/src/domain/stats/persistence/rebuild-from-canon.ts", reason: "the stats rebuild from canon" },
  { file: "packages/inference/src/resolve/resolve-task.ts", reason: "the resolver from task and principal to connection and model" },
  { file: "packages/server/src/domain/chat/context.ts", reason: "the chat context and the subsystem ops it binds" },
];
