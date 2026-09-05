// The rpg live-loop SETTLE predicate (#1493) — pure, so the branch a live spec polls on can be proven with
// fixtures instead of with a model.
//
// THE RULING THIS PRESERVES (rpg-lite-loop.spec.ts, verbatim in its own comment): "EITHER the state moved (a
// beat / location / condition landed) OR the extraction produced an empty delta and canon is intact… Both
// are terminal — the 8B empty-delta is an accepted honest-arms ceiling (plan-for-small-hardware), never a
// code defect." That ruling survives untouched. Its INPUT was wrong: the empty-delta arm was
// `(await fetchDebugErrors()).length === 0`, which is TRUE ON TICK ONE — before the turn's state round has
// run at all. So the poll the comment describes as "waits for the flush" returned on its first evaluation,
// and every assertion after it was racing an extraction that had not happened. (The tell: an empty error
// ring is the app's NORMAL state; a poll arm that is satisfied by normality is not a barrier.)
//
// THE FIX IS THE OBSERVABLE, not the arms: the empty-delta arm now requires the rpg flight recorder to have
// recorded a `flush` for this chat — the event the write boundary emits when the extraction settled, empty
// delta or not (domain/rpg/contract/trace.ts). That is true only AFTER the thing the poll claims to wait for.
//
// CANON CORRUPTION IS NOT SETTLEMENT: a view whose ambient plane vanished satisfies neither arm, so the poll
// keeps waiting and then fails loudly, instead of scoring the disappearance as "the state moved".

/** The subset of `TrackerView` the predicate reads. Spelled structurally so this module stays free of the
 *  support tree's tRPC types (and so a fixture is three fields, not a whole projection). */
export interface RpgSettleView {
  readonly ambient: { readonly location: string } | null;
  readonly actors: readonly { readonly volatile?: { readonly conditions: readonly unknown[] } | null }[];
  readonly recentBeats: readonly unknown[];
}

export interface RpgSettleInput {
  /** The freshly-read persisted-snapshot projection. */
  readonly view: RpgSettleView;
  /** The location the spec pre-seeded — "the state moved" is measured against THIS, never a literal. */
  readonly seededLocation: string;
  /** Did the rpg trace ring record a `flush` for this chat? (`hasRpgFlush` below.) */
  readonly flushed: boolean;
  /** How many entries the debug error ring holds. */
  readonly errorCount: number;
}

/** Did the snapshot MOVE off the pre-seeded state — a beat, a new location, or a condition landing? */
export function rpgStateMoved(view: RpgSettleView, seededLocation: string): boolean {
  if (view.recentBeats.length > 0) {
    return true;
  }
  if (view.actors.some((actor) => (actor.volatile?.conditions.length ?? 0) > 0)) {
    return true;
  }
  // A PRESENT location that differs. `ambient === null` is canon damage, not a move (see the header).
  return view.ambient !== null && view.ambient.location !== seededLocation;
}

/** Is the turn's state round terminal? Either arm is a legitimate end state; neither is satisfiable before
 *  the extraction has actually run. */
export function rpgTurnSettled(input: RpgSettleInput): boolean {
  if (rpgStateMoved(input.view, input.seededLocation)) {
    return true;
  }
  // The empty-delta arm, with the flush OBSERVED: the extraction settled, wrote nothing, corrupted nothing.
  return input.flushed && input.errorCount === 0 && input.view.ambient?.location === input.seededLocation;
}

/** Did the flight recorder see this chat's flush? The `flush` phase is emitted by the write boundary whether
 *  or not the delta was empty — including when the contract backstop REFUSED the write (`droppedReason`),
 *  which is still "the extraction settled" and is caught by the error-ring arm instead. */
export function hasRpgFlush(records: readonly { readonly event: { readonly phase: string } }[]): boolean {
  return records.some((record) => record.event.phase === "flush");
}
