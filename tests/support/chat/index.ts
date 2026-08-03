// tests/support/chat — the chat scenario/tape/scripted-runner harness (neo test-steal N4). The trio +
// assertions a chat int test wires to run REAL verbs over a REAL db with a SCRIPTED provider:
//   • tape()            — a fluent provider-response script (`.reply()/.error()/.rateLimit()`).
//   • scriptedRunner()  — the FIFO runner presenting the tape as `ctx.runChatTurn` (the ONE role seam).
//   • scenario.chat()   — the composition-root-as-fixture driver (seeds a room, wires the verbs, records).
//   • assert*           — named turn invariants (static-prefix stability, token totals, event sequence).
// See each file header for the orb-vs-neo divergences (ONE runChatTurn seam, no group/solo split; rate-limit
// as a thrown ProviderError above the retry layer).

export type { EventSequenceOptions } from "./assertions.ts";
export {
  assertEventSequence,
  assertStaticPrefixStable,
  assertTokenTotalsConsistent,
} from "./assertions.ts";
export type { ChatScenario, ChatScenarioOptions, SendOptions } from "./scenario.ts";
export { scenario } from "./scenario.ts";
export type {
  ErrorOptions,
  RateLimitOptions,
  ReplyOptions,
  ScriptedRunnerOptions,
  Tape,
} from "./tape.ts";
export { scriptedRunner, tape } from "./tape.ts";
