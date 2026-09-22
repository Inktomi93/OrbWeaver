//
// infra/providers/backends/agent-sdk/session — the backend-internal, canon-derived resume cache: the SDK
// SessionStore + the per-chat resume map (store.ts) and the empirically-validated seed-frame synthesis
// (frames.ts). Backend-internal — the domain turn never sees a session (core/Spine-Identity-and-Auth.md §"BFF session ≠ SDK chat session").

export type { SessionEntryWriter } from "../../../contract/agent.ts";
export {
  buildSeedFrames,
  canonHashOf,
  GREETING_USER_STUB,
  isBranchDivergence,
  type SeedTurn,
  seedSessionId,
  sessionContainsSeedPrefix,
  sessionMatchesSeed,
  toSeedTurns,
} from "./frames.ts";
export {
  InMemorySessionStore,
  type ReplaceableSessionStore,
  type SeededSessionDecision,
  SessionCache,
} from "./store.ts";
