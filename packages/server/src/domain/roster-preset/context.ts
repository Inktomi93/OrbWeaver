// domain/roster-preset — DI BUNDLE re-export. `RosterPresetContext` is homed in `contract/service.ts`
// (§7.4 — one type home, never `ReturnType<>`); this file re-exports it under the canonical import
// name. Assembled at `entry/compose/roster-preset.ts` (db + injected clock/id determinism seam +
// db-bound `logAudit` + the chat-owned ops); roster-preset sideways-imports none of those at runtime
// (domain-no-cross-feature — the chat op TYPES cross type-only through chat's front door). No guard
// slot: every CRUD surface is ownership-scoped off `principal.userId` (the persona posture), and
// `applyToChat`'s host authority is chat's own injected `requireHost`.

export type { RosterPresetContext } from "./contract/service.ts";
