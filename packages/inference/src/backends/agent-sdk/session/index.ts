//
// infra/providers/backends/agent-sdk/session — the backend-internal, canon-derived resume cache: the SDK
// SessionStore + the per-chat resume map (store.ts) and the empirically-validated seed-frame synthesis
// (frames.ts). Backend-internal — the domain turn never sees a session (docs/law/Spine-Identity-and-Auth.md §"BFF session ≠ SDK chat session").

export type { SessionEntryWriter } from "#contract";
export { NO_SAVED_TOTALS } from "./frames.ts";
export { SessionCache } from "./store.ts";
