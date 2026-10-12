// domain/rpg — FRONT DOOR: the only legal external import. transport consumes the `RpgService` (the verb
// surface); the composition root (W1c) builds the `RpgContext` bundle (db + injected clock + id mints + the
// staging singleton + the five injected cross-feature ops + the dice CSPRNG) and calls `createRpgService`.
// The injected-op SHAPES (`RpgGetMembership`/`RpgSetPointer`/`RpgResolveParticipants`/`RpgPostNarratorMessage`/
// `RpgResolveStateDelivery` + `RpgParticipantActor`/`RpgIdMints`) are re-exported type-only so compose wires
// them to chat/connection's runtime impls. Cross-boundary WIRE shapes (the views, actor/snapshot schemas) are
// NOT re-declared here — their home is `@orb/contracts/rpg` (§7.4). The staging store + its factory come from
// the feature-root `staging.ts` (W1a); this door re-exports the store for compose to mint the singleton.

export { publishRpgEvent, subscribeRpgEvents } from "./bus.ts";
export { createRpgChatOps } from "./chat-ops/index.ts";
// The cheap-mode tools' two OUTWARD-crossing shapes (`tools/rounds/` names both). Re-homed to the
// domain's `contract/` on 2026-08-22 (#408) — they were declared in `tools/apply.ts` only because the
// `no-inline-types` gate's `/tools/` clause exempted that subsystem by string accident.
export type { ActorRefIndex, ExtractionMints, StateRoundPlans } from "./contract/params.ts";
// PORTABILITY R6 — the chat-anchored campaign's read-whole/write-whole pair, wired at the composition root as
// injected ops on the chat-bundle export/import verbs. A campaign was unportable BY CONSTRUCTION while the
// bundle's chat arm was the ST jsonl interchange (F9); these are the fidelity arm's rpg half.
export type { ExportRpgGame, ImportRpgGame, RpgPortabilityContext, RpgPortableGame } from "./contract/portability.ts";
// R-OBS — the rpg flight recorder's SHAPES: the compose mints ONE recorder when tracing is enabled and wires
// its `sink` into the rpg compose deps; `/api/_debug/rpg/traces` reads its ring through the foundation
// `RpgTraceInspector` port (which never learns an rpg type — the records serialize straight to JSON).
export type { RpgRoundsChatOps, RpgRoundsDeps } from "./contract/rounds.ts";
export type {
  RpgContext,
  RpgCopyPresetToUser,
  RpgGetMembership,
  RpgIdMints,
  RpgParticipantActor,
  RpgPopulateDelta,
  RpgPostNarratorMessage,
  RpgPromoteToCharacter,
  RpgResolveParticipants,
  RpgResolvePresetOwned,
  RpgResolveStateDelivery,
  RpgResolveViewerVisibility,
  RpgRunExtraction,
  RpgRunToolRound,
  RpgService,
  RpgSetPointer,
  RpgStagingStore,
  RpgStateDelta,
} from "./contract/service.ts";
export type { RpgTraceRecorder, RpgTraceSink } from "./contract/trace.ts";
// The per-chat flush barrier (the race fix): the compose mints it as a singleton, the gather awaits it.
export { createRpgFlushBarrier } from "./flush-barrier.ts";
// The GM-voice rooms of a preset, the rpg fact preset's backward-bindings rule reads through compose.
export { listGmPresetChatIds } from "./persistence/games.ts";
export { createExportRpgGame, createImportRpgGame } from "./persistence/portability-write.ts";
export { createRpgService } from "./service.ts";
export { createRpgStagingStore } from "./staging.ts";
// The 7 cheap-mode state tool defs (§4.5) — a factory closing over `RpgContext`; W1c-b registers them into the
// ONE `toolUse` registry at compose (the imagery precedent).
export { rpgToolDefinitions } from "./tools/index.ts";
export { buildResolveStateDelivery, buildResolveStateRoundFit } from "./tools/rounds/delivery.ts";
// The state-round and host-door factories `RpgContext` is wired with, built over `RpgRoundsDeps` at the composition
// root (the injected executor, connection resolve and chat ops), plus the flush observability hooks.
export { buildFoldedTurnBuilder, buildFoldTurnToolCalls } from "./tools/rounds/folded.ts";
export { createRpgRoundObservers } from "./tools/rounds/observers.ts";
export { buildRunPopulateExtraction } from "./tools/rounds/populate.ts";
export { buildPromoteToCharacter, rpgPromotionProvenance } from "./tools/rounds/promotion.ts";
export { buildToolRoundWireTools } from "./tools/rounds/prompts.ts";
export { buildRunResyncExtraction } from "./tools/rounds/resync.ts";
export { structuredShapes } from "./tools/rounds/structured.ts";
export { buildRunToolRound } from "./tools/rounds/tool-round.ts";
// The recorder RUNTIME (the bounded ring). Built only when tracing is on; unwired, the sink is `undefined`
// and every emit site short-circuits, so an untraced turn is byte-identical.
export { createRpgTraceRecorder } from "./trace.ts";
