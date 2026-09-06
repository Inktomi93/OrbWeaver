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
// THE carrier derivation (the ONE home for "which tracker class is this person, and what are their
// exceptions") — re-exported because BOTH surfaces must go through it: the tracker view's READ projection and
// the compose walk that builds the model's WRITE surface. Two spellings of that rule is exactly the §1.4
// read/write drift the R2 reshape dissolved.
export { actorCarrier } from "./chat-ops/tracker-view.ts";
// The cheap-mode tools' two OUTWARD-crossing shapes (`entry/compose/rpg.ts` names both). Re-homed to the
// domain's `contract/` on 2026-08-22 (#408) — they were declared in `tools/apply.ts` only because the
// `no-inline-types` gate's `/tools/` clause exempted that subsystem by string accident.
export type { ActorRefIndex, ExtractionMints } from "./contract/params.ts";
// PORTABILITY R6 — the chat-anchored campaign's read-whole/write-whole pair, wired at the composition root as
// injected ops on the chat-bundle export/import verbs. A campaign was unportable BY CONSTRUCTION while the
// bundle's chat arm was the ST jsonl interchange (F9); these are the fidelity arm's rpg half.
export type { ExportRpgGame, ImportRpgGame, RpgPortabilityContext, RpgPortableGame } from "./contract/portability.ts";
// EDITSNAP-OK — the hand doors' errors-as-data VERDICT. Exported because compose CALLS those doors (the
// demo-chat replay) and a caller that cannot name the refusal shape cannot check it; the type was already
// the exported `RpgService`'s return type, so this adds a name, not surface.
export type { HandDoorResult } from "./contract/results.ts";
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
// R-OBS — the rpg flight recorder's SHAPES: the compose mints ONE recorder when tracing is enabled and wires
// its `sink` into the rpg compose deps; `/api/_debug/rpg/traces` reads its ring through the foundation
// `RpgTraceInspector` port (which never learns an rpg type — the records serialize straight to JSON).
export type { RpgTraceEvent, RpgTraceRecord, RpgTraceRecorder, RpgTraceSink } from "./contract/trace.ts";
// The per-chat flush barrier (the race fix): the compose mints it as a singleton, the gather awaits it.
export { createRpgFlushBarrier } from "./flush-barrier.ts";
// The game-row read (by chatId) compose's honest-arms + extraction wiring needs to reach the game's mode/config
// (the connection-capability resolve keys on `extractionMode`). A thin persistence read exposed for the
// composition root — the tracker-readonly + runExtraction ops it wires close over it.
export { findGameByChat } from "./persistence/games.ts";
export { createExportRpgGame, createImportRpgGame } from "./persistence/portability-write.ts";
// R6 — the per-actor write-surface assembly (compose) resolves each participant actor's SHEET exceptions
// (`trackerGrants`/`trackerRevokes`) to decide which trackers that actor may be offered.
export { listSheets } from "./persistence/sheets.ts";
export { createRpgService } from "./service.ts";
export { createRpgStagingStore } from "./staging.ts";
// The pure honest-arms derivation (§4.6) — W1c wires it with the connection resolve + game config into the
// `RpgResolveStateDelivery` injected op (the mode→axis mapping stays rpg's law).
export { deriveTrackersReadOnly, hasStructuredWriter, hasToolWriter } from "./substrate/readonly-axis.ts";
// The extraction fold (§4.6) — converts a parsed `RpgExtraction` (arrays of cheap-mode tool args)
// into the `RpgStateDelta` the accumulator flushes. Every vehicle's impl consumes it; the SAME appliers
// the cheap-mode tools use (the shared-plane proof). Deterministic — the caller injects the id mints.
// `ghostTargetRefs` is the R5 guard's ONE predicate: the fold drops on it, and the compose observability logs
// the same list (so a "dropped" warning can never disagree with what actually applied); `reachableActorRefs` is
// the state-derived half of it — the target MENU, which the R1 fold logs as its write-nothing denominator
// without re-resolving the whole per-call ref bundle at flush time.
export { buildActorRefIndex, extractionToStateDelta, ghostTargetRefs, reachableActorRefs } from "./tools/apply.ts";
// The 7 cheap-mode state tool defs (§4.5) — a factory closing over `RpgContext`; W1c-b registers them into the
// ONE `toolUse` registry at compose (the imagery precedent).
export { rpgToolDefinitions } from "./tools/index.ts";
// The recorder RUNTIME (the bounded ring). Built only when tracing is on; unwired, the sink is `undefined`
// and every emit site short-circuits, so an untraced turn is byte-identical.
export { createRpgTraceRecorder } from "./trace.ts";
