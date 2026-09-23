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
// THE OVERLAID DIRECTION IS BATCHED, BECAUSE THE TYPE PROGRAM IS THE COST (leg 2 of docs/work/0043). Every
// overlay invalidates the shared program, so one pass per arm rebuilt it once per arm — measured at 6-26s a
// `types` arm, which at the full roster is most of an hour. Instead the add-only arms share ONE overlaid
// pass: every overlay applied together, every policy run through one walker, each finding attributed by
// (policy id, overlay path). Two rules keep a shared pass honest:
//   · an arm that rewrites or removes a REAL file (`neutralise`/`remove`) asserts over the whole run and
//     changes what every other policy reads, so it never shares a pass;
//   · a policy that reports on ANOTHER member's path in the shared pass is reading that member's file, so
//     that file may be what made it speak at its own; its batched verdict is discarded and it is proved
//     ALONE (`entangledWith` names who it was entangled with). Two planted controls in the runner suite
//     hold both halves: a dead arm batched beside a live one is still named dead, and an arm that can only
//     speak BECAUSE of its batch-mate is caught by the detector and fails alone.
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
//   RESOURCE  — a file a policy reads through the ResourceHost (CSS, the token vault, any `analysis:
//               "resource"` subject), not through the ts-morph project, so no project overlay reaches it. The
//               overlay rides the production reader's OWN seam (`ResourceHostOptions.overlay`, the one
//               conformance's resource rows use): `source` is the whole text, `append` is the real file's disk
//               text plus a planted tail. The finding must land AT THAT PATH, as for ADD. It changes what every
//               policy in the pass reads, so a resource arm never shares a pass.
import { existsSync, readFileSync } from "node:fs";
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
    }
  | {
      readonly kind: "resource";
      /** Repo-relative path of a file read through the ResourceHost. */
      readonly path: string;
      /** The whole replacement (or new-file) text. */
      readonly source: string;
    }
  | {
      readonly kind: "resource";
      readonly path: string;
      /** Appended to the EXISTING file's disk text, so the arm plants into the real file without restating it. */
      readonly append: string;
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

/** What ONE arm's overlaid pass said about it, attributed by (policy id, overlay path). */
export interface RealCorpusArmVerdict {
  /** The messages in the arm's assertion scope. */
  readonly messages: readonly string[];
  /** The refusals attributable to the arm's policy (its own, its facts', and every unattributed one). */
  readonly refusals: readonly string[];
  /** The policy's effective findings anywhere in the pass, JSON — the diagnostic for an empty scope. */
  readonly outOfScope: string;
  /** The policy ids that shared the pass that produced this verdict. */
  readonly batch: readonly string[];
  /** Members whose file this arm's policy ALSO reported on in the shared pass, which forced the solo
   *  re-proof this verdict came from. Empty for a verdict proved in its batch. */
  readonly entangledWith: readonly string[];
}

/** The runner over ONE shared corpus. Heavy work is lazy: nothing loads until the first call, so declaring
 *  the runner at module scope costs a test file nothing. */
export interface RealCorpusLivenessRunner {
  /** EVERY arm's policy in ONE pass, as the structure run does: refusal-free, and silent in each arm's own
   *  assertion scope. The shared first direction. Returns the policy ids the pass RAN, so a caller can assert
   *  the denominator — a pass that silently dropped a policy would otherwise read as that policy's silence. */
  assertBaseline: () => readonly string[];
  /** Every arm's overlaid verdict, from the planned batches (`planLivenessBatches`), proved ONCE and kept. */
  proveAll: () => ReadonlyMap<string, RealCorpusArmVerdict>;
  /** One arm's verdict out of `proveAll`. */
  verdict: (arm: RealCorpusLivenessArm) => RealCorpusArmVerdict;
  /** One EXPLICIT batch, proved now and not kept — the door the runner's own controls drive. */
  proveBatch: (batch: readonly RealCorpusLivenessArm[]) => ReadonlyMap<string, RealCorpusArmVerdict>;
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
  const wholeRun = arm.overlays.some((overlay) => overlay.kind === "neutralise" || overlay.kind === "remove");
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

/** The text of every corpus file a `remove` overlay takes, keyed by absolute path. */
function removedOriginals(project: Project, repoRoot: string, arm: RealCorpusLivenessArm, path: string): ReadonlyMap<string, string> {
  const paths = removedPaths(project, repoRoot, path);
  if (paths.length === 0) {
    throw new Error(`${arm.policy.id}: remove overlay ${path} matches no file in the structure run's corpus — the arm would remove nothing.`);
  }
  return new Map(paths.map((absolute) => [absolute, project.getSourceFileOrThrow(absolute).getFullText()]));
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
    if (overlay.kind === "resource") {
      // A resource overlay never touches the project: it is handed to the pass's ResourceHost and dies with it.
      continue;
    }
    if (overlay.kind === "remove") {
      for (const [absolute, original] of removedOriginals(project, repoRoot, arm, overlay.path)) {
        originals.set(absolute, original);
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

/** Put `text` at `absolute` as a NEW SourceFile object, never an edit of the one already there.
 *
 *  Shared readers cache per SourceFile OBJECT (`lib/comment-spans.ts#blankTsComments` keys a WeakMap on it,
 *  on the stated premise that gates never mutate the project). An in-place `replaceWithText` keeps the
 *  object, so the next pass reads the cached text of the PREVIOUS content: measured on
 *  `floorless-control-vocabulary-health`, whose neutralised `variants.ts` still read as the real file and
 *  the arm reported nothing. A restore done in place would leak the overlay into every later pass the same
 *  way. A fresh object has no cache entry. */
function replaceSourceFile(project: Project, absolute: string, text: string): void {
  const existing = project.getSourceFile(absolute);
  if (existing !== undefined) {
    project.removeSourceFile(existing);
  }
  // `overwrite` because ts-morph's existence check also consults the DISK, where the file still is.
  project.createSourceFile(absolute, text, { overwrite: true });
}

function applyOverlays(project: Project, repoRoot: string, arm: RealCorpusLivenessArm): void {
  for (const overlay of arm.overlays) {
    if (overlay.kind === "remove") {
      for (const absolute of removedPaths(project, repoRoot, overlay.path)) {
        project.removeSourceFile(project.getSourceFileOrThrow(absolute));
      }
    } else if (overlay.kind !== "resource") {
      replaceSourceFile(project, `${repoRoot}/${overlay.path}`, overlay.source);
    }
  }
}

type ResourceOverlayEntry = Extract<RealCorpusOverlay, { readonly kind: "resource" }>;

/** One resource overlay's text. An `append` names a file that must already exist on disk: appending to
 *  nothing would plant a whole new file and pass for the wrong reason. */
function resourceText(repoRoot: string, arm: RealCorpusLivenessArm, entry: ResourceOverlayEntry): string {
  if (!("append" in entry)) {
    return entry.source;
  }
  const absolute = `${repoRoot}/${entry.path}`;
  if (!existsSync(absolute)) {
    throw new Error(`${arm.policy.id}: resource overlay appends to ${entry.path}, which is not on disk`);
  }
  return `${readFileSync(absolute, "utf8")}${entry.append}`;
}

/** The ResourceHost overlay a batch's `resource` overlays make, keyed by repo-relative path. */
function resourceOverlay(repoRoot: string, arms: readonly RealCorpusLivenessArm[]): Readonly<Record<string, string>> {
  const overlay: Record<string, string> = {};
  for (const arm of arms) {
    for (const entry of arm.overlays.filter((candidate): candidate is ResourceOverlayEntry => candidate.kind === "resource")) {
      if (entry.path in overlay) {
        throw new Error(`real-corpus liveness: two resource overlays in one pass name ${entry.path}`);
      }
      overlay[entry.path] = resourceText(repoRoot, arm, entry);
    }
  }
  return overlay;
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
    } else {
      replaceSourceFile(project, absolute, original);
    }
  }
}

/** Can this arm share an overlaid pass? Only when every overlay ADDS a new file. A `neutralise`/`remove`
 *  arm rewrites or takes away a REAL file every other policy in the pass also reads, and asserts over the
 *  whole run — so anything another arm plants could land in its scope. It always runs alone. */
function isBatchable(arm: RealCorpusLivenessArm): boolean {
  return arm.overlays.every((overlay) => overlay.kind === "add");
}

/** An arm's overlay set, canonically spelled: two arms with one key plant exactly the same thing. */
function overlayKey(arm: RealCorpusLivenessArm): string {
  return JSON.stringify(arm.overlays.map((overlay) => JSON.stringify(overlay)).toSorted());
}

/** Pack the arms into overlaid passes: every whole-run arm alone, the add-only arms together, a new batch
 *  opening only when an add path would repeat (two arms cannot own one path). Declaration order is kept, so
 *  the plan is deterministic. */
export function planLivenessBatches(arms: readonly RealCorpusLivenessArm[]): readonly (readonly RealCorpusLivenessArm[])[] {
  const shared: RealCorpusLivenessArm[][] = [];
  // Rewriting arms share a pass ONLY with arms carrying the IDENTICAL overlay set (the three tier-home
  // tripwires all take the markdown home away): the pass then plants nothing any member did not plant alone,
  // so each verdict is exactly its solo verdict, for one program rebuild instead of three.
  const solo = new Map<string, RealCorpusLivenessArm[]>();
  for (const arm of arms) {
    if (!isBatchable(arm)) {
      const key = overlayKey(arm);
      solo.set(key, [...(solo.get(key) ?? []), arm]);
      continue;
    }
    const paths = new Set(arm.overlays.map((overlay) => overlay.path));
    const fits = shared.find((batch) => batch.every((member) => member.overlays.every((overlay) => !paths.has(overlay.path))));
    if (fits === undefined) {
      shared.push([arm]);
    } else {
      fits.push(arm);
    }
  }
  return [...shared, ...solo.values()];
}

/** The refusals that belong to ONE arm's policy in a shared pass. A fact refusal belongs to every policy that
 *  reads the fact, and an authority refusal with no policy id belongs to everyone — neither may be dropped. */
function refusalsFor(result: PassResult, arm: RealCorpusLivenessArm): readonly string[] {
  const id = arm.policy.id;
  const facts = new Set(arm.policy.facts.map((fact) => fact.id));
  return [
    ...result.toolErrors.filter((error) => error.policyId === id).map((error) => JSON.stringify(error)),
    ...result.factErrors.filter((error) => facts.has(error.factId)).map((error) => JSON.stringify(error)),
    ...result.authority.toolErrors.filter((error) => error.policyId === undefined || error.policyId === id).map((error) => JSON.stringify(error)),
    ...result.authority.withheldPolicyIds.filter((withheld) => withheld === id),
  ];
}

/** Where a policy reported in a pass, over BOTH authority channels — the entanglement detector's input. */
function reportedPaths(result: PassResult, policyId: string): ReadonlySet<string> {
  return new Set(
    [...result.authority.effectiveFindings, ...result.authority.grantedFindings.map(({ finding }) => finding)]
      .filter((finding) => finding.policyId === policyId)
      .map((finding) => finding.file),
  );
}

/** Assert ONE arm's verdict — the second direction, read off whichever pass proved it. Returns the in-scope
 *  messages. */
export function assertArmVerdict(arm: RealCorpusLivenessArm, verdict: RealCorpusArmVerdict): readonly string[] {
  expect(verdict.refusals, `${arm.policy.id}: the OVERLAID run refused, so its verdict is not a measurement`).toEqual([]);
  expect(
    verdict.messages.length,
    `${arm.policy.id} reported NOTHING for a real-corpus positive control (${arm.overlays.map((overlay) => `${overlay.kind} ${overlay.path}`).join(", ")}) — it is silent when the tree is clean AND silent when it is broken (#2149). Effective findings outside the arm's scope: ${verdict.outOfScope}`,
  ).toBeGreaterThan(0);
  expect(verdict.messages.join("\n"), `${arm.policy.id}: the control fired, but not with the expected verdict`).toContain(arm.messageIncludes);
  return verdict.messages;
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
  // Set when a batch could not put the corpus back: every later pass would then measure a tree that is not
  // the real one, and must refuse rather than report a verdict about it.
  let damagedBy: string | undefined;
  const project = (): Project => {
    if (damagedBy !== undefined) {
      throw new Error(`real-corpus liveness: the batch [${damagedBy}] failed to restore the shared corpus, so no later verdict describes the real tree`);
    }
    corpus ??= projectCtx(repoRoot).project;
    return corpus;
  };
  const pass = (selected: readonly GatePolicy[], overlay: Readonly<Record<string, string>> = {}): PassResult =>
    runPolicyPass({
      knownPolicies: policies,
      policies: selected,
      root: repoRoot,
      project: project(),
      reviewedGrants,
      failOnWarnings: false,
      ...(Object.keys(overlay).length === 0 ? {} : { resourceOptions: { overlay } }),
    });

  const restoreOrDamage = (loaded: Project, originals: Originals, batch: readonly RealCorpusLivenessArm[]): void => {
    try {
      restoreOriginals(loaded, originals);
    } catch (error) {
      damagedBy = batch.map((arm) => arm.policy.id).join(", ");
      throw error;
    }
  };
  const overlaid = (batch: readonly RealCorpusLivenessArm[]): PassResult => {
    const loaded = project();
    const originals = new Map<string, string | undefined>();
    // A batch whose members all carry ONE overlay set plants it once; any other batch plants every member's.
    const [first] = batch;
    const planters = first !== undefined && batch.every((arm) => overlayKey(arm) === overlayKey(first)) ? [first] : batch;
    for (const arm of planters) {
      for (const [absolute, original] of captureOriginals(loaded, repoRoot, arm)) {
        if (originals.has(absolute)) {
          throw new Error(`real-corpus liveness: two arms in one batch touch ${absolute} — a path has one owner per pass`);
        }
        originals.set(absolute, original);
      }
    }
    try {
      for (const arm of planters) {
        applyOverlays(loaded, repoRoot, arm);
      }
      return pass(
        batch.map((arm) => arm.policy),
        resourceOverlay(repoRoot, planters),
      );
    } finally {
      restoreOrDamage(loaded, originals, batch);
    }
  };

  const proveBatch = (batch: readonly RealCorpusLivenessArm[]): ReadonlyMap<string, RealCorpusArmVerdict> => {
    const result = overlaid(batch);
    const verdicts = new Map<string, RealCorpusArmVerdict>();
    for (const arm of batch) {
      // THE ENTANGLEMENT DETECTOR. An arm's finding counts only at its own paths, but a policy that ALSO
      // reported at another member's path is reading that member's file — which means the other file can be
      // what made it speak at its own. Such an arm's batched verdict is not evidence; it is proved again ALONE.
      const reported = reportedPaths(result, arm.policy.id);
      const entangledWith = batch
        // A path the arm planted ITSELF is its own scope, whoever else planted it too.
        .filter(
          (other) => other !== arm && other.overlays.some((overlay) => reported.has(overlay.path) && !arm.overlays.some((own) => own.path === overlay.path)),
        )
        .map((other) => other.policy.id);
      if (entangledWith.length > 0) {
        const alone = proveBatch([arm]).get(arm.policy.id);
        if (alone === undefined) {
          throw new Error(`real-corpus liveness: ${arm.policy.id}'s solo re-proof produced no verdict`);
        }
        verdicts.set(arm.policy.id, { ...alone, entangledWith });
        continue;
      }
      verdicts.set(arm.policy.id, {
        messages: inScope(result, arm),
        refusals: refusalsFor(result, arm),
        outOfScope: JSON.stringify(
          result.authority.effectiveFindings.filter((finding) => finding.policyId === arm.policy.id).map(({ file, message }) => ({ file, message })),
        ),
        batch: batch.map((member) => member.policy.id),
        entangledWith: [],
      });
    }
    return verdicts;
  };

  let proved: ReadonlyMap<string, RealCorpusArmVerdict> | undefined;
  const proveAll = (): ReadonlyMap<string, RealCorpusArmVerdict> => {
    if (proved === undefined) {
      const all = new Map<string, RealCorpusArmVerdict>();
      for (const batch of planLivenessBatches(arms)) {
        for (const [id, verdict] of proveBatch(batch)) {
          all.set(id, verdict);
        }
      }
      proved = all;
    }
    return proved;
  };

  return {
    assertBaseline: (): readonly string[] => {
      const baseline = pass(policies);
      expect(refusals(baseline), "the shared BASELINE pass refused, so its silence is not evidence").toEqual([]);
      const speaking = Object.fromEntries(arms.map((arm) => [arm.policy.id, inScope(baseline, arm)] as const).filter(([, messages]) => messages.length > 0));
      expect(speaking, "these policies already report in their arm's scope before any overlay, so the overlay proves nothing").toEqual({});
      return baseline.policies.map((result) => result.id);
    },
    proveAll,
    verdict: (arm: RealCorpusLivenessArm): RealCorpusArmVerdict => {
      const found = proveAll().get(arm.policy.id);
      if (found === undefined) {
        throw new Error(`real-corpus liveness: ${arm.policy.id} is not an arm this runner was opened with`);
      }
      return found;
    },
    proveBatch,
  };
}
