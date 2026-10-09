// Display-only correlation over evidence Snap already captured. Producers own thresholds and exit votes;
// this module groups their immutable rows for the end card and browser-free reader.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DiskSafeBrowserDiagnostic } from "../contract/browser-evidence-redaction.ts";
import type { SnapCompositeFinding, SnapFindingEvidenceRef, SnapRunIndex } from "../contract/run-index.ts";
import { analyzerFindingDrafts, lighthouseFindingDrafts, reactFindingDrafts } from "./run-finding-analyzers.ts";
import { coreFindingDrafts, harFindingDrafts } from "./run-finding-browser.ts";
import type { FindingDraft } from "./run-finding-common.ts";
import { findingIdentity, findingRef } from "./run-finding-common.ts";
import { diagnosticFindingDrafts } from "./run-finding-console-annotation.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

export interface SnapFindingInput {
  readonly indexPath: string;
  readonly verdict: SnapRunIndex["verdict"];
  readonly artifacts: SnapRunIndex["artifacts"];
  readonly diagnosticsState: SnapRunIndex["diagnostics"]["state"];
  readonly diagnostics: readonly DiskSafeBrowserDiagnostic[];
}

const SEVERITY_RANK = { error: 0, warning: 1, annotation: 2 } as const;

function groupKey(row: FindingDraft): string {
  const identity = row.evidence[0];
  const exact = identity === undefined ? { context: null, page: null, window: null } : findingIdentity(identity);
  return [row.correlation, exact.context ?? "", exact.page ?? "", exact.window ?? ""].join("\u0000");
}

function mergeCompleteness(left: SnapCompositeFinding["completeness"], right: SnapCompositeFinding["completeness"]): SnapCompositeFinding["completeness"] {
  const rank = { complete: 0, bounded: 1, incomplete: 2 } as const;
  return rank[left] >= rank[right] ? left : right;
}

function followup(indexPath: string, row: FindingDraft): string {
  const parts = ["pnpm snap --report", indexPath, "--problems"];
  const onlyArm = row.arms.length === 1 ? row.arms[0] : undefined;
  const onlyChannel = row.channels.length === 1 ? row.channels[0] : undefined;
  if (onlyArm !== undefined) {
    parts.push("--arm", onlyArm);
  } else if (onlyChannel !== undefined && onlyChannel !== "run") {
    parts.push("--channel", onlyChannel);
  }
  const evidence = row.evidence[0];
  const exact = evidence === undefined ? { context: null, page: null, window: null } : findingIdentity(evidence);
  if (exact.context !== null) {
    parts.push("--context", String(exact.context));
  }
  if (exact.page !== null) {
    parts.push("--page", String(exact.page));
  }
  if (exact.window !== null) {
    parts.push("--window", exact.window);
  }
  return parts.join(" ");
}

function sameEvidenceIdentity(left: SnapFindingEvidenceRef | undefined, right: SnapFindingEvidenceRef | undefined): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  const leftIdentity = findingIdentity(left);
  const rightIdentity = findingIdentity(right);
  if (leftIdentity.context === null && leftIdentity.page === null && leftIdentity.window === null) {
    return false;
  }
  return leftIdentity.context === rightIdentity.context && leftIdentity.page === rightIdentity.page && leftIdentity.window === rightIdentity.window;
}

function compatibleAttribution(attribution: FindingDraft, finding: FindingDraft): boolean {
  const tag = attribution.correlation.split(":").at(-1) ?? "";
  const metric = finding.what.toLowerCase();
  let compatible = false;
  if (tag === "frame" || tag === "drop") {
    compatible = metric.includes("frame");
  } else if (tag === "reflow" || tag === "space") {
    compatible = metric.includes("layout") || metric.includes("blocking") || metric.includes("loaf");
  } else if (tag === "cls") {
    compatible = metric.includes("cls") || metric.includes("shift");
  } else if (tag === "anim") {
    compatible = metric.includes("anim");
  } else if (tag === "input") {
    compatible = metric.includes("click") || metric.includes("input");
  } else if (tag === "perf") {
    compatible = finding.arms.includes("react-profile");
  } else if (tag === "css") {
    compatible = finding.arms.includes("dead-css");
  }
  return compatible && sameEvidenceIdentity(attribution.evidence[0], finding.evidence[0]);
}

function attachAttributions(drafts: readonly FindingDraft[]): readonly FindingDraft[] {
  const attributions = drafts.filter((row) => row.correlation.startsWith("attribution:"));
  const primary = drafts.filter((row) => !row.correlation.startsWith("attribution:"));
  const consumed = new Set<FindingDraft>();
  const enriched = primary.map((row) => {
    const matching = attributions.filter((candidate) => candidate.arms.some((arm) => row.arms.includes(arm)) && compatibleAttribution(candidate, row));
    if (matching.length === 0) {
      return row;
    }
    for (const candidate of matching) {
      consumed.add(candidate);
    }
    return {
      ...row,
      channels: [...new Set([...row.channels, ...matching.flatMap((candidate) => candidate.channels)])],
      evidence: [...row.evidence, ...matching.flatMap((candidate) => candidate.evidence)],
    };
  });
  return [...enriched, ...attributions.filter((row) => !consumed.has(row))];
}

function mergeDrafts(drafts: readonly FindingDraft[], indexPath: string): readonly SnapCompositeFinding[] {
  const grouped = new Map<string, FindingDraft>();
  for (const draft of drafts) {
    const key = groupKey(draft);
    const current = grouped.get(key);
    if (current === undefined) {
      grouped.set(key, draft);
      continue;
    }
    const evidence = [...current.evidence];
    for (const candidate of draft.evidence) {
      if (!evidence.some((row) => row.source === candidate.source && row.artifact === candidate.artifact)) {
        evidence.push(candidate);
      }
    }
    grouped.set(key, {
      ...current,
      severity: SEVERITY_RANK[current.severity] <= SEVERITY_RANK[draft.severity] ? current.severity : draft.severity,
      arms: [...new Set([...current.arms, ...draft.arms])],
      channels: [...new Set([...current.channels, ...draft.channels])],
      where: current.where === draft.where ? current.where : `${current.where}; ${draft.where}`,
      evidence,
      completeness: mergeCompleteness(current.completeness, draft.completeness),
      conflicts: [...new Set([...current.conflicts, ...draft.conflicts])],
      occurrences: current.occurrences + draft.occurrences,
    });
  }
  return [...grouped.values()]
    .map((row): SnapCompositeFinding => {
      const { correlation: _correlation, ...finding } = row;
      return {
        ...finding,
        confidence: new Set(row.evidence.map((item) => item.source)).size > 1 ? "correlated" : "direct",
        next: followup(indexPath, row),
      };
    })
    .toSorted((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] || right.occurrences - left.occurrences);
}

/** The arm states that OWE A PROBLEM ROW. `load-suspect` is deliberately ABSENT (#1616): its number was
 *  measured and is unpromotable, so it is an ANNOTATION (below) — a problem row for it would be exactly the
 *  promotion the ruling forbids, and it would make every loaded run "have findings". */
const VOTING_ARM_STATES = new Set(["failed", "refused", "withheld"]);

/** …and the arms that owe an ANNOTATION instead. Separate set, separate severity, never counted. */
const ANNOTATED_ARM_STATES = new Set(["load-suspect", "recorded"]);

/** THE LOAD-SUSPECT ANNOTATION (#1616 done-criterion 2). The arm measured on a loaded box, so the run's
 *  reader is TOLD — an annotation carries into the findings surface without severity, without a count, and
 *  with `counted: false`, so nothing downstream can turn it into a verdict. It is emitted on EVERY run,
 *  passing or not: a load-suspect number on a green run is exactly the reading that would otherwise
 *  disappear. `completeness: "incomplete"` because the arm's threshold went unjudged. */
function measurementAnnotations(input: SnapFindingInput): FindingDraft[] {
  return input.verdict.arms
    .filter((arm) => ANNOTATED_ARM_STATES.has(arm.state))
    .map((arm) => ({
      severity: "annotation" as const,
      arms: [arm.arm],
      channels: [arm.arm],
      what:
        arm.detail ??
        (arm.state === "recorded"
          ? `the ${arm.arm} arm recorded measurements without hardware timing qualification`
          : `the ${arm.arm} arm MEASURED on a loaded box — its numbers are load-suspect and were not judged (#1616)`),
      where: `arm ${arm.arm}`,
      evidence: arm.artifacts.length === 0 ? [findingRef("run-index", input.indexPath)] : arm.artifacts.map((path) => findingRef(arm.arm, path)),
      completeness: "incomplete" as const,
      conflicts: [],
      occurrences: 1,
      disposition: { counted: false, reason: arm.state },
      correlation: `arm:${arm.arm}:${arm.state}`,
    }));
}

/** EVERY VOTING ARM OWES A ROW (#1385 item 5). A red `--contrast` run printed two `CONTRAST … FAIL` lines
 *  and one composite finding saying "run failed with no structured problem row" — the fallback below fired
 *  because no ANALYZER wrote a problem artifact, which is true of most arms and says nothing about whether
 *  the run explained itself. The arm verdicts already carry the arm, its state, its detail and its
 *  artifacts, so a failing arm is turned into a finding directly and `next=` narrows to `--arm <it>`. */
function armVerdictDrafts(input: SnapFindingInput): FindingDraft[] {
  return input.verdict.arms
    .filter((arm) => VOTING_ARM_STATES.has(arm.state))
    .map((arm) => ({
      severity: "error" as const,
      arms: [arm.arm],
      channels: [arm.arm],
      what: arm.detail ?? `the ${arm.arm} arm ${arm.state} — read its own lines and evidence for the reading`,
      where: `arm ${arm.arm}`,
      evidence: arm.artifacts.length === 0 ? [findingRef("run-index", input.indexPath)] : arm.artifacts.map((path) => findingRef(arm.arm, path)),
      // `withheld` is an ABSENCE of measurement, so the row it produces cannot claim completeness.
      completeness: arm.state === "withheld" ? ("incomplete" as const) : ("complete" as const),
      conflicts: [],
      occurrences: 1,
      // The arm's own state IS the vote — that is what put the run in a non-passing state at all.
      disposition: { counted: true, reason: `${arm.arm}-arm` },
      correlation: `arm:${arm.arm}:${arm.state}`,
    }));
}

/** The LAST resort, and now genuinely last: a run that did not pass, produced no error row, AND had no
 *  arm in a voting state — i.e. the exit came from somewhere no producer described. Its `conflicts` text
 *  is a claim about the run, so it may only be made once that is actually true. */
function fallbackFinding(input: SnapFindingInput): FindingDraft {
  return {
    severity: "error",
    arms: [],
    channels: ["run"],
    what: `run ${input.verdict.state} with no structured problem row`,
    where: "run",
    evidence: [findingRef("run-index", input.indexPath)],
    completeness: "incomplete",
    conflicts: ["producer-specific actionable evidence was absent"],
    occurrences: 1,
    // The exit came from somewhere no producer described, so which counter it entered is unknown — and
    // that unknown IS the row's content.
    disposition: { counted: false, reason: "unattributed-exit" },
    correlation: "run:unstructured",
  };
}

export async function collectSnapFindings(input: SnapFindingInput): Promise<readonly SnapCompositeFinding[]> {
  const diagnostics = diagnosticFindingDrafts(input.diagnosticsState, input.diagnostics, input.artifacts, input.indexPath);
  const drafts = [
    // CORE FIRST (#1344). `mergeDrafts` sorts by severity then occurrence count, and `toSorted` is stable,
    // so this array's order IS the tie-break among equally-severe rows. The run's own drive failures —
    // a step that never ran, a nav that never landed — must never lose that tie to a console row, because
    // they explain why the console rows describe the wrong surface.
    ...(await coreFindingDrafts(input.artifacts, diagnostics)),
    ...diagnostics,
    ...(await analyzerFindingDrafts(input.artifacts)),
    ...(await lighthouseFindingDrafts(input.artifacts)),
    ...(await reactFindingDrafts(input.artifacts)),
    ...(await harFindingDrafts(input.artifacts)),
    // OUTSIDE the `state !== "passed"` branch below, deliberately (#1616): a load-suspect arm is most
    // likely to appear on a PASSING run, and that is precisely the reading that must not vanish.
    ...measurementAnnotations(input),
  ];
  if (input.verdict.state !== "passed") {
    // PER-ARM ROWS ARE NOT A FALLBACK (#1566). #1385 landed them inside the "no error row at all" branch,
    // which meant a contrast failure ALONGSIDE a page error got no row of its own — the page error is a
    // different fact, and the arm that voted still went unexplained. They are emitted whenever an arm is
    // in a voting state, and de-duplicated against the arms a PRODUCER already described: an analyzer
    // that wrote its own problem rows (design-audit, motion, heap, interaction-perf) has said everything
    // this row would, so a second one would be noise wearing the same arm's name.
    //
    // "DESCRIBED" IS A PROVENANCE QUESTION, NOT A SEVERITY ONE (#1566 review). The first cut built this
    // set from EVERY draft's arms, which swept in the console-attributed ANNOTATION rows — so a run whose
    // console merely MENTIONED an arm (`[drop] 70ms rendered frame` is attributed to `motion`) lost that
    // arm's own problem row, and with no error draft left the fallback fired saying "producer-specific
    // actionable evidence was absent" beside the very evidence: the exact contradiction #1385 forbade,
    // reintroduced one layer up. Severity cannot be the discriminator either — `interaction-perf` and
    // `heap` threshold rows are producer-written problem rows that render as ANNOTATIONS. The honest cut
    // is WHO WROTE IT: everything except the console-ring drafts is a producer describing its own arm.
    const observed = new Set<FindingDraft>(diagnostics);
    const described = new Set(drafts.filter((row) => !observed.has(row)).flatMap((row) => row.arms));
    const arms = armVerdictDrafts(input).filter((row) => !row.arms.some((arm) => described.has(arm)));
    drafts.push(...arms);
    // THE FALLBACK MUST NOT FIRE WHEN A ROW EXISTS (#1385 item 5) — its own text says actionable evidence
    // was absent, and printing that beside a row that carries it is the instrument contradicting itself.
    if (drafts.some((row) => row.severity === "error") === false) {
      drafts.push(fallbackFinding(input));
    }
  }
  return mergeDrafts(attachAttributions(drafts), input.indexPath);
}
