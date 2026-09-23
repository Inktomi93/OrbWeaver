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
// ONE RUNNER, ONE CORPUS — VERIFY'S OWN (owner ruling, docs/work/0043). `check:structure` loads ONE shared
// pure-AST project through `projectCtx` (`lib/project-context.ts` → `_shared/ts-workspace.ts#getWorkspace`,
// the harness globs), hands it to ONE `runPolicyPass`, and every `analysis: "types"` policy in that pass
// asks the SAME project for its checker (`lib/policy-pass.ts#sharedChecker`), so the structure run has
// exactly one compiler world and one type graph. This runner loads that same corpus through that same door,
// ONCE, and runs every declared arm against it:
//   · it cannot drift from what verify judges — an arm over a hand-picked corpus proved liveness under
//     conditions the real run never has (a tsconfig-loaded graph verify never builds, or a glob set that
//     silently omits half a population);
//   · it retires the per-arm GLOB field and the hazard it carried. Globs narrower than a policy's declared
//     population MANUFACTURED findings (the since-retired `contract-derives-not-respells-health` read two
//     stale-allowlist rows in its BASELINE when built over `@server` without `@db`); a corpus that IS the
//     structure run's corpus covers every population by construction;
//   · the BASELINE is the structure run's shape too: every armed policy in ONE pass through ONE walker,
//     with the central grant table (`reviewedGrantsFor`), so a finding verify licenses is licensed here.
//
// A VIRTUAL OVERLAY, NEVER A WORKING-TREE PLANT. `project.createSourceFile` adds the file to the loaded
// ts-morph project in memory only — nothing is written, nothing is cleaned up, and a killed run leaves no
// debris. ZERO final policies plant by construction (guide §6.5), and as of #2176 Phase F NOTHING plants
// into the working tree at all; a new planter would be a new shared-tree hazard for every lane, to prove a
// property that does not need one.
//
// IT WORKS BECAUSE POPULATION RESOLUTION READS THE PROJECT, NOT THE DISK. `lib/policy-pass-resolve.ts`
// builds its candidate set from `input.project.getSourceFiles()`, so an in-memory file inside the policy's
// declared population is admitted exactly like a real one. If that ever changes, every arm fails loudly
// rather than passing vacuously, because the overlaid run would stop reporting.
//
// TWO DIRECTIONS OR IT PROVES NOTHING. Every armed policy runs WITHOUT its overlay (the shared baseline),
// where it must be silent in its arm's scope, and once WITH it, where it must report. A one-directional arm
// that only ever asserts a finding cannot tell a live policy from one that reports on everything.
//
// AND THERE IS MORE THAN ONE KIND OF OVERLAY, WHICH IS THE PART A FIRST PASS GETS WRONG. `-health`
// BLINDNESS TRIPWIRES on `execution: "entire-population"` fire when their SUBJECT DISAPPEARS ("no longer
// calls", "derived ZERO entity-id type names"), so ADDING a bad file cannot make them speak — planting a
// positive at a new path leaves them silent and the arm would "prove" liveness by asserting nothing. Their
// control is the INVERSE: take away what the tripwire watches.
//
//   ADD       — an occurrence policy: a new file at a path the population admits, which the policy reports.
//               The finding must land AT THAT PATH.
//   NEUTRALISE — a blindness tripwire over CONTENT: an EXISTING file overwritten so the watched subject is
//               gone. The finding lands wherever the tripwire anchors (usually a constant), NOT at the
//               overwritten path, so the assertion scope is the whole run.
//   REMOVE    — a blindness tripwire over PRESENCE: every corpus file at a path (or under a directory path
//               ending in `/`) taken out of the project. Minted for `pointer-capability-tier-health`, whose
//               subject is that the reviewed shell home HAS files at all — overwriting them leaves them
//               present, so no content overlay can reach it. Whole-run scope, as for NEUTRALISE.
import type { GatePolicy } from "@orb/tooling/verify";
import { projectCtx, reviewedGrantsFor, runPolicyPass } from "@orb/tooling/verify";
import type { Project } from "ts-morph";
import { expect } from "./fixtures.ts";

/** What the overlay is FOR, which decides where the finding is allowed to land. See the header. */
export type RealCorpusOverlay =
  | {
      /** `add` for an occurrence policy, `neutralise` for a content tripwire. */
      readonly kind: "add" | "neutralise";
      /** Repo-relative path. For `add`, a NEW path the population admits — a path outside it makes the run a
       *  `[population]` TOOL ERROR rather than a finding. For `neutralise`, an EXISTING file the tripwire
       *  watches. */
      readonly path: string;
      readonly source: string;
    }
  | {
      readonly kind: "remove";
      /** Repo-relative: one existing file, or a directory ending in `/` whose every corpus file goes. */
      readonly path: string;
    };

export interface RealCorpusLivenessArm {
  readonly policy: GatePolicy;
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
  /** `true` for a REVIEWED-GRANT policy whose verdict on the real tree is LICENSED: the central grant table
   *  consumes it, so under verify's own authority it speaks as a GRANTED finding, never an effective one, and
   *  the assertion reads that channel instead. A grant licenses a report; it does not make one, so a dead
   *  policy is exactly as silent in this channel as in the effective one. */
  readonly granted?: true;
}

/** The runner's two assertions over ONE shared corpus. Heavy work is lazy: nothing loads until the first
 *  call, so declaring the runner at module scope costs a test file nothing. */
export interface RealCorpusLivenessRunner {
  /** EVERY arm's policy in ONE pass, as the structure run does: refusal-free, and silent in each arm's own
   *  assertion scope. The shared first direction. Returns the policy ids the pass RAN, so a caller can assert
   *  the denominator — a pass that silently dropped a policy would otherwise read as that policy's silence. */
  assertBaseline: () => readonly string[];
  /** ONE arm's overlaid run: its overlays applied, its policy run, its verdict asserted, the corpus restored
   *  in memory. Returns the in-scope messages. */
  assertArm: (arm: RealCorpusLivenessArm) => readonly string[];
}

type PassResult = ReturnType<typeof runPolicyPass>;

function refusals(result: PassResult): readonly string[] {
  // Every refusal channel, flattened: a policy WITHHELD by a resource refusal reports nothing, which would
  // read exactly like a clean baseline and then exactly like a dead policy.
  return [
    ...result.toolErrors.map((error) => JSON.stringify(error)),
    ...result.factErrors.map((error) => JSON.stringify(error)),
    ...result.authority.toolErrors.map((error) => JSON.stringify(error)),
    ...result.authority.withheldPolicyIds,
  ];
}

/** The messages in an arm's assertion SCOPE — at an overlay path for `add`, the whole run for `neutralise`
 *  and `remove` — read from the effective findings, or the granted ones for a `granted` arm. */
function inScope(result: PassResult, arm: RealCorpusLivenessArm): readonly string[] {
  const wholeRun = arm.overlays.some((overlay) => overlay.kind !== "add");
  const reported = arm.granted === true ? result.authority.grantedFindings.map(({ finding }) => finding) : result.authority.effectiveFindings;
  return (
    reported
      .filter((finding) => finding.policyId === arm.policy.id)
      // A blindness tripwire anchors its finding on a CONSTANT, not on the file whose subject vanished, so
      // scoping a `neutralise`/`remove` arm to the touched path would assert on an empty set forever.
      .filter((finding) => wholeRun || arm.overlays.some((overlay) => overlay.path === finding.file))
      // A finding's own `message` is OPTIONAL, and a policy that passes none is not anonymous — the sink
      // presents the POLICY's `message` for it, which is the text a reader actually sees. Falling back to a
      // "(no message)" placeholder instead made `windowed-infinite-query-health`'s arm unassertable: it
      // reports `ctx.report.file(ANCHOR, { line: 1 })` with no message at all, so the control fired
      // correctly and the arm failed on a string the product never emits.
      .map((finding) => finding.message ?? arm.policy.message)
  );
}

/** One corpus file's text before an arm touched it — `undefined` for a file the arm ADDS. */
type Originals = ReadonlyMap<string, string | undefined>;

/** The corpus files a `remove` overlay takes: the one file, or every file under a `/`-terminated path. */
function removedPaths(project: Project, repoRoot: string, path: string): readonly string[] {
  const absolute = `${repoRoot}/${path}`;
  return project
    .getSourceFiles()
    .map((file) => file.getFilePath())
    .filter((file) => (path.endsWith("/") ? file.startsWith(absolute) : file === absolute));
}

/** Every overlay's PRE-STATE, checked before anything runs.
 *
 *  A `neutralise` or `remove` naming a path the corpus does not hold would take nothing away and the arm
 *  would pass for the wrong reason; an `add` onto an existing file would silently become a `neutralise`.
 *  Both are the "passed, but not for the stated reason" shape this mechanism exists to end, so they THROW
 *  rather than assert — a thrown arm is a lane's problem, a silently-inverted one is nobody's. */
function captureOriginals(project: Project, repoRoot: string, arm: RealCorpusLivenessArm): Originals {
  const originals = new Map<string, string | undefined>();
  for (const overlay of arm.overlays) {
    if (overlay.kind === "remove") {
      const paths = removedPaths(project, repoRoot, overlay.path);
      if (paths.length === 0) {
        throw new Error(`${arm.policy.id}: remove overlay ${overlay.path} matches no file in the structure run's corpus — the arm would remove nothing.`);
      }
      for (const absolute of paths) {
        originals.set(absolute, project.getSourceFileOrThrow(absolute).getFullText());
      }
      continue;
    }
    const absolute = `${repoRoot}/${overlay.path}`;
    const original = project.getSourceFile(absolute)?.getFullText();
    if (overlay.kind === "neutralise" && original === undefined) {
      throw new Error(
        `${arm.policy.id}: neutralise overlay ${overlay.path} is not in the structure run's corpus — the arm would ADD a file rather than blind the tripwire, and would then pass for the wrong reason.`,
      );
    }
    if (overlay.kind === "add" && original !== undefined) {
      throw new Error(`${arm.policy.id}: add overlay ${overlay.path} already EXISTS in the corpus — use \`neutralise\`, or pick an unused path.`);
    }
    originals.set(absolute, original);
  }
  return originals;
}

function applyOverlays(project: Project, repoRoot: string, arm: RealCorpusLivenessArm): void {
  for (const overlay of arm.overlays) {
    if (overlay.kind === "remove") {
      for (const absolute of removedPaths(project, repoRoot, overlay.path)) {
        project.removeSourceFile(project.getSourceFileOrThrow(absolute));
      }
    } else {
      project.createSourceFile(`${repoRoot}/${overlay.path}`, overlay.source, { overwrite: true });
    }
  }
}

/** Put the corpus back IN MEMORY. Not housekeeping: every arm shares the one project, so a leaked overlay
 *  would silently become part of the next arm's "real" corpus. */
function restoreOriginals(project: Project, originals: Originals): void {
  for (const [absolute, original] of originals) {
    const file = project.getSourceFile(absolute);
    if (original === undefined) {
      if (file !== undefined) {
        project.removeSourceFile(file);
      }
    } else if (file === undefined) {
      // `overwrite` because ts-morph's existence check also consults the DISK, where a removed file still is.
      project.createSourceFile(absolute, original, { overwrite: true });
    } else {
      file.replaceWithText(original);
    }
  }
}

/** Open the ONE liveness runner over `arms`. A policy carries at most one arm: two arms for one id would
 *  share a baseline row and make "which control fired" ambiguous. */
export function openRealCorpusLiveness(repoRoot: string, arms: readonly RealCorpusLivenessArm[]): RealCorpusLivenessRunner {
  const ids = arms.map((arm) => arm.policy.id);
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicated.length > 0) {
    throw new Error(`real-corpus liveness: more than one arm for ${[...new Set(duplicated)].join(", ")} — one arm per policy`);
  }
  const policies = arms.map((arm) => arm.policy);
  const reviewedGrants = reviewedGrantsFor(policies);
  let corpus: Project | undefined;
  // Set when an arm could not put the corpus back: every later arm would then measure a tree that is not the
  // real one, and must refuse rather than report a verdict about it.
  let damagedBy: string | undefined;
  const project = (): Project => {
    if (damagedBy !== undefined) {
      throw new Error(`real-corpus liveness: ${damagedBy}'s arm failed to restore the shared corpus, so no later verdict describes the real tree`);
    }
    corpus ??= projectCtx(repoRoot).project;
    return corpus;
  };
  const pass = (selected: readonly GatePolicy[]): PassResult =>
    runPolicyPass({ knownPolicies: policies, policies: selected, root: repoRoot, project: project(), reviewedGrants, failOnWarnings: false });

  const proveOverlaid = (loaded: Project, arm: RealCorpusLivenessArm): readonly string[] => {
    applyOverlays(loaded, repoRoot, arm);
    const live = pass([arm.policy]);
    expect(refusals(live), `${arm.policy.id}: the OVERLAID run refused, so its verdict is not a measurement`).toEqual([]);
    const messages = inScope(live, arm);
    const outOfScope = JSON.stringify(live.authority.effectiveFindings.map(({ file, message }) => ({ file, message })));
    expect(
      messages.length,
      `${arm.policy.id} reported NOTHING for a real-corpus positive control (${arm.overlays.map((overlay) => `${overlay.kind} ${overlay.path}`).join(", ")}) — it is silent when the tree is clean AND silent when it is broken (#2149). Effective findings outside the arm's scope: ${outOfScope}`,
    ).toBeGreaterThan(0);
    expect(messages.join("\n"), `${arm.policy.id}: the control fired, but not with the expected verdict`).toContain(arm.messageIncludes);
    return messages;
  };
  const restoreOrDamage = (loaded: Project, originals: Originals, arm: RealCorpusLivenessArm): void => {
    try {
      restoreOriginals(loaded, originals);
    } catch (error) {
      damagedBy = arm.policy.id;
      throw error;
    }
  };

  return {
    assertBaseline: (): readonly string[] => {
      const baseline = pass(policies);
      expect(refusals(baseline), "the shared BASELINE pass refused, so its silence is not evidence").toEqual([]);
      const speaking = Object.fromEntries(arms.map((arm) => [arm.policy.id, inScope(baseline, arm)] as const).filter(([, messages]) => messages.length > 0));
      expect(speaking, "these policies already report in their arm's scope before any overlay, so the overlay proves nothing").toEqual({});
      return baseline.policies.map((result) => result.id);
    },
    assertArm: (arm: RealCorpusLivenessArm): readonly string[] => {
      const loaded = project();
      const originals = captureOriginals(loaded, repoRoot, arm);
      try {
        return proveOverlaid(loaded, arm);
      } finally {
        restoreOrDamage(loaded, originals, arm);
      }
    },
  };
}
