// verb: scoreSweep — the LIBRARY score pass (R4; port study I3, the orb-native win the source extension
// never had). One score run per card, straight into `characters.refinery.score` — the sweep is the
// NO-SESSION stamping path: it opens no `refinery_sessions` row, appends no `refinery_runs` row, and never
// touches a card's authored content. It is the same F6 signal channel `runStage`'s score arm writes, driven
// over the whole library instead of one session's card.
//
// WHY NO RUN ROWS: `refinery_runs` hangs off a session by FK, and a sweep has no session by design (there is
// no anchored `original_card`, no selection the user chose, no iterate loop). Inventing one session per card
// would mint hundreds of workspace rows nobody opened. The critique itself is therefore NOT kept — only the
// scalar the library sorts and the dossier read. A user who wants the critique starts a session on that card.
//
// THE §20 CARVE-OUT, STATED (docs/design/refinery-schema-renderer.md §20, fork F-W1): the owner ruling is
// "no as-you-go card writes — the live character is touched ONCE, at the terminal act". That ruling is about
// AUTHORED CONTENT. A score stamp is derived metadata ABOUT the card ("derived, not authored" —
// `contracts/character`'s own words), and this sweep's entire purpose is stamping scores WITHOUT ever
// applying, so the carve-out is not a loophole here, it is the feature. The sweep still writes exactly one
// member of one JSON column, through the SAME injected character op every other stamp goes through
// (`characters.*` keeps exactly one writer, F6).
//
// THE OUTPUT CAP IS PAYLOAD-AWARE HERE TOO (live e2e 2026-08-09, open fork 3). This pass used to resolve the
// RAW `refine_score` posture floor — the same static number whose being smaller than the payload 503'd the
// session path twice against the real fleet. A sweep's failure mode is quieter and worse: a truncated card
// just counts `failed`, so a library-wide under-budget reads as "the model is bad at this" instead of as a
// misconfiguration. It now folds the SAME `substrate/output-budget` expression (`sweepOutputSamplingOf`).
//
// TWO FAILURE POSTURES, one pass — the distill batch pattern verbatim (`discovery/verbs/distill.ts`):
// per-card containment (one bad card must never abort the other 500 — the pass stamps every valid score and
// REPORTS `failed`), and a bounded per-card retry fan-out (a schema failure is CORRELATED: a summarize model
// that ignores the json_schema fails EVERY card identically, so a naive `Promise.all` over the library would
// fire N retry calls at once — the exact 429 storm the wave size bounds).

import type { RefineryScorePayload, RefineryScoreSweepResult, RefinerySelection } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { SummarizeOptions } from "@orb/contracts/role-clients";
import type { ReportProgress } from "@orb/contracts/workloads";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { estimateTokens } from "@orb/kit/tokens";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn } from "@orb/server/kit/structured-turn";
import type { RefineryScoreTarget } from "#domain/character";
import type { ScoreSweepOptions } from "../contract/params.ts";
import type { StageEstimateSubject } from "../contract/prompts.ts";
import type { RefineryWorkloadDeps, ScoreSweep } from "../contract/service.ts";
import { outputEstimateOf, resolveStageSampling } from "../substrate/output-budget.ts";
import { buildScorePrompt, defaultSelectionOf } from "../substrate/refine-prompt.ts";
import { REFINERY_RESPONSE_FORMATS } from "../substrate/stage-resolution.ts";
import { traceStructuredRetry } from "../substrate/structured-retry-trace.ts";

/** The sweep's score MODE, recorded as a default rather than a knob: a library pass is TRIAGE — it keeps
 *  one number per card and discards the critique, so paying for the full per-field rubric would buy output
 *  tokens nothing reads. The deep rubric is what a session is for, and `quick` is the mode the source
 *  extension's own corpus wrote for exactly this "score a lot of cards" case. */
const SWEEP_SCORE_MODE = "quick";

/** Caps the per-card RETRY fan-out (distill's `DISTILL_RETRY_CONCURRENCY` twin, same reasoning — see the
 *  header). The happy path pays nothing: a card whose batch reply parses first-try makes no extra call. */
const SWEEP_RETRY_CONCURRENCY = 8;

/** One card's ASSEMBLED score prompt beside the target it belongs to — built once, and the bounded retry
 *  re-sends these exact bytes, so a retry can never drift from the batch call's prompt. */
interface SweepItem {
  readonly target: RefineryScoreTarget;
  readonly system: string;
  readonly user: string;
  /** What this card will ask the model to produce — the §8 estimate's input (`substrate/output-budget`). */
  readonly subject: StageEstimateSubject;
}

/**
 * THE BATCH'S ONE OUTPUT CAP, payload-aware (live e2e 2026-08-09, open fork 3 — this pass shipped on the raw
 * `refine_score` posture floor, which is the exact defect that 503'd the session path: a floor smaller than
 * the payload truncates on both attempts and fails the card). Same expression the session engine and the fit
 * line evaluate — one home for the number, never a second arithmetic that agrees by luck.
 *
 * ONE cap serves N cards, so it is resolved against the WORST card on each axis independently: the HUNGRIEST
 * payload sets what the cap must cover, and the BIGGEST prompt sets the window clamp (room shrinks as input
 * grows, so the largest prompt yields the tightest — i.e. the only safe — room). A cap is a ceiling, not an
 * allocation: the small cards simply do not spend it.
 *
 * No REFUSAL arm here, deliberately. The ruled refusal (`run-stage.ts`) is for an interactive run whose
 * caller capped their own preset; a sweep is a bulk pass with per-card containment, no fit line to have
 * warned anyone, and under the BULK arm no single caller at all (`presetParams` is `undefined` there).
 */
function sweepOutputSamplingOf(items: readonly SweepItem[], presetParams: SideGenSampling | undefined, contextTokens: number | null): SideGenSampling {
  // Non-empty by the caller's `ready.length === 0` early return.
  const hungriest = items.reduce((a, b) => (outputEstimateOf(b.subject) > outputEstimateOf(a.subject) ? b : a));
  const widestInput = items.reduce((max, item) => Math.max(max, estimateTokens(`${item.system}\n${item.user}`)), 0);
  return resolveStageSampling({ subject: hungriest.subject, presetParams, contextTokens, inputEstimate: widestInput });
}

/** Bind the library score sweep over the workload DI bundle (the verb-naming factory the workload
 *  contribution composes — the `createDistill` precedent). */
export function createScoreSweep(deps: RefineryWorkloadDeps): ScoreSweep {
  return (opts) => runScoreSweep(deps, opts);
}

async function runScoreSweep(deps: RefineryWorkloadDeps, opts: ScoreSweepOptions): Promise<RefineryScoreSweepResult> {
  const { ownerId, rescoreAll, report, signal } = opts;
  signal?.throwIfAborted();
  // The FILL arm pushes "already scored" into SQL — a re-run over a scored library must not pay one model
  // call per card it already knows (`rescoreAll` is the explicit refresh opt-in).
  const { targets, inScope } = await deps.listRefineryScoreTargets({ ownerId, unscoredOnly: !rescoreAll });
  const ready = readyTargetsOf(targets);
  // `scanned` is the CANDIDATE set, not the fetched subset: a fill run over a fully-scored library must
  // report "500 cards, 500 skipped", never "0 cards" (which reads as an empty library). Everything the pass
  // did not score — already-scored under the FILL arm, or name-only under the content floor — is `skipped`.
  const skipped = inScope - ready.length;
  if (ready.length === 0) {
    return { scanned: inScope, scored: 0, skipped, failed: 0 };
  }

  // The side-gen sampling ladder, distill's rung exactly: the `refine_score` floor ← the card owner's
  // default-preset params. A per-owner narrow reads that host's rungs; the mixed-owner BULK pass has no
  // single owner, so it stays on the floor and reads the shipped prose (`{}`).
  const presetParams = ownerId === null ? undefined : await deps.resolveUserPresetParams(ownerId);
  const overrides = ownerId === null ? {} : await deps.resolveUserProse(ownerId);
  // The prompts come from the SAME pure builder a session's score stage uses — one prompt discipline, so a
  // sweep score and a session score are the same question asked of the same model. Assembled BEFORE the
  // sampling opts because the output cap is sized off these payloads (see `sweepOutputSamplingOf`).
  const items = ready.map(({ target, selection }): SweepItem => {
    const prompts = buildScorePrompt({ card: target.card, selection, mode: SWEEP_SCORE_MODE, guidance: null, overrides });
    return { target, system: prompts.system, user: prompts.user, subject: { stage: "score", card: target.card, selection } };
  });
  const sampleOpts: SummarizeOptions = {
    responseFormat: REFINERY_RESPONSE_FORMATS.score,
    ...toSummarizeOptions(sweepOutputSamplingOf(items, presetParams, deps.summarizerContextTokens)),
  };

  signal?.throwIfAborted();
  report({ message: `scoring ${items.length} card${items.length === 1 ? "" : "s"}`, current: 0, total: items.length });
  // One batched call fills the role's parallel-slot pipeline; `items[i]` pairs 1:1 with `result.items[i]`.
  const replies = await deps.summarize(
    items.map((item) => ({ systemPrompt: item.system, userPrompt: item.user })),
    sampleOpts,
  );

  const { scored, failed } = await stampParsedScores(deps, { items, replies: replies.items, sampleOpts }, { report, signal });
  // `failed` cards were READY (they reached the model), so they are not skipped — the four counts partition
  // the candidate set exactly: scanned = scored + skipped + failed.
  return { scanned: inScope, scored, skipped, failed };
}

/** THE CONTENT FLOOR (the distill ruling, same shape): a card with no refinable text has nothing to
 *  critique — the score payload requires per-field critique plus an overall number, so every one of them
 *  would be invented from a name. `defaultSelectionOf` IS the readiness verdict AND the sweep's scope: it is
 *  the same derivation `startSession` uses to decide what a session would put in scope, so a sweep score and
 *  a session score judge the same fields. An uncounted skip is how a silent sweep lies, so the caller reports
 *  the difference. */
function readyTargetsOf(targets: readonly RefineryScoreTarget[]): { target: RefineryScoreTarget; selection: RefinerySelection }[] {
  return targets.flatMap((target) => {
    const selection = defaultSelectionOf(target.card);
    return selection.fields.length === 0 ? [] : [{ target, selection }];
  });
}

/** Parse every reply in bounded waves and stamp each card that produced a score. The FIRST attempt reuses
 *  the already-fetched batch text (free); a correlated failure sends cards to a retry summarize call, and the
 *  wave size is that fan-out's bound. A card that fails twice (or whose retry hits an infra error) counts
 *  `failed` — both causes collapse deliberately: a per-card cause is noise in a sweep's counts and the user's
 *  action is identical (re-run the pass). */
async function stampParsedScores(
  deps: RefineryWorkloadDeps,
  pass: { readonly items: readonly SweepItem[]; readonly replies: readonly { readonly text: string }[]; readonly sampleOpts: SummarizeOptions },
  progress: { readonly report: ReportProgress; readonly signal: AbortSignal | undefined },
): Promise<{ scored: number; failed: number }> {
  const { items, replies, sampleOpts } = pass;
  let scored = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += SWEEP_RETRY_CONCURRENCY) {
    progress.signal?.throwIfAborted();
    const wave = items.slice(i, i + SWEEP_RETRY_CONCURRENCY);
    // biome-ignore lint/performance/noAwaitInLoops: bounded-concurrency WAVES — a wave's per-card retries and its stamps run inside `runWave`; the loop advancing one wave at a time IS the concurrency bound (a fan-out over the whole library is the 429 storm the header names).
    const outcome = await runWave(deps, wave, replies.slice(i, i + wave.length), sampleOpts);
    scored += outcome.scored;
    failed += outcome.failed;
    progress.report({ message: `scored ${scored} of ${items.length}`, current: i + wave.length, total: items.length });
  }
  return { scored, failed };
}

/** ONE wave: parse its cards in parallel (bounded by the wave size), then stamp the ones that produced a
 *  score, IN ORDER. The stamps are sequential on purpose — each is a read-merge-write over the same JSON
 *  column, so a fan-out is a lost-update race, not a speed-up. */
async function runWave(
  deps: RefineryWorkloadDeps,
  wave: readonly SweepItem[],
  replies: readonly { readonly text: string }[],
  sampleOpts: SummarizeOptions,
): Promise<{ scored: number; failed: number }> {
  const parsed = await Promise.all(wave.map((item, j) => parseOneScore(deps, item, replies[j]?.text ?? "", sampleOpts)));
  let scored = 0;
  for (const [j, payload] of parsed.entries()) {
    const item = wave[j];
    if (item === undefined || payload === null) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequenced per-card merge-stamp — see this function's header (a fan-out over one JSON column is a lost-update race).
    await deps.stampRefinerySignals({ ownerId: item.target.ownerId, characterId: item.target.characterId, patch: { score: payload.overallScore } });
    scored += 1;
  }
  return { scored, failed: parsed.filter((payload) => payload === null).length };
}

/** Parse ONE card's score through the structured-turn helper (D79): the batch reply is the first attempt
 *  (already fetched — it cannot throw); a per-card retry re-summarizes that one card with the validation
 *  issues appended. Returns the payload, or `null` when the card FAILED (containment — the header). */
async function parseOneScore(
  deps: RefineryWorkloadDeps,
  item: SweepItem,
  batchText: string,
  sampleOpts: SummarizeOptions,
): Promise<RefineryScorePayload | null> {
  const run = (correction?: string): Promise<string> =>
    correction === undefined ? Promise.resolve(batchText) : retryScoreOne(deps, item, correction, sampleOpts);
  try {
    return await runStructuredTurn({ payloadSchema: REFINERY_STAGE_PAYLOADS.score, run, onRetry: traceStructuredRetry("refine-score") });
  } catch {
    return null;
  }
}

/** Re-summarize ONE card with the zod issues appended — the structured-turn helper's bounded retry. Rides
 *  the SAME resolved posture AND the same assembled prompt the batch call used. */
async function retryScoreOne(deps: RefineryWorkloadDeps, item: SweepItem, correction: string, sampleOpts: SummarizeOptions): Promise<string> {
  const res = await deps.summarize([{ systemPrompt: item.system, userPrompt: `${item.user}\n\n${correction}` }], sampleOpts);
  return res.items[0]?.text ?? "";
}
