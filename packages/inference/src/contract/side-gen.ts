// The side-generation sampling posture: the three knobs the side-gen ladder folds (`funnel/resolve-side-gen.ts`).

/** One rung / the resolved result — the three knobs the ladder folds. Each optional; absent = "defer / the
 *  runner default stands". A superset object (e.g. a full `UserIntent`) satisfies this structurally. */
export interface SideGenSampling {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
}
