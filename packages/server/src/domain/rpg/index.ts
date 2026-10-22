// domain/rpg — FRONT DOOR: transport consumes RpgService; composition builds its context and staging store.
// Consumed operation types stay on this door; canonical wire shapes live in @orb/contracts/rpg.

export { createRpgEventBus, subscribeRpgEvents } from "./bus.ts";
export { createRpgChatOps } from "./chat-ops/index.ts";
export type { RpgEventBus } from "./contract/bus.ts";
// PORTABILITY R6 — the chat-anchored campaign's read-whole/write-whole pair, wired at the composition root as
// injected ops on the chat-bundle export/import verbs. A campaign was unportable BY CONSTRUCTION while the
// bundle's chat arm was the ST jsonl interchange (F9); these are the fidelity arm's rpg half.
export type { ExportRpgGame, ImportRpgGame, RpgPortableGame } from "./contract/portability.ts";
// R-OBS — the rpg flight recorder's SHAPES: the compose mints ONE recorder when tracing is enabled and wires
// its `sink` into the rpg compose deps; `/api/_debug/rpg/traces` reads its ring through the foundation
// `RpgTraceInspector` port (which never learns an rpg type — the records serialize straight to JSON).
export type { RpgRoundsAssemblyDeps as RpgRoundsDeps } from "./contract/rounds.ts";
export type {
  RpgAssemblyContext as RpgContext,
  RpgCopyPresetToUser,
  RpgPostNarratorMessage,
  RpgResolvePresetOwned,
  RpgResolveViewerVisibility,
  RpgService,
} from "./contract/service.ts";
export type { RpgTraceRecorder } from "./contract/trace.ts";
// The GM-voice rooms of a preset, the rpg fact preset's backward-bindings rule reads through compose.
export { listGmPresetChatIds } from "./persistence/games.ts";
export { createExportRpgGame, createImportRpgGame } from "./persistence/portability-write.ts";
export { createRpgService } from "./service.ts";
export { createRpgStagingStore } from "./staging.ts";
// The effective-delivery derivation the client fixtures and the rpg context section read (the mode→axis mapping
// stays rpg's law).
export { deriveEffectiveDelivery } from "./substrate/readonly-axis.ts";
// The 7 cheap-mode state tool defs (§4.5) — a factory closing over `RpgContext`; W1c-b registers them into the
// ONE `toolUse` registry at compose (the imagery precedent).
export { rpgToolDefinitions } from "./tools/index.ts";
export { buildResolveStateDelivery, buildResolveStateRoundFit } from "./tools/rounds/delivery.ts";
// The state-round and host-door factories `RpgContext` is wired with, built over `RpgRoundsDeps` at the composition
// root (the injected executor, connection resolve and chat ops), plus the flush observability hooks.
export { buildFoldedTurnBuilder, buildFoldTurnToolCalls } from "./tools/rounds/folded.ts";
export { createRpgRoundObservers } from "./tools/rounds/observers.ts";
export { buildRunPopulateExtraction } from "./tools/rounds/populate.ts";
export { buildPromoteToCharacter } from "./tools/rounds/promotion.ts";
export { buildRunResyncExtraction } from "./tools/rounds/resync.ts";
export { buildRunToolRound } from "./tools/rounds/tool-round.ts";
// The recorder RUNTIME (the bounded ring). Built only when tracing is on; unwired, the sink is `undefined`
// and every emit site short-circuits, so an untraced turn is byte-identical.
export { createRpgTraceRecorder } from "./trace.ts";
