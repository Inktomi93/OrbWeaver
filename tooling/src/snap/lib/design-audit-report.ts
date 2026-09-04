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
import { DESIGN_AUDIT_SELECTOR_PROOF_CAP } from "./budgets.ts";

/** The `-1` absent sentinel every ui-audit RESULT row already uses: a refusal to state, never a zero
 *  that reads as "nothing was there". */
const ABSENT = -1;

/** `#1326`'s row. Printed only when something is NOT locatable — a clean sweep is already implied by the
 *  findings table, and a line per run saying "all 2 selectors resolve" is noise a reader learns to skip.
 *  #1538: an UNPROVEN remainder (the proof cap truncated the list) is the same class of not-locatable and
 *  prints on its own line, because "we did not ask" must never be readable as "we asked and it was fine". */
function printSelectorProof(proofs: readonly SelectorProof[], unproven: number): void {
  if (unproven > 0) {
    print(
      `SELECTOR     ${String(unproven)} emitted finding selector(s) were NOT proven — the ${String(DESIGN_AUDIT_SELECTOR_PROOF_CAP)}-selector proof cap truncated the list, so those rows are unverified, not unique`,
    );
  }
  const ambiguous = proofs.filter((proof) => proof.matches !== 1);
  if (ambiguous.length === 0) {
    if (unproven > 0) {
      print("");
    }
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
  printSelectorProof(measurement.selectorProof, measurement.selectorsUnproven);
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
    ["population-verdict", measurement.verdicts.population === null ? "complete" : "NO-VERDICT"],
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

/** THE `-1` BRANCH IS SPELLED, NOT COALESCED. `population === null` is one fact about the whole run (the
 *  walk never produced an identity snapshot), so it is decided ONCE and every row states the absent
 *  sentinel — rather than thirteen optional chains each re-asking a question the first line answered. */
function absentDomPairs(census: number): readonly ResultPair[] {
  const keys = [
    "dom-walk",
    "dom-settled",
    "dom-walked",
    "dom-rendered",
    "dom-retained-hidden",
    "dom-skip-head",
    "dom-skip-dev",
    "dom-inaccessible",
    "dom-added",
    "dom-detached",
    "dom-mutations",
    "dom-settle-mutations",
  ] as const;
  return [["census", census], ...keys.map((key): ResultPair => [key, ABSENT])];
}

function domPairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const population = measurement.population;
  if (population === null) {
    return absentDomPairs(measurement.census);
  }
  const accounting = population.accounting;
  return [
    ["census", measurement.census],
    ["dom-walk", population.duringWalk],
    ["dom-settled", `${String(population.settled)}${population.stabilized ? "" : "+"}`],
    ["dom-walked", accounting.walked],
    ["dom-rendered", accounting.renderedSubjects],
    ["dom-retained-hidden", accounting.retainedHiddenSubjects],
    ["dom-skip-head", accounting.skipped.documentHead],
    ["dom-skip-dev", accounting.skipped.devChrome],
    ["dom-inaccessible", accounting.inaccessible],
    ["dom-added", accounting.added],
    ["dom-detached", accounting.detached],
    ["dom-mutations", accounting.walkMutations],
    ["dom-settle-mutations", accounting.settleMutations],
  ];
}

function tapPairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const row = measurement.populationAccounting["tap-target"];
  if (row === undefined) {
    return (
      ["tap-candidates", "tap-judged", "tap-affected", "tap-populations", "tap-representatives", "tap-collapsed-same-owner", "tap-withheld-cap"] as const
    ).map((key): ResultPair => [key, ABSENT]);
  }
  return [
    ["tap-candidates", row.candidates],
    ["tap-judged", row.judged],
    ["tap-affected", row.affected],
    ["tap-populations", row.populations],
    ["tap-representatives", row.emitted],
    ["tap-collapsed-same-owner", row.collapsed["sameOwner"] ?? ABSENT],
    ["tap-withheld-cap", row.withheld[WITHHELD_REASONS.representativeCap] ?? ABSENT],
  ];
}

function hoverPairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const scan = measurement.samples === null ? undefined : measurement.samples.hoverScan;
  const hover = measurement.hover;
  const pass: readonly ResultPair[] = hover === null ? [["hover-pass", "absent"]] : [["hover-pass", hover.label]];
  const wall: readonly ResultPair[] = hover === null ? [["hover-ms", ABSENT]] : [["hover-ms", hover.wallMs]];
  if (scan === undefined) {
    return [
      ...pass,
      ["hover-candidates", ABSENT],
      ["hover-rules", ABSENT],
      ["hover-judged", ABSENT],
      ["hover-subjects-forced", ABSENT],
      ["hover-not-restored", ABSENT],
      ["hover-sheets-unreadable", ABSENT],
      ["hover-selectors-unparseable", ABSENT],
      ...wall,
    ];
  }
  return [
    ...pass,
    ["hover-candidates", scan.census.candidates],
    ["hover-rules", scan.hoverRules],
    ["hover-judged", scan.census.judged],
    ["hover-subjects-forced", scan.subjectsForced],
    ["hover-not-restored", scan.notRestored],
    ["hover-sheets-unreadable", scan.sheetsUnreadable],
    ["hover-selectors-unparseable", scan.unparseableSelectors],
    ...wall,
  ];
}

function themePairs(measurement: DesignAuditMeasurement): readonly ResultPair[] {
  const theme = measurement.themeEvidence;
  const render = measurement.samples === null ? null : measurement.samples.themeRender;
  const requested: readonly ResultPair[] = [
    ["theme-request", theme.request ?? "account"],
    ["theme-id", theme.resolution?.id ?? (theme.request === null ? "account" : "none")],
    ["theme-source", theme.resolution?.source ?? (theme.request === null ? "account" : "unresolved")],
  ];
  if (render === null) {
    return [...requested, ["theme-root", "default"], ["theme-light", ABSENT], ["theme-dark", ABSENT], ["theme-polarity-unknown", ABSENT]];
  }
  return [
    ...requested,
    ["theme-root", render.rootDataTheme ?? "default"],
    ["theme-light", render.subjectPolarities.light],
    ["theme-dark", render.subjectPolarities.dark],
    ["theme-polarity-unknown", render.subjectPolarities.unknown],
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
    // #1538: ALWAYS printed, including the 0 — the pair exists so a truncated proof list cannot look
    // like a clean one, and a pair that only appears when non-zero is unreadable as an absence.
    ["selectors-unproven", measurement.selectorsUnproven],
  ];
}
