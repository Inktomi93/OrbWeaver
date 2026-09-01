// The human report + the RESULT line + the exit verdict — raw/classified/budgeted, all labeled.
import { print } from "@orb/tooling/_shared/artifacts";
import type { BrowserEnvironmentEvidence } from "@orb/tooling/_shared/browser-environment";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { INSTRUMENT_ERROR_VERDICT, printEvidenceGaps, printVerdict } from "@orb/tooling/_shared/evidence";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, AuditData, LoafRecord, ReachAction } from "../contract/types.ts";
import { animationTotals, isSanctionedLibraryAnimation } from "../lib/animations.ts";
import { CPU_THROTTLE_RATE } from "../lib/budgets.ts";
import { motionEvidenceGaps } from "../lib/evidence.ts";
import {
  CLS_BUDGET,
  clsOverBudget,
  clsTotals,
  confirmedSelectEntrance,
  DROPPED_FRAME_BUDGET_PCT,
  hasUnrelatedScriptAttribution,
  loafOverBudget,
  loafTotals,
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
  const budgetFails = loafOverBudget(motion) || clsOverBudget(motion) || dirtyAnimations > 0 || framesOverBudget;
  return !(budgetFails || stepFailed || reachFailures > 0 || pageErrors.length > 0);
}

export interface MotionAuditEvaluation {
  readonly gaps: readonly EvidenceGap[];
  /** Raw non-compositor-clean population, preserved for compatibility and denominator honesty. */
  readonly dirtyAnimations: number;
  readonly sanctionedLibraryAnimations: number;
  readonly budgetedDirtyAnimations: number;
  readonly budgetsPass: boolean;
}

/** Pure verdict input shared with the matrix-only STATIC-EXPECTED arm. The ordinary report remains the
 * only printer; this surface lets the exception prove that the frame population is its sole gap. */
export function evaluateMotionAudit(data: AuditData, windowMs: number): MotionAuditEvaluation {
  const animations = animationTotals(data.animations);
  return {
    gaps: [...motionEvidenceGaps(data, windowMs), ...animations.gaps],
    dirtyAnimations: animations.rawDirty,
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
  const cls = clsTotals(motion);
  const layoutInFrame = (motion === null ? [] : motion.loafs).filter((l) => l.styleAndLayoutStart > 0);
  const dirtyAnimations = animations.filter((a) => !a.compositorClean);
  const animationPopulation = animationTotals(animations);

  print(`URL         ${url}`);
  printReachLine(opts.reach, reachFailures);
  print(`window      ${opts.windowMs}ms · cpu-throttle ${opts.throttle ? `${CPU_THROTTLE_RATE}×` : "off"}`);
  print(`headless    ${opts.vnc ? "no (headful — dropped-frame % trustworthy)" : "yes (dropped-frame % ADVISORY — no real vsync)"}`);
  printEnvironment(environment);
  print(
    `LoAF        ${motion?.loafs.length ?? 0} in ring · raw worst blocking ${loaf.rawWorstBlocking}ms · ${loaf.classifiedInitializations} first Select entrance · budgeted worst ${loaf.budgetedWorstBlocking}ms · ${loaf.budgetedStyleLayout} budgeted style/layout`,
  );
  // All three, labeled: the raw CWV total, the virtual-row share, and the BUDGETED remainder (#109).
  print(`CLS         raw ${cls.raw} · virtualized ${cls.virtualized} (expected reconciliation) · non-virtualized ${cls.budgeted}  ← budget ${CLS_BUDGET}`);
  print(
    `frames      raw ${frames.raw.dropped}/${frames.raw.total} dropped (${pct(frames.raw.pct)}) · Select entrance ${frames.classified.dropped}/${frames.classified.total} classified · budgeted ${frames.budgeted.dropped}/${frames.budgeted.total} (${pct(frames.budgeted.pct)})`,
  );
  print(
    `animations  ${animations.length} active · ${animationPopulation.rawDirty} NOT compositor-clean raw · ${animationPopulation.sanctionedLibrary} Base UI height lifecycle · ${animationPopulation.budgetedDirty} budgeted dirty`,
  );
  for (const a of dirtyAnimations) {
    const attribution = `${a.attribution?.owner ?? "unattributed"}/${a.attribution?.mechanism ?? "legacy"}`;
    print(
      isSanctionedLibraryAnimation(a)
        ? `  · ${a.target}  animates [${a.properties.join(", ")}] — ${attribution} (raw, classified owner-accepted height lifecycle)`
        : `  ✗ ${a.target}  animates [${a.properties.join(", ")}] — ${attribution} non-compositor prop (jank risk)`,
    );
  }
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
      ["cls-raw", cls.raw],
      ["cls-virtualized", cls.virtualized],
      ["cls-non-virtualized", cls.budgeted],
      ["loaf-style-in-frame-raw", layoutInFrame.length],
      ["loaf-style-in-frame-budgeted", loaf.budgetedStyleLayout],
      ["dirty-animations", dirtyAnimations.length],
      ["library-height-animations", animationPopulation.sanctionedLibrary],
      ["dirty-animations-budgeted", animationPopulation.budgetedDirty],
      ["page-errors", pageErrors.length],
    ],
  });
}
