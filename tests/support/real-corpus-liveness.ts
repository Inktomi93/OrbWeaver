// REAL-TREE LIVENESS for a FINAL policy (#2149) — the arm that tells "silent because the tree is clean"
// apart from "silent because the policy is dead".
//
// THE DEFECT CLASS. A `-health` tripwire is quiet when healthy and quiet when broken, and nothing on the
// tree distinguishes the two. Conformance rows cannot close it: they run on VIRTUAL projects with no real
// layout (guide §5), so a policy can be green on fixtures and dead on the corpus — which is exactly how
// `conversion-refusal-liveness` shipped two findings red against its one live subject while every proof row
// passed. The only thing that discriminates is a positive control the policy must report ON THE REAL
// CORPUS.
//
// A VIRTUAL OVERLAY, NEVER A WORKING-TREE PLANT. `project.createSourceFile` adds the file to the loaded
// ts-morph project in memory only — nothing is written, nothing is cleaned up, and a killed run leaves no
// debris. This matters more than convenience: ZERO final policies plant by construction (guide §6.5), the
// four surviving `__g_`/`__dc_` planters all cover LEGACY modules, and they are the reason
// `check-gates.repo.int.test.ts` is orchestrator-only and not concurrency-safe with itself. A fifth planter
// would be a new shared-tree hazard for every lane, to prove a property that does not need one.
//
// IT WORKS BECAUSE POPULATION RESOLUTION READS THE PROJECT, NOT THE DISK. `lib/policy-pass.ts#resolveRuns`
// builds its candidate set from `input.project.getSourceFiles()`, so an in-memory file inside the policy's
// declared population is admitted exactly like a real one. If that ever changes, every arm built on this
// helper fails loudly rather than passing vacuously, because the BASELINE half below would stop being
// clean — see the two-directional contract.
//
// TWO DIRECTIONS OR IT PROVES NOTHING. The helper runs the policy TWICE: once WITHOUT the overlay, where
// it must be silent (or the "finding" was already there and the overlay proved nothing), and once WITH it,
// where the policy must report. A one-directional arm that only ever asserts a finding cannot tell a live
// policy from one that reports on everything.
//
// AND THERE ARE TWO KINDS OF OVERLAY, WHICH IS THE PART A FIRST PASS GETS WRONG. Measured across the eight
// modules #2149 names: SIX are `-health` BLINDNESS TRIPWIRES on `execution: "entire-population"` whose
// messages are "no longer calls", "derived ZERO entity-id type names", "no freshly-minted poll schedule".
// Those fire when their SUBJECT DISAPPEARS, so ADDING a bad file cannot make them speak — planting a
// positive at a new path leaves them silent and the arm would "prove" liveness by asserting nothing. Their
// control is the INVERSE: overwrite the anchor the tripwire watches with a version that no longer carries
// the subject, and the tripwire must fire.
//
//   ADD       — an occurrence policy: a new file at a path the population admits, which the policy reports.
//               The finding must land AT THAT PATH.
//   NEUTRALISE — a blindness tripwire: an EXISTING file overwritten so the watched subject is gone. The
//               finding lands wherever the tripwire anchors (usually a constant), NOT at the overwritten
//               path, so the assertion scope is the whole run.
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { GatePolicy } from "@orb/tooling/verify";
import { runPolicyPass } from "@orb/tooling/verify";
import type { Project } from "ts-morph";
import { expect } from "./fixtures.ts";

/** What the overlay is FOR, which decides where the finding is allowed to land. */
export type RealCorpusOverlayKind = "add" | "neutralise";

export interface RealCorpusOverlay {
  /** `add` for an occurrence policy, `neutralise` for a blindness tripwire. See the header. */
  readonly kind: RealCorpusOverlayKind;
  /** Repo-relative path. For `add`, a NEW path the population admits — a path outside it makes the run a
   *  `[population]` TOOL ERROR rather than a finding. For `neutralise`, an EXISTING file the tripwire
   *  watches. */
  readonly path: string;
  readonly source: string;
}

export interface RealCorpusLivenessArm {
  readonly policy: GatePolicy;
  /** REPO-RELATIVE globs for the corpus this policy is measured over. Arms sharing a glob-set share one
   *  built project, so keep the spelling identical across arms that want the same corpus.
   *
   *  THEY MUST COVER THE POLICY'S WHOLE DECLARED POPULATION. Narrowing below it does not merely measure
   *  less — it MANUFACTURES findings, because a policy that reads "this allowlist row names nothing" cannot
   *  tell an absent row from a deleted one. Measured on the first real arm: the since-retired
   *  `contract-derives-not-respells-health` declared `["@server", "@db"]` and, built over `@server` alone,
   *  reported two stale-allowlist findings in its BASELINE. The clean-baseline guard below is what caught
   *  it; without that guard the arm would have "passed" against a corpus of its own invention. */
  readonly globs: readonly string[];
  /** ONE OR MORE overlays, applied together. Plural because a tripwire's subject is routinely spread:
   *  `windowed-infinite-query-health` fires only when NO `infiniteQueryOptions` call site remains and there
   *  are six; `serde-core-seal-health` judges a whole sanctioned DOMAIN and the `import` domain carries the
   *  engine import in three files. Neutralising one of six proves nothing, and a single-overlay contract
   *  would have quietly pushed both arms into "assert the policy stayed silent". */
  readonly overlays: readonly [RealCorpusOverlay, ...RealCorpusOverlay[]];
  /** A substring the reported message MUST contain. Required, not optional: an arm that asserts only THAT
   *  something fired cannot tell the intended verdict from a different one the same policy can emit, and
   *  making it optional was the tell — it let the arm be built half-finished. */
  readonly messageIncludes: string;
  /** `types: true` when the policy's `analysis` is `"types"`. Default `false` — the pure-AST project. */
  readonly types?: boolean;
}

interface PassFindings {
  /** Messages in the arm's assertion SCOPE — at the overlay path for `add`, the whole run for
   *  `neutralise`. */
  readonly inScope: readonly string[];
  readonly toolErrors: readonly string[];
}

function runOver(project: Project, arm: RealCorpusLivenessArm, repoRoot: string): PassFindings {
  const result = runPolicyPass({
    knownPolicies: [arm.policy],
    policies: [arm.policy],
    root: repoRoot,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  return {
    inScope: result.authority.effectiveFindings
      // A blindness tripwire anchors its finding on a CONSTANT, not on the file whose subject vanished, so
      // scoping a `neutralise` arm to the overwritten path would assert on an empty set forever.
      .filter((finding) => arm.overlays.some((overlay) => overlay.kind === "neutralise") || arm.overlays.some((overlay) => overlay.path === finding.file))
      // A finding's own `message` is OPTIONAL, and a policy that passes none is not anonymous — the sink
      // presents the POLICY's `message` for it, which is the text a reader actually sees. Falling back to a
      // "(no message)" placeholder instead made `windowed-infinite-query-health`'s arm unassertable: it
      // reports `ctx.report.file(ANCHOR, { line: 1 })` with no message at all, so the control fired
      // correctly and the arm failed on a string the product never emits.
      .map((finding) => finding.message ?? arm.policy.message),
    // Every refusal channel, flattened: a policy WITHHELD by a resource refusal reports nothing, which
    // would read exactly like a clean baseline and then exactly like a dead policy.
    toolErrors: [
      ...result.toolErrors.map((error) => JSON.stringify(error)),
      ...result.factErrors.map((error) => JSON.stringify(error)),
      ...result.authority.toolErrors.map((error) => JSON.stringify(error)),
      ...result.authority.withheldPolicyIds,
    ],
  };
}

/** Prove a FINAL policy is alive on the real corpus: silent without the plant, reporting with it.
 *
 *  Returns the messages the policy emitted at the planted path, so a caller can assert further. */
/** Every overlay's PRE-STATE, checked before anything runs.
 *
 *  A `neutralise` naming a path the corpus does not hold would silently become an `add` and the arm would
 *  pass for the wrong reason; an `add` onto an existing file would silently become a `neutralise`. Both are
 *  the "passed, but not for the stated reason" shape this mechanism exists to end, so they THROW rather
 *  than assert — a thrown arm is a lane's problem, a silently-inverted one is nobody's. */
function captureOriginals(project: Project, repoRoot: string, arm: RealCorpusLivenessArm): ReadonlyMap<string, string | undefined> {
  const originals = new Map<string, string | undefined>();
  for (const overlay of arm.overlays) {
    const absolute = `${repoRoot}/${overlay.path}`;
    const original = project.getSourceFile(absolute)?.getFullText();
    if (overlay.kind === "neutralise" && original === undefined) {
      throw new Error(
        `${arm.policy.id}: neutralise overlay ${overlay.path} is not in the loaded corpus — the arm would ADD a file rather than blind the tripwire, and would then pass for the wrong reason. Check the arm's globs cover the policy's whole declared population.`,
      );
    }
    if (overlay.kind === "add" && original !== undefined) {
      throw new Error(`${arm.policy.id}: add overlay ${overlay.path} already EXISTS in the corpus — use \`neutralise\`, or pick an unused path.`);
    }
    originals.set(absolute, original);
  }
  return originals;
}

/** Put the corpus back IN MEMORY. Not housekeeping: arms share a project, so a leaked overlay would
 *  silently become part of the next arm's "real" corpus. */
function restoreOriginals(project: Project, originals: ReadonlyMap<string, string | undefined>): void {
  for (const [absolute, original] of originals) {
    const file = project.getSourceFile(absolute);
    if (file === undefined) {
      continue;
    }
    if (original === undefined) {
      project.removeSourceFile(file);
    } else {
      file.replaceWithText(original);
    }
  }
}

function assertArm(project: Project, repoRoot: string, arm: RealCorpusLivenessArm): readonly string[] {
  const originals = captureOriginals(project, repoRoot, arm);

  const baseline = runOver(project, arm, repoRoot);
  expect(baseline.toolErrors, `${arm.policy.id}: the BASELINE run refused, so its silence is not evidence`).toEqual([]);
  expect(baseline.inScope, `${arm.policy.id}: already reports before the overlay, so the overlay proves nothing`).toEqual([]);

  for (const overlay of arm.overlays) {
    project.createSourceFile(`${repoRoot}/${overlay.path}`, overlay.source, { overwrite: true });
  }
  try {
    const live = runOver(project, arm, repoRoot);
    expect(live.toolErrors, `${arm.policy.id}: the OVERLAID run refused, so its verdict is not a measurement`).toEqual([]);
    expect(
      live.inScope.length,
      `${arm.policy.id} reported NOTHING for a real-corpus positive control (${arm.overlays.map((overlay) => `${overlay.kind} ${overlay.path}`).join(", ")}) — it is silent when the tree is clean AND silent when it is broken (#2149)`,
    ).toBeGreaterThan(0);
    expect(live.inScope.join("\n"), `${arm.policy.id}: the control fired, but not with the expected verdict`).toContain(arm.messageIncludes);
    return live.inScope;
  } finally {
    restoreOriginals(project, originals);
  }
}
function buildCorpus(repoRoot: string, arm: RealCorpusLivenessArm): Project {
  return getWorkspace({ root: repoRoot, types: arm.types === true, globs: arm.globs.map((glob) => `${repoRoot}/${glob}`) });
}

/** Prove ONE final policy is alive on the real corpus. */
export function assertRealCorpusLiveness(repoRoot: string, arm: RealCorpusLivenessArm): readonly string[] {
  return assertArm(buildCorpus(repoRoot, arm), repoRoot, arm);
}

/** Prove EVERY declared arm, building each distinct corpus ONCE.
 *
 *  Returns a policy-id → messages map so a caller can assert the DENOMINATOR. That assertion is not
 *  ceremony: a helper that silently skipped an arm would run zero `expect`s for it and the suite would be
 *  green, which is the same shape as the dead policies this whole mechanism exists to find. */
export function assertRealCorpusLivenessArms(repoRoot: string, arms: readonly RealCorpusLivenessArm[]): ReadonlyMap<string, readonly string[]> {
  const byCorpus = new Map<string, RealCorpusLivenessArm[]>();
  for (const arm of arms) {
    const key = `${arm.types === true ? "types" : "syntax"}::${[...arm.globs].toSorted((a, b) => a.localeCompare(b)).join("|")}`;
    byCorpus.set(key, [...(byCorpus.get(key) ?? []), arm]);
  }
  const fired = new Map<string, readonly string[]>();
  for (const group of byCorpus.values()) {
    const first = group[0];
    if (first !== undefined) {
      const project = buildCorpus(repoRoot, first);
      for (const arm of group) {
        fired.set(arm.policy.id, assertArm(project, repoRoot, arm));
      }
    }
  }
  return fired;
}
