// domain/rpg/contract/delta — the domain-internal shapes the per-plane snapshot-diff registry is authored over
// (parity-plus §2.7/§2.7.1). Homed here (§7.4: domain-internal types live in the domain's contract/, not the
// substrate that USES them); `substrate/delta.ts` imports these to declare its renderers + the open registry.

import type { ProseOverrides } from "@orb/contracts/prose";
import type { RpgSnapshotState, RpgTrackerDef } from "@orb/contracts/rpg";

/** The pure diff's DATA CONTEXT (parity-plus §2.7, P0 fold-ins #5/§2.8) — everything a renderer needs that is
 *  NOT in the two snapshots, arriving as DATA so the registry stays PURE (no I/O). `participantNames` maps an
 *  `actorRefKey` string to a roster display name so per-actor lines name roster actors ("Kael HP 12→16", not
 *  "character HP 12→16" — the gather resolves it from `ctx.resolveParticipants`). `trackerDefs` are the game's
 *  tracker definitions, which the tracker renderers diff SHAPE-aware (a meter numerically, text/list as a
 *  transition) and gloss with the def's `hint` (R5b — the same steering argument R4b proved for the reminder:
 *  a bare number moves narration by noise, a glossed one by a full point). Both empty ⇒ no tracker lines. */
export interface DeltaContext {
  readonly participantNames: Readonly<Record<string, string>>;
  readonly trackerDefs: readonly RpgTrackerDef[];
  /** Per-custom-relationship-kind steering HINTS (M1 — `label → gloss`) so a custom relationship delta line
   *  renders `vassal (sworn to serve but resentful)`. Empty ⇒ bare labels. */
  readonly relationshipHints: Readonly<Record<string, string>>;
  /** PROSE-1 (§4.3) — the turn PRESET's model-facing prose overrides (`promptConfig.prose`), so the two delta HEADINGS
   *  (`rpg.delta.changesHeading` / `rpg.delta.sceneOpensHeading`) resolve a host override. Optional: absent/`{}`
   *  ⇒ each heading resolves to its shipped default, byte-identical to the pre-PROSE-1 constant. */
  readonly prose?: ProseOverrides;
}

/** One per-plane diff renderer authored over its OWN slice type `T` (§2.7.1). `select` projects the plane's
 *  slice out of the full snapshot state; `render` diffs the prev vs current slice into the compact delta lines
 *  this plane emits (an empty array = this plane didn't change). Kept generic so each renderer is a pure,
 *  independently-testable function of ITS plane — a per-actor plane's slice is the whole `actorState` array (the
 *  renderer correlates within it), a scalar plane's slice is that scalar. */
export interface PlaneDiffRenderer<T> {
  readonly plane: string;
  readonly select: (state: RpgSnapshotState) => T;
  readonly render: (prev: T, cur: T, ctx: DeltaContext) => readonly string[];
}

/** A renderer with its slice type ERASED — the shape the open registry holds (the slice types differ per
 *  plane, so the registry can't be generic; `definePlaneDiff` binds `select`+`render` into `run` so the erased
 *  slice never leaks across the pair). `run` takes the two FULL snapshots and internally selects. */
export interface RegisteredPlaneDiff {
  readonly plane: string;
  readonly run: (prev: RpgSnapshotState, cur: RpgSnapshotState, ctx: DeltaContext) => readonly string[];
}
