// Browser-free readers for analyzer-owned structured evidence. They preserve producer thresholds and gaps.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SnapAnalyzerProblem, SnapAnalyzerProducer } from "../contract/analyzer.ts";
import { isSnapAnalyzerProducer, snapAnalyzerArm } from "../contract/analyzer.ts";
import type { SnapRunArtifact } from "../contract/run-index.ts";
import { failedAudits, nameMismatchTriage } from "./lighthouse-report.ts";
import type { FindingDraft } from "./run-finding-common.ts";
import { countedBy, findingCompleteness, findingRef, findingSymptom, malformedFinding, readJson, record } from "./run-finding-common.ts";
import { readSnapAnalyzerProblems } from "./run-report-problems.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

type AnalyzerArtifact = SnapRunArtifact & { readonly producer: SnapAnalyzerProducer };

function isAnalyzerArtifact(candidate: SnapRunArtifact): candidate is AnalyzerArtifact {
  return isSnapAnalyzerProducer(candidate.producer);
}

/** `exemption` is NEVER an error (#1780): the row exists to say WHY a measurement that would have failed
 *  was excused, so promoting it would manufacture the very finding the carve-out ruled out. It reads as an
 *  annotation, which `run-findings.ts` carries without severity and without a count. */
function analyzerProblemSeverity(problem: SnapAnalyzerProblem): FindingDraft["severity"] {
  if (problem.kind === "exemption") {
    return "annotation";
  }
  return (problem.arm === "interaction-perf" || problem.arm === "heap") && problem.kind === "threshold" ? "annotation" : "error";
}

function analyzerProblemDraft(problem: SnapAnalyzerProblem, artifact: AnalyzerArtifact): FindingDraft {
  return {
    severity: analyzerProblemSeverity(problem),
    arms: [problem.arm],
    channels: [problem.arm],
    // An exemption row's `threshold` field carries the carve-out's NAME, not a number, so "(threshold …)"
    // would read as a budget it met — it names the carve-out instead. And ONLY the name: the four
    // conditions are 580 bytes and this line is inside the 4096-byte agent-readable body budget
    // (tests/tooling/snap/ops/agent-readable-output.suite.int.test.ts), so they stay in the artifact's
    // `detail`, which the row's own `next=` command prints. Same posture as the console collapse: name the
    // artifact and the exact reader, never the block.
    what:
      problem.kind === "exemption"
        ? `${problem.metric}: ${problem.observed} (${problem.threshold})`
        : `${problem.metric}: ${problem.observed} (threshold ${problem.threshold})`,
    where: problem.subject,
    evidence: [findingRef(problem.arm, artifact.path, artifact.scope)],
    completeness: findingCompleteness(artifact),
    conflicts: [],
    occurrences: 1,
    disposition: countedBy(`${problem.arm}-arm`),
    correlation: `analyzer:${problem.arm}:${problem.metric}:${findingSymptom(problem.subject)}`,
  };
}

function legacyAnalyzerDraft(artifact: AnalyzerArtifact): FindingDraft {
  const arm = snapAnalyzerArm(artifact.producer);
  return {
    severity: "error",
    arms: [arm],
    channels: [arm],
    what: "structured analyzer problem evidence is absent",
    where: "legacy artifact",
    evidence: [findingRef(artifact.producer, artifact.path, artifact.scope)],
    completeness: "incomplete",
    conflicts: ["the artifact predates analyzer-owned problem rows"],
    occurrences: 1,
    disposition: countedBy(`${arm}-arm`),
    correlation: `malformed:${artifact.relativePath}`,
  };
}

export async function analyzerFindingDrafts(artifacts: readonly SnapRunArtifact[]): Promise<FindingDraft[]> {
  const drafts: FindingDraft[] = [];
  for (const artifact of artifacts.filter(isAnalyzerArtifact)) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): composite display owns parser drift by persisting a malformed-evidence finding; the strict detailed reader still refuses the source artifact. Ends if malformedFinding stops retaining the caught error.
    try {
      const read = await readSnapAnalyzerProblems(artifact);
      if (read === null) {
        continue;
      }
      for (const problem of read.problems) {
        drafts.push(analyzerProblemDraft(problem, artifact));
      }
      if (read.legacyMissing) {
        drafts.push(legacyAnalyzerDraft(artifact));
      }
    } catch (error) {
      drafts.push(malformedFinding(artifact, error));
    }
  }
  return drafts;
}

export async function lighthouseFindingDrafts(artifacts: readonly SnapRunArtifact[]): Promise<FindingDraft[]> {
  const drafts: FindingDraft[] = [];
  for (const artifact of artifacts.filter((candidate) => candidate.producer === "lighthouse" && candidate.relativePath.endsWith(".json"))) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): composite display owns parser drift by persisting a malformed-evidence finding; the strict detailed reader still refuses the source artifact. Ends if malformedFinding stops retaining the caught error.
    try {
      for (const audit of failedAudits(await readJson(artifact.path))) {
        // axe already wrote the diagnosis and captured the element (#1347). Printing the selectors alone
        // made every a11y finding a two-call errand: read the row, then go re-measure what axe measured.
        const explanation = [...new Set(audit.nodes.map((node) => node.explanation).filter((value) => value !== null))].join(" · ");
        const where = audit.nodes.map((node) => (node.snippet === null ? node.selector : `${node.selector} ${node.snippet}`)).join(" | ");
        // #1381: the per-node triage hint for the one audit whose heuristic over-fires on a correct
        // name/description split. Null for every other audit and for every node that carries no
        // `aria-describedby`, so the row is unchanged except where the hint is the missing fact.
        const triage = nameMismatchTriage(audit.id, audit.nodes);
        const head = explanation === "" ? `${audit.id}: ${audit.title}` : `${audit.id}: ${audit.title} — ${explanation}`;
        drafts.push({
          severity: "error",
          arms: ["lighthouse"],
          channels: ["lighthouse"],
          what: triage === null ? head : `${head} — ${triage}`,
          where: where === "" ? "page" : where,
          evidence: [findingRef("lighthouse", artifact.path, artifact.scope)],
          completeness: findingCompleteness(artifact),
          conflicts: [],
          occurrences: Math.max(1, audit.nodeCount),
          disposition: countedBy("lighthouse-arm"),
          correlation: `lighthouse:${audit.id}`,
        });
      }
    } catch (error) {
      drafts.push(malformedFinding(artifact, error));
    }
  }
  return drafts;
}

export async function reactFindingDrafts(artifacts: readonly SnapRunArtifact[]): Promise<FindingDraft[]> {
  const drafts: FindingDraft[] = [];
  const profileArtifacts = artifacts.filter((candidate) => candidate.producer === "react-profile");
  const summaries = profileArtifacts.filter((candidate) => candidate.schema === "snap-react-profile-summary-v1");
  const selected = summaries.length > 0 ? summaries : profileArtifacts.filter((candidate) => candidate.schema === "snap-react-profile-v1");
  for (const artifact of selected) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): composite display owns parser drift by persisting a malformed-evidence finding; the strict detailed reader still refuses the source artifact. Ends if malformedFinding stops retaining the caught error.
    try {
      const parsed = record(await readJson(artifact.path));
      const gaps = parsed?.["gaps"];
      if (!Array.isArray(gaps)) {
        throw new Error(`${artifact.path} has no React gap population`);
      }
      for (const value of gaps) {
        const gap = record(value);
        if (typeof gap?.["evidence"] !== "string" || typeof gap["detail"] !== "string") {
          throw new Error(`${artifact.path} has a malformed React gap row`);
        }
        drafts.push({
          severity: "error",
          arms: ["react-profile"],
          channels: ["react-profile"],
          what: gap["detail"],
          where: gap["evidence"],
          evidence: [findingRef("react-profile", artifact.path, artifact.scope)],
          completeness: findingCompleteness(artifact),
          conflicts: [],
          occurrences: 1,
          disposition: countedBy("react-profile-arm"),
          correlation: `react:${findingSymptom(gap["evidence"])}`,
        });
      }
    } catch (error) {
      drafts.push(malformedFinding(artifact, error));
    }
  }
  return drafts;
}
