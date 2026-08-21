// The human report + the RESULT line + the exit verdict — raw/classified/budgeted, all labeled.
import { print, printResult } from "@orb/tooling/_shared/artifacts";
import type { Args, AuditData, LoafRecord, ReachAction } from "../contract/types.ts";
import { CPU_THROTTLE_RATE } from "../lib/budgets.ts";
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
    `frames      raw ${frames.raw.dropped}/${frames.raw.total} dropped (${frames.raw.pct}%) · Select entrance ${frames.classified.dropped}/${frames.classified.total} classified · budgeted ${frames.budgeted.dropped}/${frames.budgeted.total} (${frames.budgeted.pct}%)`,
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

  const budgetFails = loafOverBudget(motion) || clsOverBudget(motion) || dirtyAnimations.length > 0 || frames.budgeted.pct > DROPPED_FRAME_BUDGET_PCT;
  const pass = !(budgetFails || stepFailed || reachFailures > 0 || pageErrors.length > 0);

  printResult("motion-audit", [
    ["verdict", pass ? "PASS" : "FAIL"],
    ["reach-actions", opts.reach.length],
    ["reach-failed", reachFailures],
    ["dropped-frames-raw", `${frames.raw.pct}%`],
    ["dropped-frames-classified", frames.classified.dropped],
    ["dropped-frames", `${frames.budgeted.pct}%`],
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
  ]);
  return pass ? 0 : 1;
}
