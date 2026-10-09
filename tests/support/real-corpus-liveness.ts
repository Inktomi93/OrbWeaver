// Real-corpus liveness uses verify's shared project and virtual interventions only.
// Each policy sees exactly its own ordered overlays; identical interventions may share a pass.
// Shared failures retain their original error; restoration failure also forbids independent controls.
import { existsSync, readFileSync } from "node:fs";
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { createWorkspaceResolutionCache } from "@orb/tooling/_shared/ts-workspace-resolution";
import type { GatePolicy } from "@orb/tooling/verify";
import { resourceRequestIdentity, reviewedGrantsFor, runPolicyPass } from "@orb/tooling/verify";
import type { Project } from "ts-morph";
import { expect } from "./fixtures.ts";

type LivenessResourceOptions = NonNullable<Parameters<typeof runPolicyPass>[0]["resourceOptions"]>;
type InstalledPackageTextOverlay = NonNullable<LivenessResourceOptions["installedPackageTextOverlays"]>[number];
type TrackedFileModeOverlay = NonNullable<LivenessResourceOptions["trackedFileModeOverlays"]>[number];

/** The intervention kind determines whether findings must name its path or may span the whole run. */
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
      /** One exact edit of an EXISTING project file: the planted defect is a member added to a real declaration
       *  (a field on a real interface, a code on a real tuple), which no new file can express and a whole-file
       *  `neutralise` would bury under every other change. `search` must occur exactly once, or the arm throws.
       *  The finding must land AT THAT PATH, as for ADD. */
      readonly kind: "edit";
      readonly path: string;
      readonly replace: readonly [string, string];
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
    }
  | {
      readonly kind: "resource";
      readonly path: string;
      /** `[search, replacement]` on the EXISTING file's disk text, for a subject no append can reach (a JSON
       *  document, a config's one array). `search` must occur EXACTLY ONCE, or the arm throws: an edit that
       *  matched nothing, or matched somewhere else too, would plant something other than what it states. */
      readonly replace: readonly [string, string];
    }
  | {
      readonly kind: "resource";
      /** A file, or a directory, taken out of every ResourceHost view (the reader's own deletion). */
      readonly path: string;
      readonly delete: true;
    }
  | ({ readonly kind: "installed-package" } & InstalledPackageTextOverlay)
  | ({ readonly kind: "tracked-mode" } & TrackedFileModeOverlay);

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
  /** `true` for a REVIEWED-GRANT policy whose EVERY report on the real tree is licensed and whose reports
   *  cannot be multiplied by any overlay (`css-family-direct-client-mechanism` reports exactly three
   *  hardcoded recipes, all granted), so no new finding can ever be planted. Its liveness is GRANT
   *  CONSUMPTION, the channel verify itself uses: on the real tree every central grant for the policy must
   *  be consumed (a dead policy consumes none, which is precisely the `stale-reviewed-grant` alarm), and
   *  with the overlay taking the licensed subject away those grants must go STALE, so consumption is shown
   *  to come from the policy reading that subject. `messageIncludes` then matches the stale alarms. */
  readonly grantConsumption?: true;
  /** Paths, beyond the arm's own overlay paths, where the planted defect is REPORTED — for a policy that
   *  anchors its finding on the subject's owner rather than on the planted file (a DevTools asset reported
   *  at its `pin.json`, a stray file reported at its feature DIRECTORY). Still a path scope: the baseline
   *  must be silent there too, so a finding the tree already carries at that path is refused. */
  readonly reportsAt?: readonly string[];
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
  /** The `stale-reviewed-grant` alarms the pass raised for the arm's policy, as `<grant id>: <message>`. */
  readonly staleGrants: readonly string[];
}

/** The runner over ONE shared corpus. Heavy work is lazy: nothing loads until the first call, so declaring
 *  the runner at module scope costs a test file nothing. */
export interface RealCorpusLivenessRunner {
  /** Measure refusal-free silence and grant consumption in one shared baseline pass.
   *  Only add-only controls without explicit report anchors have structurally absent assertion scopes.
   *  Returns the measured policy ids so callers can verify that no required baseline was omitted. */
  assertBaseline: () => readonly string[];
  /** The arms `assertBaseline` measures. */
  baselineArms: () => readonly RealCorpusLivenessArm[];
  /** Every arm's overlaid verdict, from the planned batches (`planLivenessBatches`), proved ONCE and kept.
   *  `onBatch` hears each batch as it settles: the whole proof outlasts the test supervisor's no-output
   *  ceiling, and one line per batch keeps a hung batch the only thing that ceiling can catch. */
  proveAll: (
    onBatch?: (progress: LivenessBatchProgress) => void,
    onBatchStart?: (index: number, policyIds: readonly string[]) => void,
  ) => ReadonlyMap<string, RealCorpusArmVerdict>;
  /** One arm's verdict out of `proveAll`. */
  verdict: (arm: RealCorpusLivenessArm) => RealCorpusArmVerdict;
  /** Explicit controls, partitioned by identical intervention, proved now and not kept. */
  proveBatch: (batch: readonly RealCorpusLivenessArm[]) => ReadonlyMap<string, RealCorpusArmVerdict>;
}

export interface LivenessPassMeasurement {
  readonly preparationMs: number;
  readonly overlayMs: number;
  readonly executionMs: number;
  readonly restorationMs: number;
  /** Existing runtime timings include lazy compiler work performed inside policy and fact hooks. */
  readonly pass: PassResult["timing"];
  readonly policies: readonly Pick<PassResult["policies"][number], "id" | "timing">[];
  readonly facts: readonly Pick<PassResult["facts"][number], "id" | "timing">[];
}

export interface LivenessBatchProgress {
  readonly index: number;
  readonly of: number;
  readonly arms: readonly string[];
  readonly ms: number;
  readonly passes: number;
  readonly measurements: readonly LivenessPassMeasurement[];
}

type PassResult = ReturnType<typeof runPolicyPass>;

interface MeasuredPass {
  readonly result: PassResult;
  readonly measurement: LivenessPassMeasurement;
}

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
  const wholeRun = arm.overlays.some(
    (overlay) =>
      overlay.kind === "neutralise" ||
      overlay.kind === "remove" ||
      overlay.kind === "installed-package" ||
      (overlay.kind === "resource" && "delete" in overlay),
  );
  const reported = arm.granted === true ? result.authority.grantedFindings.map(({ finding }) => finding) : result.authority.effectiveFindings;
  return (
    reported
      .filter((finding) => finding.policyId === arm.policy.id)
      // A blindness tripwire anchors its finding on a CONSTANT, not on the file whose subject vanished, so
      // scoping a `neutralise`/`remove` arm to the touched path would assert on an empty set forever.
      .filter(
        (finding) =>
          wholeRun ||
          arm.overlays.some((overlay) => overlay.kind !== "installed-package" && overlay.path === finding.file) ||
          (arm.reportsAt ?? []).includes(finding.file),
      )
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
function captureOverlayOriginals(project: Project, repoRoot: string, arm: RealCorpusLivenessArm, overlay: RealCorpusOverlay): Originals {
  if (overlay.kind === "resource" || overlay.kind === "installed-package" || overlay.kind === "tracked-mode") {
    // Resource-backed overlays never touch the project: they are handed to the pass's ResourceHost and die with it.
    return new Map();
  }
  if (overlay.kind === "remove") {
    return removedOriginals(project, repoRoot, arm, overlay.path);
  }
  const absolute = `${repoRoot}/${overlay.path}`;
  const original = project.getSourceFile(absolute)?.getFullText();
  if ((overlay.kind === "neutralise" || overlay.kind === "edit") && original === undefined) {
    throw new Error(
      `${arm.policy.id}: neutralise overlay ${overlay.path} is not in the structure run's corpus — the arm would ADD a file rather than blind the tripwire, and would then pass for the wrong reason.`,
    );
  }
  if (overlay.kind === "add" && original !== undefined) {
    throw new Error(`${arm.policy.id}: add overlay ${overlay.path} already EXISTS in the corpus — use \`neutralise\`, or pick an unused path.`);
  }
  return new Map([[absolute, original]]);
}

function captureOriginals(project: Project, repoRoot: string, arm: RealCorpusLivenessArm): Originals {
  const originals = new Map<string, string | undefined>();
  for (const overlay of arm.overlays) {
    for (const [absolute, original] of captureOverlayOriginals(project, repoRoot, arm, overlay)) {
      originals.set(absolute, original);
    }
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
    } else if (overlay.kind === "edit") {
      const absolute = `${repoRoot}/${overlay.path}`;
      replaceSourceFile(project, absolute, editedText(project.getSourceFileOrThrow(absolute).getFullText(), arm, overlay.path, overlay.replace));
    } else if (overlay.kind !== "resource" && overlay.kind !== "installed-package" && overlay.kind !== "tracked-mode") {
      replaceSourceFile(project, `${repoRoot}/${overlay.path}`, overlay.source);
    }
  }
}

/** One exact edit, refusing a search text that matches anything but once — an edit that matched nothing, or
 *  matched somewhere else too, would plant something other than what the arm states. */
function editedText(text: string, arm: RealCorpusLivenessArm, path: string, [search, replacement]: readonly [string, string]): string {
  const occurrences = text.split(search).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${arm.policy.id}: the edit of ${path} must match its search text exactly once, and matched ${String(occurrences)} times`);
  }
  return text.replace(search, () => replacement);
}

type ResourceOverlayEntry = Extract<RealCorpusOverlay, { readonly kind: "resource" }>;

/** One resource overlay's text. An `append` names a file that must already exist on disk: appending to
 *  nothing would plant a whole new file and pass for the wrong reason. */
function resourceText(repoRoot: string, arm: RealCorpusLivenessArm, entry: ResourceOverlayEntry): string | null {
  if ("delete" in entry) {
    return null;
  }
  if ("source" in entry) {
    return entry.source;
  }
  const absolute = `${repoRoot}/${entry.path}`;
  if (!existsSync(absolute)) {
    throw new Error(`${arm.policy.id}: resource overlay edits ${entry.path}, which is not on disk`);
  }
  const text = readFileSync(absolute, "utf8");
  if ("append" in entry) {
    return `${text}${entry.append}`;
  }
  return editedText(text, arm, entry.path, entry.replace);
}

/** The ResourceHost overlay a batch's `resource` overlays make, keyed by repo-relative path. */
function resourceOverlay(repoRoot: string, arms: readonly RealCorpusLivenessArm[]): Readonly<Record<string, string | null>> {
  const overlay: Record<string, string | null> = {};
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

/** Exact installed-text substitutions for one pass. Two controls cannot own one request identity. */
function installedPackageTextOverlays(arms: readonly RealCorpusLivenessArm[]): readonly InstalledPackageTextOverlay[] {
  const overlays = new Map<string, InstalledPackageTextOverlay>();
  for (const arm of arms) {
    for (const entry of arm.overlays.filter(
      (candidate): candidate is Extract<RealCorpusOverlay, { readonly kind: "installed-package" }> => candidate.kind === "installed-package",
    )) {
      const key = resourceRequestIdentity({ kind: "installed-package", ...entry.request });
      if (overlays.has(key)) {
        throw new Error(`real-corpus liveness: two installed-package overlays in one pass name ${key}`);
      }
      overlays.set(key, { request: { ...entry.request }, source: entry.source });
    }
  }
  return [...overlays.values()];
}

/** Candidate-index executable-bit substitutions for one pass. One path has one owner. */
function trackedFileModeOverlays(arms: readonly RealCorpusLivenessArm[]): readonly TrackedFileModeOverlay[] {
  const overlays = new Map<string, TrackedFileModeOverlay>();
  for (const arm of arms) {
    for (const entry of arm.overlays.filter(
      (candidate): candidate is Extract<RealCorpusOverlay, { readonly kind: "tracked-mode" }> => candidate.kind === "tracked-mode",
    )) {
      if (overlays.has(entry.path)) {
        throw new Error(`real-corpus liveness: two tracked-mode overlays in one pass name ${entry.path}`);
      }
      overlays.set(entry.path, { path: entry.path, executable: entry.executable });
    }
  }
  return [...overlays.values()];
}

function resourceOptions(repoRoot: string, arms: readonly RealCorpusLivenessArm[]): LivenessResourceOptions | undefined {
  const overlay = resourceOverlay(repoRoot, arms);
  const installed = installedPackageTextOverlays(arms);
  const trackedModes = trackedFileModeOverlays(arms);
  return Object.keys(overlay).length === 0 && installed.length === 0 && trackedModes.length === 0
    ? undefined
    : {
        ...(Object.keys(overlay).length === 0 ? {} : { overlay }),
        ...(installed.length === 0 ? {} : { installedPackageTextOverlays: installed }),
        ...(trackedModes.length === 0 ? {} : { trackedFileModeOverlays: trackedModes }),
      };
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

function needsMeasuredBaseline(arm: RealCorpusLivenessArm): boolean {
  return arm.overlays.some((overlay) => overlay.kind !== "add") || (arm.reportsAt?.length ?? 0) > 0;
}

// Preserve order: edits to the same source can depend on an earlier edit.
function overlayKey(arm: RealCorpusLivenessArm): string {
  return JSON.stringify(arm.overlays);
}

/** Share only identical interventions; report locations do not reveal a policy's input dependencies. */
export function planLivenessBatches(arms: readonly RealCorpusLivenessArm[]): readonly (readonly RealCorpusLivenessArm[])[] {
  const batches = new Map<string, RealCorpusLivenessArm[]>();
  for (const arm of arms) {
    const key = overlayKey(arm);
    const batch = batches.get(key);
    if (batch === undefined) {
      batches.set(key, [arm]);
    } else {
      batch.push(arm);
    }
  }
  return [...batches.values()];
}

/** Assign complete intervention batches to two independent corpora; coupled controls stay in the first. */
export function partitionLivenessArms(
  arms: readonly RealCorpusLivenessArm[],
  controlPolicyIds: ReadonlySet<string>,
): readonly [readonly RealCorpusLivenessArm[], readonly RealCorpusLivenessArm[]] {
  const partitions: [RealCorpusLivenessArm[], RealCorpusLivenessArm[]] = [[], []];
  const ordinary: (readonly RealCorpusLivenessArm[])[] = [];
  for (const batch of planLivenessBatches(arms)) {
    if (batch.some((arm) => controlPolicyIds.has(arm.policy.id))) {
      partitions[0].push(...batch);
    } else {
      ordinary.push(batch);
    }
  }
  for (const batch of ordinary) {
    const target = partitions[0].length <= partitions[1].length ? partitions[0] : partitions[1];
    target.push(...batch);
  }
  return partitions;
}

/** Refuse a full roster whose native partitions lose, duplicate, invent, or leave a policy corpus empty. */
export function assertLivenessPartitions(
  arms: readonly RealCorpusLivenessArm[],
  partitions: readonly [readonly RealCorpusLivenessArm[], readonly RealCorpusLivenessArm[]],
): void {
  const expected = arms.map((arm) => arm.policy.id).toSorted();
  const actual = partitions
    .flat()
    .map((arm) => arm.policy.id)
    .toSorted();
  if (partitions.some((partition) => partition.length === 0) || JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("real-corpus liveness: native partitions must retain every full-roster policy exactly once in nonempty corpora");
  }
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

/** The overlaid direction for a `grantConsumption` arm: the policy's grants went stale. */
function assertStaleGrants(arm: RealCorpusLivenessArm, verdict: RealCorpusArmVerdict): readonly string[] {
  expect(verdict.refusals, `${arm.policy.id}: the OVERLAID run refused, so its verdict is not a measurement`).toEqual([]);
  expect(
    verdict.staleGrants.length,
    `${arm.policy.id}: its grants stayed consumed with the licensed subject taken away, so the consumption is not the policy's own reading`,
  ).toBeGreaterThan(0);
  expect(verdict.staleGrants.join("\n"), `${arm.policy.id}: grants went stale, but not the expected one`).toContain(arm.messageIncludes);
  return verdict.staleGrants;
}

/** The overlaid direction for every other arm: the policy reported in the arm's scope, with its verdict. */
function assertReported(arm: RealCorpusLivenessArm, verdict: RealCorpusArmVerdict): readonly string[] {
  expect(verdict.refusals, `${arm.policy.id}: the OVERLAID run refused, so its verdict is not a measurement`).toEqual([]);
  expect(
    verdict.messages.length,
    `${arm.policy.id} reported NOTHING for a real-corpus positive control (${arm.overlays
      .map((overlay) => (overlay.kind === "installed-package" ? `${overlay.kind} ${JSON.stringify(overlay.request)}` : `${overlay.kind} ${overlay.path}`))
      .join(
        ", ",
      )}) — it is silent when the tree is clean AND silent when it is broken (#2149). Effective findings outside the arm's scope: ${verdict.outOfScope}`,
  ).toBeGreaterThan(0);
  expect(verdict.messages.join("\n"), `${arm.policy.id}: the control fired, but not with the expected verdict`).toContain(arm.messageIncludes);
  return verdict.messages;
}

/** Assert ONE arm's verdict — the second direction, read off whichever pass proved it. Returns the messages
 *  the assertion matched. */
export function assertArmVerdict(arm: RealCorpusLivenessArm, verdict: RealCorpusArmVerdict): readonly string[] {
  return arm.grantConsumption === true ? assertStaleGrants(arm, verdict) : assertReported(arm, verdict);
}

/** Open the ONE liveness runner over `arms`. A policy carries at most one arm: two arms for one id would
 *  share a baseline row and make "which control fired" ambiguous.
 * @param knownArms The same selected authority roster across independently executed arm partitions.
 */
export function openRealCorpusLiveness(
  repoRoot: string,
  arms: readonly RealCorpusLivenessArm[],
  knownArms: readonly RealCorpusLivenessArm[] = arms,
): RealCorpusLivenessRunner {
  const ids = arms.map((arm) => arm.policy.id);
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicated.length > 0) {
    throw new Error(`real-corpus liveness: more than one arm for ${[...new Set(duplicated)].join(", ")} — one arm per policy`);
  }
  const policies = knownArms.map((arm) => arm.policy);
  const reviewedGrants = reviewedGrantsFor(policies);
  let corpus: Project | undefined;
  const resolution = createWorkspaceResolutionCache();
  // Set when a batch could not put the corpus back: every later pass would then measure a tree that is not
  // the real one, and must refuse rather than report a verdict about it.
  let damagedBy: string | undefined;
  const project = (): Project => {
    if (damagedBy !== undefined) {
      throw new Error(`real-corpus liveness: the batch [${damagedBy}] failed to restore the shared corpus, so no later verdict describes the real tree`);
    }
    corpus ??= getWorkspace({ root: repoRoot, resolutionHost: resolution.host });
    return corpus;
  };
  const pass = (selected: readonly GatePolicy[], passResourceOptions?: LivenessResourceOptions): PassResult =>
    runPolicyPass({
      knownPolicies: policies,
      policies: selected,
      root: repoRoot,
      project: project(),
      reviewedGrants,
      failOnWarnings: false,
      ...(passResourceOptions === undefined ? {} : { resourceOptions: passResourceOptions }),
    });

  const invalidateSemantics = (loaded: Project, originals: Originals): void => {
    resolution.invalidate(originals.keys());
    if (originals.size > 0) {
      // Recreated source files can reuse script versions while the language service retains old reference results.
      loaded.getLanguageService().compilerObject.cleanupSemanticCache();
    }
  };
  const restoreOrDamage = (loaded: Project, originals: Originals, batch: readonly RealCorpusLivenessArm[]): void => {
    try {
      invalidateSemantics(loaded, originals);
      restoreOriginals(loaded, originals);
    } catch (error) {
      damagedBy = batch.map((arm) => arm.policy.id).join(", ");
      throw error;
    }
  };
  const overlaid = (batch: readonly RealCorpusLivenessArm[]): MeasuredPass => {
    const preparationStarted = performance.now();
    const loaded = project();
    const [first] = batch;
    if (first === undefined || batch.some((arm) => overlayKey(arm) !== overlayKey(first))) {
      throw new Error("real-corpus liveness: an overlaid pass requires one nonempty identical intervention");
    }
    const originals = captureOriginals(loaded, repoRoot, first);
    const preparationMs = performance.now() - preparationStarted;
    let result: PassResult;
    let overlayMs: number;
    let executionMs: number;
    let restorationMs: number;
    try {
      const overlayStarted = performance.now();
      invalidateSemantics(loaded, originals);
      applyOverlays(loaded, repoRoot, first);
      const options = resourceOptions(repoRoot, [first]);
      overlayMs = performance.now() - overlayStarted;
      const executionStarted = performance.now();
      result = pass(
        batch.map((arm) => arm.policy),
        options,
      );
      executionMs = performance.now() - executionStarted;
    } finally {
      const restorationStarted = performance.now();
      restoreOrDamage(loaded, originals, batch);
      restorationMs = performance.now() - restorationStarted;
    }
    return {
      result,
      measurement: {
        preparationMs,
        overlayMs,
        executionMs,
        restorationMs,
        pass: result.timing,
        policies: result.policies.map(({ id, timing }) => ({ id, timing })),
        facts: result.facts.map(({ id, timing }) => ({ id, timing })),
      },
    };
  };

  const proveBatch = (requested: readonly RealCorpusLivenessArm[], measurements?: LivenessPassMeasurement[]): ReadonlyMap<string, RealCorpusArmVerdict> => {
    const verdicts = new Map<string, RealCorpusArmVerdict>();
    for (const batch of planLivenessBatches(requested)) {
      const { result, measurement } = overlaid(batch);
      measurements?.push(measurement);
      for (const arm of batch) {
        verdicts.set(arm.policy.id, {
          messages: inScope(result, arm),
          refusals: refusalsFor(result, arm),
          outOfScope: JSON.stringify(
            result.authority.effectiveFindings.filter((finding) => finding.policyId === arm.policy.id).map(({ file, message }) => ({ file, message })),
          ),
          batch: batch.map((member) => member.policy.id),
          staleGrants: result.authority.authorityAlarms
            .filter((alarm) => alarm.kind === "stale-reviewed-grant" && alarm.policyId === arm.policy.id)
            .map((alarm) => ("grantId" in alarm ? `${alarm.grantId}: ${alarm.message}` : alarm.message)),
        });
      }
    }
    return verdicts;
  };

  let proved: ReadonlyMap<string, RealCorpusArmVerdict> | undefined;
  let proofFailure: (() => never) | undefined;
  let baselineFailure: (() => never) | undefined;
  const proveAll: RealCorpusLivenessRunner["proveAll"] = (onBatch, onBatchStart) => {
    if (proofFailure !== undefined) {
      return proofFailure();
    }
    try {
      if (proved === undefined) {
        const all = new Map<string, RealCorpusArmVerdict>();
        const batches = planLivenessBatches(arms);
        for (const [index, batch] of batches.entries()) {
          onBatchStart?.(
            index,
            batch.map((arm) => arm.policy.id),
          );
          const started = performance.now();
          const measurements: LivenessPassMeasurement[] = [];
          for (const [id, verdict] of proveBatch(batch, measurements)) {
            all.set(id, verdict);
          }
          onBatch?.({
            index,
            of: batches.length,
            arms: batch.map((arm) => arm.policy.id),
            ms: Math.round(performance.now() - started),
            passes: measurements.length,
            measurements,
          });
        }
        proved = all;
      }
      return proved;
    } catch (error) {
      proofFailure = (): never => {
        throw error;
      };
      throw error;
    }
  };

  return {
    assertBaseline: (): readonly string[] => {
      if (baselineFailure !== undefined) {
        return baselineFailure();
      }
      try {
        const measured = arms.filter(needsMeasuredBaseline);
        if (measured.length === 0) {
          // Every assertion scope is created by its add overlays; the dispatcher refuses an empty policy list.
          return [];
        }
        const baseline = pass(measured.map((arm) => arm.policy));
        expect(refusals(baseline), "the shared BASELINE pass refused, so its silence is not evidence").toEqual([]);
        const speaking = Object.fromEntries(
          measured.map((arm) => [arm.policy.id, inScope(baseline, arm)] as const).filter(([, messages]) => messages.length > 0),
        );
        expect(speaking, "these policies already report in their arm's scope before any overlay, so the overlay proves nothing").toEqual({});
        const consumed = new Map(baseline.authority.reviewedGrantConsumption.map(({ id, count }) => [id, count]));
        const unconsumed = Object.fromEntries(
          measured
            .filter((arm) => arm.grantConsumption === true)
            .map((arm) => {
              const grants = reviewedGrantsFor([arm.policy]).map(({ id }) => id);
              return [arm.policy.id, grants.length === 0 ? ["(no central grant to consume)"] : grants.filter((id) => (consumed.get(id) ?? 0) === 0)] as const;
            })
            .filter(([, missing]) => missing.length > 0),
        );
        expect(unconsumed, "these grant-consumption arms' policies left central grants unconsumed on the real tree — the policy is dead").toEqual({});
        return baseline.policies.map((result) => result.id);
      } catch (error) {
        baselineFailure = (): never => {
          throw error;
        };
        throw error;
      }
    },
    baselineArms: (): readonly RealCorpusLivenessArm[] => arms.filter(needsMeasuredBaseline),
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
