// The human report + the RESULT line + the exit verdict — raw/classified/budgeted, all labeled.
import { print } from "@orb/tooling/_shared/artifacts";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { INSTRUMENT_ERROR_VERDICT, printEvidenceGaps, printVerdict } from "@orb/tooling/_shared/evidence";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, AuditData, LoafRecord, ReachAction } from "../contract/types.ts";
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
  const { motion, animations, frames, pageErrors, stepFailed, reachFailures } = data;
  const loaf = loafTotals(motion);
  const cls = clsTotals(motion);
  const layoutInFrame = (motion === null ? [] : motion.loafs).filter((l) => l.styleAndLayoutStart > 0);
  const dirtyAnimations = animations.filter((a) => !a.compositorClean);

  print(`URL         ${url}`);
  printReachLine(opts.reach, reachFailures);
  print(`window      ${opts.windowMs}ms · cpu-throttle ${opts.throttle ? `${CPU_THROTTLE_RATE}×` : "off"}`);
  print(`headless    ${opts.vnc ? "no (headful — dropped-frame % trustworthy)" : "yes (dropped-frame % ADVISORY — no real vsync)"}`);
  print(
    `LoAF        ${motion?.loafs.length ?? 0} in ring · raw worst blocking ${loaf.rawWorstBlocking}ms · ${loaf.classifiedInitializations} first Select entrance · budgeted worst ${loaf.budgetedWorstBlocking}ms · ${loaf.budgetedStyleLayout} budgeted style/layout`,
  );
  // All three, labeled: the raw CWV total, the virtual-row share, and the BUDGETED remainder (#109).
  print(`CLS         raw ${cls.raw} · virtualized ${cls.virtualized} (expected reconciliation) · non-virtualized ${cls.budgeted}  ← budget ${CLS_BUDGET}`);
  print(
    `frames      raw ${frames.raw.dropped}/${frames.raw.total} dropped (${pct(frames.raw.pct)}) · Select entrance ${frames.classified.dropped}/${frames.classified.total} classified · budgeted ${frames.budgeted.dropped}/${frames.budgeted.total} (${pct(frames.budgeted.pct)})`,
  );
  print(`animations  ${animations.length} active · ${dirtyAnimations.length} NOT compositor-clean`);
  for (const a of dirtyAnimations) {
    print(`  ✗ ${a.target}  animates [${a.properties.join(", ")}] — non-compositor prop (jank risk)`);
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

  const gaps = motionEvidenceGaps(data, opts.windowMs);
  printEvidenceGaps(gaps);
  const verdict = verdictFor(gaps, budgetsPass(data, dirtyAnimations.length));

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
      ["page-errors", pageErrors.length],
    ],
  });
}
