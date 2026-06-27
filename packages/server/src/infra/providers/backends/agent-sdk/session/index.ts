// biome-ignore-all lint/performance/noBarrelFile: the agent-sdk session sub-barrel — the one seam the
// runner + the family barrel reach the canon-derived cache through (its surface is small + internal).
//
// infra/providers/backends/agent-sdk/session — the backend-internal, canon-derived resume cache: the SDK
// SessionStore + the per-chat resume map (store.ts) and the empirically-validated seed-frame synthesis
// (frames.ts). Backend-internal — the domain turn never sees a session (participants-agents-identity.md §6).

export {
  buildSeedFrames,
  GREETING_USER_STUB,
  type SeedTurn,
  seedFramesAreStale,
  toSeedTurns,
} from "./frames";
export { InMemorySessionStore, SessionCache } from "./store";
