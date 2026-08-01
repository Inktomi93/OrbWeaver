// domain/rpg — FRONT DOOR: the only legal external import. transport consumes the `RpgService` (the verb
// surface); the composition root (W1c) builds the `RpgContext` bundle (db + injected clock + id mints + the
// staging singleton + the five injected cross-feature ops + the dice CSPRNG) and calls `createRpgService`.
// The injected-op SHAPES (`RpgGetMembership`/`RpgSetPointer`/`RpgResolveRoster`/`RpgPostNarratorMessage`/
// `RpgResolveStateDelivery` + `RpgRosterActor`/`RpgIdMints`) are re-exported type-only so compose wires
// them to chat/connection's runtime impls. Cross-boundary WIRE shapes (the views, actor/snapshot schemas) are
// NOT re-declared here — their home is `@orb/contracts/rpg` (§7.4). The staging store + its factory come from
// the feature-root `staging.ts` (W1a); this door re-exports the store for compose to mint the singleton.

export { publishRpgEvent, subscribeRpgEvents } from "./bus";
export { createRpgChatOps } from "./chat-ops";
export type {
  RpgContext,
  RpgGetMembership,
  RpgIdMints,
  RpgPostNarratorMessage,
  RpgResolvePresetOwned,
  RpgResolveRoster,
  RpgResolveStateDelivery,
  RpgRosterActor,
  RpgRunExtraction,
  RpgRunToolRound,
  RpgService,
  RpgSetPointer,
  RpgStagingStore,
  RpgStateDelta,
} from "./contract/service";
// The per-chat flush barrier (the race fix): the compose mints it as a singleton, the gather awaits it.
export { createRpgFlushBarrier } from "./flush-barrier";
// The game-row read (by chatId) compose's honest-arms + extraction wiring needs to reach the game's mode/config
// (the connection-capability resolve keys on `extractionMode`). A thin persistence read exposed for the
// composition root — the tracker-readonly + runExtraction ops it wires close over it.
export { findGameByChat } from "./persistence/games";
// R6 — the per-actor write-surface assembly (compose) resolves each roster actor's SHEET exceptions
// (`trackerGrants`/`trackerRevokes`) to decide which trackers that actor may be offered.
export { listSheets } from "./persistence/sheets";
export { createRpgService } from "./service";
export { createRpgStagingStore } from "./staging";
// The pure honest-arms derivation (§4.6) — W1c wires it with the connection resolve + game config into the
// `RpgResolveStateDelivery` injected op (the mode→axis mapping stays rpg's law).
export { deriveTrackersReadOnly, hasStructuredWriter } from "./substrate/readonly-axis";
// The 7 cheap-mode state tool defs (§4.5) — a factory closing over `RpgContext`; W1c-b registers them into the
// ONE `toolUse` registry at compose (the imagery precedent).
export { rpgToolDefinitions } from "./tools";
export type { ExtractionMints, RosterRefIndex } from "./tools/apply";
// The extraction fold (§4.6) — converts a parsed `RpgExtraction` (arrays of cheap-mode tool args)
// into the `RpgStateDelta` the accumulator flushes. Every vehicle's impl consumes it; the SAME appliers
// the cheap-mode tools use (the shared-plane proof). Deterministic — the caller injects the id mints.
// `ghostTargetRefs` is the R5 guard's ONE predicate: the fold drops on it, and the compose observability logs
// the same list (so a "dropped" warning can never disagree with what actually applied); `reachableActorRefs` is
// the state-derived half of it — the target MENU, which the R1 fold logs as its write-nothing denominator
// without re-resolving the whole per-call ref bundle at flush time.
export { buildRosterRefIndex, extractionToStateDelta, ghostTargetRefs, reachableActorRefs } from "./tools/apply";
