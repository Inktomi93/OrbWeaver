// The human report + the RESULT line + the exit verdict — raw/classified/budgeted, all labeled.
import { print } from "@orb/tooling/_shared/artifacts";
import type { BrowserEnvironmentEvidence } from "@orb/tooling/_shared/browser-environment";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { INSTRUMENT_ERROR_VERDICT, printEvidenceGaps, printVerdict } from "@orb/tooling/_shared/evidence";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AnimationRecord, Args, AuditData, LoafRecord, MotionFlagRecord, ReachAction } from "../contract/types.ts";
import { animationTotals, isSanctionedLibraryAnimation } from "../lib/animations.ts";
import { CPU_THROTTLE_RATE } from "../lib/budgets.ts";
import { motionEvidenceGaps } from "../lib/evidence.ts";
import {
  CLS_BUDGET,
  clsBudgetBasis,
  clsBudgeted,
  clsOverBudget,
  clsTotals,
  confirmedSelectEntrance,
  DROPPED_FRAME_BUDGET_PCT,
  hasUnrelatedScriptAttribution,
  loafOverBudget,
  loafTotals,
  observedClsTotals,
} from "../lib/verdicts.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit");

/** The reach chain, named in full, plus a LOUD note when part of it failed — a smoothness number for a
 *  surface the probe never arrived at is the failure mode this line exists to make impossible to miss. */
function printReachLine(reach: readonly ReachAction[], reachFailures: number): void {
  if (reach.length === 0) {
    return;
  }
  const chain = reach.map((a) => (a.kind === "click" ? `click ${a.selector}` : `${a.method} ${a.target}`)).join(" → ");
  const note = reachFailures > 0 ? `  (${reachFailures} FAILED — the numbers below describe another surface)` : "";
  print(`reached     ${chain}${note}`);
}

function printLayoutLoaf(loaf: LoafRecord): void {
  const candidate = confirmedSelectEntrance(loaf);
  const classification = candidate === undefined || hasUnrelatedScriptAttribution(loaf) ? undefined : candidate;
  print(
    classification === undefined
      ? `  ✗ LoAF @${loaf.startTime}ms  duration ${loaf.duration}ms, blocking ${loaf.blockingDuration}ms, style/layout in-frame${candidate === undefined ? "" : " (Select candidate vetoed by app/unrelated script attribution)"}`
      : `  · LoAF @${loaf.startTime}ms  duration ${loaf.duration}ms, blocking ${loaf.blockingDuration}ms, style/layout in sealed Select ${classification.firstForTrigger ? "first" : "repeat"} entrance (raw, classified)`,
  );
  for (const script of loaf.scripts) {
    print(
      `      ${script.sourceFunctionName ?? ""} via ${script.invoker ?? ""} · ${script.duration}ms script · ${script.forcedStyleAndLayoutDuration ?? 0}ms forced style/layout · ${script.sourceURL}`,
    );
  }
}

/** CLS scores are reported to 4 decimals — the CWV convention the collector's ring already uses. */
const SHIFT_REPORT_DECIMALS = 4;

/** The CLS block: the #109 spec split, the #1071 observed split, WHICH total this run's budget judged,
 *  and the attributed waves. The basis line exists because "0.0177" and "0.207" are both true of the same
 *  interaction and only one of them is the verdict — a reader must never have to infer which. */
function printCls(motion: AuditData["motion"], measuredInput: boolean): void {
  const cls = clsTotals(motion);
  const observed = observedClsTotals(motion);
  const basis = clsBudgetBasis(measuredInput);
  const budgeted = clsBudgeted(motion, measuredInput);
  print(`CLS         raw ${cls.raw} · virtualized ${cls.virtualized} (expected reconciliation) · non-virtualized ${cls.budgeted}`);
  print(
    observed === null
      ? "CLS obs     unavailable — this page bundle predates the observed split (#1071)"
      : `CLS obs     raw ${observed.raw} · virtualized ${observed.virtualized} · non-virtualized ${observed.budgeted} (every shift, input-adjacent included)`,
  );
  print(`CLS budget  judging ${budgeted ?? "NOTHING — absent evidence, see the gap below"} on the ${basis} total  ← budget ${CLS_BUDGET}`);
  for (const shift of motion?.shifts ?? []) {
    const who = shift.sources.length === 0 ? "(no source attribution)" : shift.sources.join(" · ");
    const tags = `${shift.hadRecentInput ? " input-adjacent (excluded from cls)" : ""}${shift.virtualized ? " virtualized" : ""}`;
    print(`  · shift @${shift.startTime}ms  ${shift.value.toFixed(SHIFT_REPORT_DECIMALS)}${tags} · ${who}`);
  }
}

/** The CLS machine pairs — both splits, WHICH basis this run judged, and the `measured-input` fact that
 *  selected it, so the verdict is re-derivable from the RESULT line alone. `absent` (never 0) where the
 *  served bundle predates the observed split: a zero there would read as measured stability. */
function clsPairs(motion: AuditData["motion"], measuredInput: boolean): Array<readonly [string, string | number]> {
  const cls = clsTotals(motion);
  const observed = observedClsTotals(motion);
  return [
    ["cls-raw", cls.raw],
    ["cls-virtualized", cls.virtualized],
    ["cls-non-virtualized", cls.budgeted],
    ["measured-input", measuredInput ? 1 : 0],
    ["cls-budget-basis", clsBudgetBasis(measuredInput)],
    ["cls-budgeted", clsBudgeted(motion, measuredInput) ?? "absent"],
    ["cls-observed-raw", observed === null ? "absent" : observed.raw],
    ["cls-observed-virtualized", observed === null ? "absent" : observed.virtualized],
    ["cls-observed-non-virtualized", observed === null ? "absent" : observed.budgeted],
  ];
}

/** The `anim` raises whose launch record is dirty — printed as offenders beside the active-sample ones.
 *  A raise with NO launch record is INCLUDED: it is unsanctionable, so it is a budgeted offender and the
 *  line says so rather than omitting it (an omitted offender reads as a clean window). */
function transientDirtyRaises(flags: readonly MotionFlagRecord[] | null): readonly MotionFlagRecord[] {
  return (flags ?? []).filter((flag) => flag.tag === "anim" && flag.animation?.compositorClean !== true);
}

/** `owner/mechanism`, or the honest token for a record that never carried attribution. */
function attributionText(animation: AnimationRecord | undefined): string {
  if (animation === undefined) {
    return "unattributed/unrecorded";
  }
  return `${animation.attribution?.owner ?? "unattributed"}/${animation.attribution?.mechanism ?? "legacy"}`;
}

/** The animation block: the population line, then BOTH offender lists (#1070). The two are labeled
 *  differently on purpose — "active" is what the end-of-window sample still saw, "transient" is what
 *  fired and finished inside the window — because the remedy differs: a still-running dirty animation is
 *  usually a loop, a transient one is a click's own response. */
function printAnimations(data: AuditData): void {
  const totals = animationTotals(data.animations, data.flags);
  print(
    `animations  ${data.animations.length} active · ${totals.rawDirty} NOT compositor-clean raw · ${totals.transientDirty} transient dirty (started in-window) · ${totals.sanctionedLibrary} Base UI height lifecycle · ${totals.budgetedDirty} budgeted dirty`,
  );
  for (const a of data.animations.filter((animation) => !animation.compositorClean)) {
    print(
      isSanctionedLibraryAnimation(a)
        ? `  · ${a.target}  animates [${a.properties.join(", ")}] — ${attributionText(a)} (raw, classified owner-accepted height lifecycle)`
        : `  ✗ ${a.target}  animates [${a.properties.join(", ")}] — ${attributionText(a)} non-compositor prop (jank risk)`,
    );
  }
  for (const flag of transientDirtyRaises(data.flags)) {
    const animation = flag.animation;
    const properties = animation === undefined ? "(no launch record — cannot be sanctioned)" : `[${animation.properties.join(", ")}]`;
    print(
      animation !== undefined && isSanctionedLibraryAnimation(animation)
        ? `  · ${flag.offender}  transient @${flag.at}ms animates ${properties} — ${attributionText(animation)} (raw, classified owner-accepted height lifecycle)`
        : `  ✗ ${flag.offender}  transient @${flag.at}ms animates ${properties} — ${attributionText(animation)} non-compositor prop (jank risk, finished before the window sample)`,
    );
  }
}

/** A percentage over an EMPTY population does not exist — printing `0%` there is the exact lie #409
 *  removed. `n/a` in the human report, and the RESULT line carries the same token. */
function pct(value: number | null): string {
  return value === null ? "n/a" : `${value}%`;
}

function viewportText(viewport: { readonly width: number; readonly height: number } | null): string {
  return viewport === null ? "unavailable" : `${viewport.width}x${viewport.height}`;
}

function mobileText(value: boolean | null): string {
  if (value === null) {
    return "unmatched";
  }
  return value ? "yes" : "no";
}

function mobileValue(value: boolean | null): string | number {
  if (value === null) {
    return "unmatched";
  }
  return value ? 1 : 0;
}

function printEnvironment(environment: BrowserEnvironmentEvidence): void {
  print(`requested   device ${environment.requested.device ?? "desktop"} · viewport ${viewportText(environment.requested.viewport)}`);
  print(
    `applied     device ${environment.applied.device ?? "desktop"} · viewport ${viewportText(environment.applied.viewport)} · screen ${viewportText(environment.applied.screen)} · DPR ${environment.applied.deviceScaleFactor} · touch ${environment.applied.hasTouch ? "yes" : "no"} · mobile ${environment.applied.isMobile ? "yes" : "no"}`,
  );
  print(
    `actual      device ${environment.actual.device} · viewport ${viewportText(environment.actual.viewport)} · inner ${viewportText(environment.actual.innerViewport)} · screen ${viewportText(environment.actual.screen)} · pointer ${environment.actual.pointer} · hover ${environment.actual.hover} · touch ${environment.actual.maxTouchPoints} · DPR ${environment.actual.deviceScaleFactor} · mobile ${mobileText(environment.actual.isMobile)}`,
  );
  print(`user-agent  ${environment.actual.userAgent}`);
}

function environmentPairs(environment: BrowserEnvironmentEvidence): Array<readonly [string, string | number]> {
  return [
    ["device-requested", environment.requested.device ?? "desktop"],
    ["device-applied", environment.applied.device ?? "desktop"],
    ["device-actual", environment.actual.device],
    ["viewport-requested", viewportText(environment.requested.viewport)],
    ["viewport-actual", viewportText(environment.actual.viewport)],
    ["screen-actual", viewportText(environment.actual.screen)],
    ["pointer-actual", environment.actual.pointer],
    ["hover-actual", environment.actual.hover],
    ["touch-points-actual", environment.actual.maxTouchPoints],
    ["dpr-actual", environment.actual.deviceScaleFactor],
    ["mobile-applied", environment.applied.isMobile ? 1 : 0],
    ["mobile-actual", mobileValue(environment.actual.isMobile)],
    ["environment-mismatches", environment.mismatches.length],
  ];
}

/** The PASS/FAIL arm — every budget the audit gates on. Speaks only about evidence the caller has
 *  already proven PRESENT; the absent-evidence arm is `verdictFor` below. */
function budgetsPass(data: AuditData, dirtyAnimations: number): boolean {
  const { motion, frames, pageErrors, stepFailed, reachFailures } = data;
  // A budgeted population that is empty because the exemption consumed every RAW frame is honestly
  // clean — the raw evidence exists. An empty RAW population is not, and the evidence gaps own it.
  const framesOverBudget = frames.budgeted.pct !== null && frames.budgeted.pct > DROPPED_FRAME_BUDGET_PCT;
  const budgetFails = loafOverBudget(motion) || clsOverBudget(motion, data.measuredInput) || dirtyAnimations > 0 || framesOverBudget;
  return !(budgetFails || stepFailed || reachFailures > 0 || pageErrors.length > 0);
}

export interface MotionAuditEvaluation {
  readonly gaps: readonly EvidenceGap[];
  /** Raw non-compositor-clean population in the END-OF-WINDOW sample, preserved for compatibility and
   *  denominator honesty. */
  readonly dirtyAnimations: number;
  /** Non-compositor-clean TRANSIENT raises — the 130–360ms band the sample above cannot see (#1070). */
  readonly transientDirtyAnimations: number;
  readonly sanctionedLibraryAnimations: number;
  readonly budgetedDirtyAnimations: number;
  readonly budgetsPass: boolean;
}

/** Pure verdict input shared with the matrix-only STATIC-EXPECTED arm. The ordinary report remains the
 * only printer; this surface lets the exception prove that the frame population is its sole gap. */
export function evaluateMotionAudit(data: AuditData, windowMs: number): MotionAuditEvaluation {
  const animations = animationTotals(data.animations, data.flags);
  return {
    gaps: [...motionEvidenceGaps(data, windowMs), ...animations.gaps],
    dirtyAnimations: animations.rawDirty,
    transientDirtyAnimations: animations.transientDirty,
    sanctionedLibraryAnimations: animations.sanctionedLibrary,
    budgetedDirtyAnimations: animations.budgetedDirty,
    budgetsPass: budgetsPass(data, animations.budgetedDirty),
  };
}

/** Absent evidence OUTRANKS both budget arms: a budget can neither pass nor fail on a number nothing
 *  observed, so the run is reported as no verdict at all (EXIT.toolError — "the run is NOT a verdict"). */
function verdictFor(gaps: readonly EvidenceGap[], pass: boolean): { label: string; exit: number } {
  if (gaps.length > 0) {
    return { label: INSTRUMENT_ERROR_VERDICT, exit: EXIT.toolError };
  }
  return pass ? { label: "PASS", exit: EXIT.clean } : { label: "FAIL", exit: EXIT.violations };
}

/** Print the human report + the RESULT line, return the exit code. */
export function report(url: string, opts: Args, data: AuditData): number {
  const { environment, motion, animations, frames, pageErrors, stepFailed, reachFailures } = data;
  const loaf = loafTotals(motion);
  const layoutInFrame = (motion === null ? [] : motion.loafs).filter((l) => l.styleAndLayoutStart > 0);
  const dirtyAnimations = animations.filter((a) => !a.compositorClean);
  const animationPopulation = animationTotals(animations, data.flags);

  print(`URL         ${url}`);
  printReachLine(opts.reach, reachFailures);
  print(`window      ${opts.windowMs}ms · cpu-throttle ${opts.throttle ? `${CPU_THROTTLE_RATE}×` : "off"}`);
  print(`headless    ${opts.vnc ? "no (headful — dropped-frame % trustworthy)" : "yes (dropped-frame % ADVISORY — no real vsync)"}`);
  printEnvironment(environment);
  print(
    `LoAF        ${motion?.loafs.length ?? 0} in ring · raw worst blocking ${loaf.rawWorstBlocking}ms · ${loaf.classifiedInitializations} first Select entrance · budgeted worst ${loaf.budgetedWorstBlocking}ms · ${loaf.budgetedStyleLayout} budgeted style/layout`,
  );
  printCls(motion, data.measuredInput);
  print(
    `frames      raw ${frames.raw.dropped}/${frames.raw.total} dropped (${pct(frames.raw.pct)}) · Select entrance ${frames.classified.dropped}/${frames.classified.total} classified · budgeted ${frames.budgeted.dropped}/${frames.budgeted.total} (${pct(frames.budgeted.pct)})`,
  );
  printAnimations(data);
  for (const l of layoutInFrame) {
    printLayoutLoaf(l);
  }
  if (pageErrors.length > 0) {
    print("");
    print("--- page errors ---");
    for (const e of pageErrors) {
      print(e);
    }
  }

  const evaluation = evaluateMotionAudit(data, opts.windowMs);
  printEvidenceGaps(evaluation.gaps);
  const verdict = verdictFor(evaluation.gaps, evaluation.budgetsPass);

  return printVerdict("motion-audit", {
    verdict: verdict.exit,
    denominators: {
      "raw-frames": { value: frames.raw.total, refuseWhen: "zero" },
      "budgeted-frames": {
        value: frames.budgeted.total,
        refuseWhen: "zero",
        ...(frames.budgeted.total === 0 ? { honestEmpty: "all raw frames were classified as sanctioned initialization" } : {}),
      },
    },
    pairs: [
      ["verdict", verdict.label],
      ["reach-actions", opts.reach.length],
      ["reach-failed", reachFailures],
      ["window-ms", opts.windowMs],
      ["motion-subjects", animations.length],
      ...environmentPairs(environment),
      // The measured interaction never happened — invisible in the machine line before #409, so a FAIL
      // over all-zero budgets was unattributable.
      ["step-failed", stepFailed ? 1 : 0],
      ["dropped-frames-raw", pct(frames.raw.pct)],
      ["dropped-frames-classified", frames.classified.dropped],
      ["dropped-frames", pct(frames.budgeted.pct)],
      ["worst-blocking-raw", `${loaf.rawWorstBlocking}ms`],
      ["first-select-entrances", loaf.classifiedInitializations],
      ["worst-blocking-budgeted", `${loaf.budgetedWorstBlocking}ms`],
      ...clsPairs(motion, data.measuredInput),
      ["loaf-style-in-frame-raw", layoutInFrame.length],
      ["loaf-style-in-frame-budgeted", loaf.budgetedStyleLayout],
      ["dirty-animations", dirtyAnimations.length],
      ["transient-dirty-animations", animationPopulation.transientDirty],
      ["anim-flags", data.flags === null ? "absent" : data.flags.filter((flag) => flag.tag === "anim").length],
      ["library-height-animations", animationPopulation.sanctionedLibrary],
      ["dirty-animations-budgeted", animationPopulation.budgetedDirty],
      ["page-errors", pageErrors.length],
    ],
  });
}
