// THE AFFECTED-INSTRUMENT TEST LANE (#1967) — the family tests of the instruments THIS BRANCH CHANGED,
// run at a tier below `--full`.
//
// THE GAP IT CLOSES, read off `pnpm verify --list` rather than remembered: `structure:policy-conformance`
// runs in changed/static/push/full, so a policy's DECLARED `mustFlag`/`mustPass`/`mustRefuse` rows bind at
// every tier — but everything a declared row structurally CANNOT express runs in `tests:tooling`, which is
// `full` ONLY. That is the §4.2 production-dispatched identity arm (`waivedFindings === 1`,
// `authorityAlarms === []`), the central grant table's wrong-identity/duplicate/stale boundaries, and the
// §4.5 refusal and receipt pins. Measured cost, twice, five days each:
// `tests/tooling/verify/gates/registry-family.test.ts` red from `ab675b23b` (95 refused proof rows across
// eight policies, #1953) and `tests/tooling/static-class-consumers.int.test.ts` red from `1416f2c98`
// (#1956). Both commits ran and passed their named scoped floor; NEITHER TOUCHED A FAMILY TEST, which is
// exactly why the per-conversion floor rule — prose, "run the family test(s) you touched" — did not fire.
//
// THE #1842 PLACEMENT IS NOT REVERTED, and this row is careful to be the narrow thing rather than the
// battery: `tests:tooling` is 71 CPU-minutes over 284 files recertifying our tools, and it stays at
// `--full`. This lane runs the AFFECTED subset and nothing else, and refuses to run anything when the
// branch touched no instrument.
//
// THREE REACHES:
//   1. THE MIRROR — `tooling/src/X.ts` → `tests/tooling/X<suffix>.ts`, through the shared
//      `_shared/test-mirror.ts#resolveMirrors` the mutation probe already reads. Never re-derived here:
//      `test-layout` enforces that relation in the other direction and one spelling of it is the point.
//   2. THE IMPORT GRAPH — a data/helper module reaches every tooling spec that transitively imports it,
//      including re-exports and cycles. This is the production path for split tables such as reviewed grants.
//   3. THE GATE-ID STRING — a changed `tooling/src/verify/gates/<id>.ts` also selects every spec under
//      `tests/tooling/verify/gates/` whose TEXT contains `"<id>"`. This is load-bearing and is the whole
//      reason the mirror alone is not enough: a family test routinely lives under its WAVE's name rather
//      than its gate's (`contract-shape-wave-1.test.ts`, `simple-visitors-wave-2.test.ts`, …), so the
//      mirror maps a converted policy to a file that does not exist while its real proofs sit one
//      directory over. `.claude/rules/verify-and-gates.md` states this as a rule for humans; this is the
//      same rule with a machine behind it.
//
// THE HEAVY SHARED SUITE IS NARROWED ONLY AFTER PROVEN POLICY REACH. The source import graph also
// answers which flat gate modules import every changed source. When every source has that answer, the one
// real-corpus liveness file receives those policy IDs and runs their unchanged arms over its one shared
// corpus. A source with no policy reach, an unprovable filename↔descriptor ID, or a shared
// contract/registry/loader/pass source keeps the full roster. Direct `tests:tooling` runs receive no value
// and retain the complete roster and runner controls.
//
// THE BRANCH ANSWER, NEVER THE WORKING-TREE ONE. At `--push` the changes are COMMITTED and the working
// tree is clean, so a working-tree read selects nothing and the stage passes vacuously — the #1967 defect
// in a new costume. `publishChangedPaths` unions the merge-base diff with the working tree and returns
// `null` when it cannot answer; `null` RUNS THE WHOLE BATTERY rather than selecting nothing, because an
// uncomputable precondition that reads as "nothing changed" is a silent false clean (the bare-zero law).
//
// …AND THE BRANCH POINT IS DERIVED, NOT ASSUMED (#2472). That base used to be a hardcoded `origin/main`,
// which on this checkout — the owner pushes by hand and rarely — sat 280 commits behind local main, so
// "the instruments this branch changed" resolved to 488 `tooling/src` sources: essentially the whole
// `tests:tooling` battery #1842 deliberately moved to `--full`, run at every `static` barrier, forever.
// `lib/repo-paths.ts#resolveMergeBase` now takes the candidate base CLOSEST to HEAD, which on a real
// branch is its own fork point. `resolvePublishBase` widens ONLY the one case that derivation cannot
// answer: a checkout that IS `main` itself, with commits `origin/main` has never seen. Those are exactly
// the commits a push or a merge-train landing is about to publish, so this stage measures the gap against
// `origin/main` there instead of reporting `isHead` over unrecertified work — a push tier that always saw
// `isHead` never recertifies the instruments it is about to publish. `isHead` still reports through the
// `[verify-notice]` channel when there truly is nothing unpublished (origin/main IS the tip, or no remote
// answers at all).
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { emitLine, warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { resolveMirrors } from "@orb/tooling/_shared/test-mirror";
import type { InstrumentAffectedLivenessScope, InstrumentAffectedPolicyReach } from "../contract/instrument-affected.ts";
import { INSTRUMENT_AFFECTED_POLICIES_ENV } from "../contract/instrument-affected.ts";
import { NOTICE_MARKER } from "../contract/stage.ts";
import { encodeInstrumentAffectedPolicyIds } from "../lib/instrument-affected-liveness.ts";
import { toolingImportReach, toolingTestsNaming } from "../lib/instrument-affected-reach.ts";
import { existsRel, publishChangedPaths, resolvePublishBase } from "../lib/repo-paths.ts";

refuseDirectInvocation(import.meta.url, "pnpm verify --push  /  pnpm check:instrument-affected");

const INSTRUMENT_SRC_PREFIX = "tooling/src/";
const GATES_PREFIX = "tooling/src/verify/gates/";
const REAL_CORPUS_LIVENESS_SPEC = "tests/tooling/verify/gates/real-corpus-liveness-family.suite.repo.int.test.ts";
const TS_SUFFIX = ".ts";
const SHORT_SHA = 12;
const SHARED_LIVENESS_PATHS = new Set([
  "tooling/src/verify/index.ts",
  "tooling/src/verify/lib/harness.ts",
  "tooling/src/verify/lib/loader.ts",
  "tooling/src/verify/lib/policy-loader.ts",
  "tooling/src/verify/lib/policy-module.ts",
  "tooling/src/verify/lib/project-context.ts",
  "tooling/src/verify/lib/registry.ts",
]);
const SHARED_LIVENESS_PREFIXES = [
  "tooling/src/verify/contract/",
  "tooling/src/verify/lib/policy-pass",
  "tooling/src/verify/lib/policy-plan",
  "tooling/src/verify/lib/registry-",
] as const;

/** The instrument sources in a changed set — the only inputs that can select a family test. */
function instrumentSources(root: string, changed: readonly string[]): readonly string[] {
  // A DELETED source is filtered out deliberately: its specs go with it, and selecting a path that is not
  // there would hand vitest an operand the preflight refuses.
  return changed.filter((path) => path.startsWith(INSTRUMENT_SRC_PREFIX) && path.endsWith(TS_SUFFIX) && existsRel(path, root));
}

/** The policy ID a changed gate module carries, or undefined — the loader's filename contract. */
function policyIdOf(path: string): string | undefined {
  if (!path.startsWith(GATES_PREFIX)) {
    return;
  }
  const id = path.slice(GATES_PREFIX.length, -TS_SUFFIX.length);
  // A nested path (`gates/_proof/x.ts`) is a proof helper, not a policy: the loader's filename contract is
  // one flat `<id>.ts` under the gates directory.
  return id.includes("/") ? undefined : id;
}

function isSharedLivenessSource(path: string): boolean {
  return SHARED_LIVENESS_PATHS.has(path) || SHARED_LIVENESS_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function affectedLivenessScope(sources: readonly string[], policyReach: ReadonlyMap<string, InstrumentAffectedPolicyReach>): InstrumentAffectedLivenessScope {
  if (sources.length === 0) {
    return { kind: "full", reason: "the real-corpus liveness spec is not selected" };
  }
  const policyIds = new Set<string>();
  for (const source of sources) {
    if (isSharedLivenessSource(source)) {
      return { kind: "full", reason: `${source} is shared liveness harness, registry, or contract infrastructure` };
    }
    const reached = policyReach.get(source);
    if (reached === undefined || reached.unclassifiableGatePaths.length > 0) {
      return {
        kind: "full",
        reason: `${source} reaches gate module(s) whose authored ID cannot be proven from their basename: ${reached?.unclassifiableGatePaths.join(", ") ?? "missing reach"}`,
      };
    }
    if (reached.policyIds.length === 0) {
      return { kind: "full", reason: `${source} has no proven policy reach` };
    }
    for (const policyId of reached.policyIds) {
      policyIds.add(policyId);
    }
  }
  return { kind: "policies", policyIds: [...policyIds].toSorted() };
}

export interface InstrumentAffectedSelection {
  /** The instrument sources this branch changed. */
  readonly sources: readonly string[];
  /** The `tests/tooling/**` specs those sources reach, sorted and de-duplicated. */
  readonly specs: readonly string[];
  /** Changed sources with no mirror, import-graph or policy-family spec reach. */
  readonly unreachedSources: readonly string[];
  /** Real-corpus liveness roster to run; only proven policy reach may narrow it. */
  readonly livenessScope: InstrumentAffectedLivenessScope;
  /** Set when the branch answer was UNCOMPUTABLE: the caller must run the whole battery, never nothing. */
  readonly unknown: boolean;
}

function specsForSource(root: string, source: string, importReach: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> {
  const specs = new Set(importReach.get(source) ?? []);
  for (const mirror of resolveMirrors(root, source)) {
    specs.add(mirror);
  }
  const id = policyIdOf(source);
  if (id !== undefined) {
    for (const spec of toolingTestsNaming(root, id)) {
      specs.add(spec);
    }
  }
  return specs;
}

/** THE SELECTION, as a pure function of a changed set so the pin can drive it without a git repository. */
export function selectAffectedInstrumentTests(root: string, changed: readonly string[] | null): InstrumentAffectedSelection {
  if (changed === null) {
    return { sources: [], specs: [], unreachedSources: [], livenessScope: { kind: "full", reason: "changed paths are unknown" }, unknown: true };
  }
  const sources = instrumentSources(root, changed);
  if (sources.length === 0) {
    return { sources, specs: [], unreachedSources: [], livenessScope: { kind: "full", reason: "no changed instrument sources" }, unknown: false };
  }
  const [importReach, policyReach] = toolingImportReach(root, sources);
  const specs = new Set<string>();
  const unreachedSources: string[] = [];
  const livenessSources: string[] = [];
  for (const source of sources) {
    const sourceSpecs = specsForSource(root, source, importReach);
    if (sourceSpecs.size === 0) {
      unreachedSources.push(source);
    }
    if (sourceSpecs.has(REAL_CORPUS_LIVENESS_SPEC)) {
      livenessSources.push(source);
    }
    for (const spec of sourceSpecs) {
      specs.add(spec);
    }
  }
  return {
    sources,
    specs: [...specs].toSorted(),
    unreachedSources,
    livenessScope: affectedLivenessScope(livenessSources, policyReach),
    unknown: false,
  };
}

/** `pnpm check:instrument-affected` — the stage body. */
export function runInstrumentAffected(root: string): number {
  const selection = selectAffectedInstrumentTests(root, publishChangedPaths(root));
  if (selection.unknown) {
    warn(
      "instrument-affected: the branch's changed set could not be computed (no usable merge base, or git failed) — running the WHOLE instrument battery rather than selecting nothing, because an uncomputable precondition that reads as 'nothing changed' is a silent false clean.",
    );
    return runSpecs(root, ["tests/tooling"], selection.livenessScope);
  }
  if (selection.sources.length === 0) {
    // THE EMPTY ANSWER IS ANNOUNCED IN THE ARTIFACT, NOT ONLY IN A LOG NOBODY OPENS (#2472). Since the base
    // became the real branch point, `pnpm check` ON MAIN resolves it to HEAD and this stage correctly
    // measures nothing — which is exactly the shape a reader must never mistake for coverage. The
    // `[verify-notice]` channel puts the ref, the commit and the reason into `reports/verify.json`'s
    // `notices` for this stage, where the tail block renders it beside the ✓ (contract/stage.ts).
    // The COMPENSATING control for that inertness is the orchestrator's, not this predicate's: a merge
    // train touching `tooling/src` owes `pnpm verify --full`, the tier that runs the whole battery.
    const base = resolvePublishBase(root);
    emitLine(
      base !== null && base.isHead
        ? `${NOTICE_MARKER} instrument-affected measured NOTHING: the merge base resolved to HEAD itself (${base.ref} @ ${base.commit.slice(0, SHORT_SHA)}), so this checkout is ON the mainline tip and has no branch to recertify. This is a fact about the checkout, not a clean bill of health for tooling/src — the whole instrument battery is \`pnpm verify --full\`.`
        : `instrument-affected: this branch changed no tooling/src source since ${base === null ? "its merge base" : `${base.ref} @ ${base.commit.slice(0, SHORT_SHA)}`} — nothing to recertify.`,
    );
    return EXIT.clean;
  }
  if (selection.unreachedSources.length > 0) {
    // A CHANGED INSTRUMENT THAT REACHES NO SPEC IS A FINDING, NOT A PASS. `test-presence` owns the
    // obligation; this stage would otherwise print a clean zero over the exact blindness #1967 is about.
    warn(
      `instrument-affected: ${String(selection.unreachedSources.length)} of ${String(selection.sources.length)} changed instrument source(s) reach NO spec under tests/tooling — ` +
        `${selection.unreachedSources.join(", ")}. A changed instrument with no test that reaches it is unrecertified, not clean (tooling/src/verify/gates/GATE-AUTHORING.md §8).`,
    );
    return EXIT.violations;
  }
  const livenessDetail =
    selection.livenessScope.kind === "policies"
      ? `${String(selection.livenessScope.policyIds.length)} proven liveness policy reach(es)`
      : `full liveness roster (${selection.livenessScope.reason})`;
  emitLine(`instrument-affected: ${String(selection.sources.length)} changed source(s) → ${String(selection.specs.length)} spec(s); ${livenessDetail}.`);
  return runSpecs(root, selection.specs, selection.livenessScope);
}

function runSpecs(root: string, specs: readonly string[], livenessScope: InstrumentAffectedLivenessScope): number {
  // `--reporter=json` ALONGSIDE the default one (#2472): a CLI `--reporter` REPLACES the config's reporter
  // list, so the bare `--reporter=default` this stage used to pass meant vitest wrote no json report at
  // all. Two things depended on one existing — the supervised runner's `verdictFromReport`, which reads
  // the corpse's report to salvage a verdict after a wedge kill, and any reader trying to tell a dead
  // harness from a red after the fact — and both were getting a file that was never written.
  const res = runNicedSync(
    process.execPath,
    [`${root}/scripts/vitest-supervised.ts`, "run", ...specs, "--runtime-only", "--reporter=default", "--reporter=json"],
    {
      cwd: root,
      env: inheritedProcessEnv({
        [INSTRUMENT_AFFECTED_POLICIES_ENV]: livenessScope.kind === "policies" ? encodeInstrumentAffectedPolicyIds(livenessScope.policyIds) : undefined,
      }),
      stdio: "inherit",
    },
  );
  return res.status ?? EXIT.toolError;
}
