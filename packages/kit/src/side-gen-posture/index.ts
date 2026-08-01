// @orb/kit/side-gen-posture — the PURE resolver for a side-generation call's sampling posture.
//
// Every side-generation call site (arbitration, quiet generation, compaction, distillation, analysis,
// greeting studio, /autobg, caption) resolves its sampling through ONE ladder instead of a hardcoded const:
//
//   the caller's preset `params`  →  a floor default (data)
//
// TWO rungs, no third: a per-template sampling override on the preset's guided actions was DELETED (owner
// ruling 2026-08-01) — a guided generation runs at the preset's normal params like every other turn. The
// preset params are the ONE user-owned rung; the floor is per-site data.
//
// This leaf owns only the FOLD — no I/O, no domain, no knowledge of WHICH preset a site reads (the server
// resolves that and hands the params in). The fold is right-to-left with absent-skips: a knob present in the
// higher rung wins; an absent knob defers to the rung below; a knob absent everywhere stays absent (so
// caption's empty floor + no preset knob yields `{}` — the backend default stands). Both rung shapes are
// structurally compatible (`{temperature?, topP?, maxOutputTokens?}` subsets) — this resolver takes the
// three fields it folds and ignores anything else a rung carries, so a preset's full `UserIntent` can be
// passed as `presetParams` verbatim without the caller pre-projecting it.
//
// The output vocabulary is `userIntentSchema`'s (`maxOutputTokens`, not `maxTokens`): a call site whose
// downstream seam wants `maxTokens` (the summarize role's `SummarizeOptions`) maps the field at that seam.

/** One rung / the resolved result — the three knobs the ladder folds. Each optional; absent = "defer / the
 *  runner default stands". A superset object (e.g. a full `UserIntent`) satisfies this structurally. */
export interface SideGenSampling {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
}

/** Fold one field: the higher rung wins when present, else the accumulated lower value. */
function pick(higher: number | undefined, lower: number | undefined): number | undefined {
  return higher ?? lower;
}

/**
 * Resolve a side-generation call's sampling posture by folding the ladder right-to-left:
 * `floor` (the per-site data default) is overlaid by `presetParams` (the caller's preset generation params —
 * the top rung). An absent knob at a rung defers to the rung below; a knob absent at both is absent in the
 * result.
 *
 * The result carries ONLY the knobs that resolved to a value — a field that stayed absent is omitted, never
 * emitted as `undefined` (so `{}` is a valid, meaningful result: apply nothing, the backend default stands).
 */
export function resolveSideGenSampling(floor: SideGenSampling, presetParams?: SideGenSampling | undefined): SideGenSampling {
  const temperature = pick(presetParams?.temperature, floor.temperature);
  const topP = pick(presetParams?.topP, floor.topP);
  const maxOutputTokens = pick(presetParams?.maxOutputTokens, floor.maxOutputTokens);
  return {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
  };
}
