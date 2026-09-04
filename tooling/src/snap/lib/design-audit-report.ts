// THE DESIGN-AUDIT ARM'S TRANSCRIPT: the printed blocks and the RESULT pairs, derived from ONE
// measurement object (ops/design-audit-walk.ts) so a number can never disagree with the table above it.
//
// THE PRINTERS ARE UI-AUDIT'S OWN, IMPORTED, NOT REWRITTEN (#1315). `printCensusReach`,
// `printObscuredScan`, `printSurfaceState`, `printPopulationAccounting`, `printBackdropRefusals` and
// `printFindingsTable` move here UNCHANGED through the sibling's front door — which is what keeps the
// byte-stability receipt this fold owes (1208 §10.3) provable: the same walk, the same rule engine, the
// same block text, a different envelope around them.
//
// THE PAIR NAMES ARE ALSO UNCHANGED, and that is deliberate rather than nostalgic: a dozen review
// receipts, three docs and the rewritten cli suite all grep `census=`, `population-verdict=`,
// `reached=`, `tap-judged=`, `no-verdict=`. A rename here would be a silent break of every one of them
// while the numbers stayed correct.
import type { ResultPair } from "../../_shared/artifacts.ts";
import { print } from "../../_shared/artifacts.ts";
import { actualDeviceLabel } from "../../_shared/browser-environment.ts";
import type { VerdictDenominator } from "../../_shared/evidence.ts";
import { printEvidenceGaps } from "../../_shared/evidence.ts";
import {
  backdropRefusalSummary,
  populationWithheldSummary,
  printBackdropRefusals,
  printCensusReach,
  printFindingsTable,
  printObscuredScan,
  printPopulationAccounting,
  printSurfaceState,
  reachRows,
  surfaceStateRows,
  WITHHELD_REASONS,
} from "../../ui-audit/index.ts";
import type { DesignAuditMeasurement, SelectorProof } from "../ops/design-audit-walk.ts";

/** The `-1` absent sentinel every ui-audit RESULT row already uses: a refusal to state, never a zero
 *  that reads as "nothing was there". */
const ABSENT = -1;

/** `#1326`'s row. Printed only when something is NOT locatable — a clean sweep is already implied by the
 *  findings table, and a line per run saying "all 2 selectors resolve" is noise a reader learns to skip. */
export function printSelectorProof(proofs: readonly SelectorProof[]): void {
  const ambiguous = proofs.filter((proof) => proof.matches !== 1);
  if (ambiguous.length === 0) {
    return;
  }
  print(
    `SELECTOR     ${String(ambiguous.length)} of ${String(proofs.length)} emitted finding selector(s) do NOT resolve to exactly one element — those rows name a defect a reader cannot reopen`,
  );
  for (const proof of ambiguous) {
    print(`             ${proof.selector} → ${proof.matches === ABSENT ? "unparseable" : `${String(proof.matches)} matches`}`);
  }
  print("");
}

/** Everything the arm prints, in the order `runUiAudit` printed it. A terminal refusal prints its gap and
 *  nothing else: past that point every table below is a fold over samples that describe nothing (#1081). */
export function printDesignAudit(measurement: DesignAuditMeasurement, artifact: string | null): void {
  print(`URL          ${measurement.url}`);
  if (artifact !== null) {
    print(`report       ${artifact}`);
  }
  if (measurement.terminalGap !== null) {
    printEvidenceGaps([measurement.terminalGap]);
    return;
  }
  print("");
  printCensusReach(measurement.reach);
  printObscuredScan(measurement.samples?.obscuredScan);
  if (measurement.surfaceState !== null) {
    printSurfaceState(measurement.shellState, measurement.surfaceState, measurement.drive);
  }
  printPopulationAccounting(measurement.populationAccounting);
  if (measurement.gaps.length > 0) {
    printEvidenceGaps(measurement.gaps);
    print("");
  }
  printBackdropRefusals(measurement.backdropRefusals);
  for (const failure of measurement.hover?.forceFailures ?? []) {
    print(`HOVER REFUSED ${failure}`);
  }
  printSelectorProof(measurement.selectorProof);
  printFindingsTable(measurement.findings, measurement.gaps.length === 0);
}

/** The populations a clean design-audit verdict rests on. `census` is the node denominator every "no
 *  findings" claim needs (#409); the per-family `scanned-*` rows prove each detector family actually
 *  dispatched rather than folding an empty list into silence. */
export function designAuditDenominators(measurement: DesignAuditMeasurement | null): Readonly<Record<string, VerdictDenominator>> {
  if (measurement === null || measurement.familyScans === null) {
    return {};
  }
  return {
    census: { value: measurement.census, refuseWhen: "zero" },
    ...Object.fromEntries(Object.entries(measurement.familyScans).map(([family, value]) => [`scanned-${family}`, { value, refuseWhen: "zero" as const }])),
  };
}

function severityPairs(measurement: DesignAuditMeasurement, failOn: string): readonly ResultPair[] {
  return [
    ["findings", measurement.findings.length],
    ["population-verdict", measurement.populationComplete ? "complete" : "NO-VERDICT"],
    ["population-withheld", populationWithheldSummary(measurement.populationAccounting)],
    ["no-verdict-reasons", backdropRefusalSummary(measurement.backdropRefusals)],
    ["p0", measurement.counts.P0],
    ["p1", measurement.counts.P1],
    ["p2", measurement.counts.P2],
    ["p3", measurement.counts.P3],
    ["fail-on", failOn],
  ];
}

function environmentPairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const environment = measurement.environment;
  if (environment === null) {
    return [];
  }
  return [
    ["device-request", environment.requested.device ?? "desktop"],
    ["device-actual", actualDeviceLabel(environment.actual.device)],
    ["viewport-actual", `${String(environment.actual.innerViewport.width)}x${String(environment.actual.innerViewport.height)}`],
    ["pointer", environment.actual.pointer],
    ["hover", environment.actual.hover],
    ["touch", environment.actual.hasTouch ? "yes" : "no"],
  ];
}

function domPairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const population = measurement.population;
  return [
    ["census", measurement.census],
    ["dom-walk", population?.duringWalk ?? ABSENT],
    ["dom-settled", population === null ? ABSENT : `${String(population.settled)}${population.stabilized ? "" : "+"}`],
    ["dom-walked", population?.accounting.walked ?? ABSENT],
    ["dom-rendered", population?.accounting.renderedSubjects ?? ABSENT],
    ["dom-retained-hidden", population?.accounting.retainedHiddenSubjects ?? ABSENT],
    ["dom-skip-head", population?.accounting.skipped.documentHead ?? ABSENT],
    ["dom-skip-dev", population?.accounting.skipped.devChrome ?? ABSENT],
    ["dom-inaccessible", population?.accounting.inaccessible ?? ABSENT],
    ["dom-added", population?.accounting.added ?? ABSENT],
    ["dom-detached", population?.accounting.detached ?? ABSENT],
    ["dom-mutations", population?.accounting.walkMutations ?? ABSENT],
    ["dom-settle-mutations", population?.accounting.settleMutations ?? ABSENT],
  ];
}

function tapPairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const row = measurement.populationAccounting["tap-target"];
  return [
    ["tap-candidates", row?.candidates ?? ABSENT],
    ["tap-judged", row?.judged ?? ABSENT],
    ["tap-affected", row?.affected ?? ABSENT],
    ["tap-populations", row?.populations ?? ABSENT],
    ["tap-representatives", row?.emitted ?? ABSENT],
    ["tap-collapsed-same-owner", row?.collapsed["sameOwner"] ?? ABSENT],
    ["tap-withheld-cap", row?.withheld[WITHHELD_REASONS.representativeCap] ?? ABSENT],
  ];
}

function hoverPairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const scan = measurement.samples?.hoverScan;
  return [
    ["hover-pass", measurement.hover?.label ?? "absent"],
    ["hover-candidates", scan?.census.candidates ?? ABSENT],
    ["hover-rules", scan?.hoverRules ?? ABSENT],
    ["hover-judged", scan?.census.judged ?? ABSENT],
    ["hover-subjects-forced", scan?.subjectsForced ?? ABSENT],
    ["hover-not-restored", scan?.notRestored ?? ABSENT],
    ["hover-sheets-unreadable", scan?.sheetsUnreadable ?? ABSENT],
    ["hover-selectors-unparseable", scan?.unparseableSelectors ?? ABSENT],
    ["hover-ms", measurement.hover?.wallMs ?? ABSENT],
  ];
}

function themePairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const theme = measurement.themeEvidence;
  return [
    ["theme-request", theme.request ?? "account"],
    ["theme-id", theme.resolution?.id ?? (theme.request === null ? "account" : "none")],
    ["theme-source", theme.resolution?.source ?? (theme.request === null ? "account" : "unresolved")],
    ["theme-root", measurement.samples?.themeRender.rootDataTheme ?? "default"],
    ["theme-light", measurement.samples?.themeRender.subjectPolarities.light ?? ABSENT],
    ["theme-dark", measurement.samples?.themeRender.subjectPolarities.dark ?? ABSENT],
    ["theme-polarity-unknown", measurement.samples?.themeRender.subjectPolarities.unknown ?? ABSENT],
  ];
}

/** `design-audit=off` when the argv never asked, `REFUSED` when the run is not a verdict — never a bare
 *  absence a reader has to guess about (contract/arms.ts's ALWAYS rule for arm pairs). */
export function designAuditPairs(enabled: boolean, measurement: DesignAuditMeasurement | null, failOn: string): readonly ResultPair[] {
  if (!enabled) {
    return [["design-audit", "off"]];
  }
  if (measurement === null) {
    return [["design-audit", "REFUSED"]];
  }
  if (measurement.terminalGap !== null) {
    return [
      ["design-audit", "NO-VERDICT"],
      ["design-audit-refusal", measurement.terminalGap.evidence.replace(/\s+/gu, "-")],
      ["fail-on", failOn],
    ];
  }
  const ambiguous = measurement.selectorProof.filter((proof) => proof.matches !== 1).length;
  return [
    ["design-audit", measurement.gaps.length > 0 ? "NO-VERDICT" : "measured"],
    ...severityPairs(measurement, failOn),
    ["actions", measurement.actionsFailed >= 0 ? measurement.actionsFailed : ABSENT],
    ...environmentPairs(measurement),
    ...(measurement.surfaceState === null ? [] : surfaceStateRows(measurement.shellState, measurement.surfaceState, measurement.drive)),
    ...tapPairs(measurement),
    ...domPairs(measurement),
    ...themePairs(measurement),
    ...reachRows(measurement.reach),
    ["obscured-scanned", measurement.samples?.obscuredScan?.candidates ?? ABSENT],
    ["obscured-recentred", measurement.samples?.obscuredScan?.recentred ?? ABSENT],
    ["obscured-unaskable", measurement.samples?.obscuredScan?.unaskable ?? ABSENT],
    ...hoverPairs(measurement),
    ["px-backdrops", measurement.pixelSampled],
    ["no-verdict", measurement.backdropRefusals.length],
    ["selectors-proven", measurement.selectorProof.length],
    ["selectors-ambiguous", ambiguous],
  ];
}
