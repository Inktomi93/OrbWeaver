// Affected tooling qualification uses an explicit CI-event/train range when supplied, otherwise the local publish delta.
// Native changed tests join source mirror/import/policy-ID reach. Deleted inputs and executable configuration
// need conservative proof because the current import graph cannot establish their prior reach.
// The real-corpus liveness suite narrows only after proven policy reach; direct full runs retain its complete corpus.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { emitLine, warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { classifyTestFilename, looksLikeTestFilename, runtimeForTestFamily } from "@orb/tooling/_shared/test-kinds";
import { resolveMirrors } from "@orb/tooling/_shared/test-mirror";
import type { InstrumentAffectedLivenessScope, InstrumentAffectedPolicyReach, InstrumentAffectedSelection } from "../contract/instrument-affected.ts";
import { INSTRUMENT_AFFECTED_POLICIES_ENV } from "../contract/instrument-affected.ts";
import { VERIFY_TOOL_MODE_ENV, VERIFY_TOOL_MODES } from "../contract/qualification.ts";
import type { MeasurementBoundary } from "../contract/selection.ts";
import { VERIFY_BASE_ENV, VERIFY_HEAD_ENV } from "../contract/selection.ts";
import { NOTICE_MARKER } from "../contract/stage.ts";
import { encodeInstrumentAffectedPolicyIds } from "../lib/instrument-affected-liveness.ts";
import { isRunnableToolingSpec, toolingImportReach, toolingTestsNaming } from "../lib/instrument-affected-reach.ts";
import { existsRel, publishChangedPaths, resolveMeasurementBoundary, resolvePublishBase } from "../lib/repo-paths.ts";

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
  // Missing prior sources require conservative proof before this current-filesystem graph is used.
  return changed.filter((path) => path.startsWith(INSTRUMENT_SRC_PREFIX) && /\.tsx?$/u.test(path) && existsRel(path, root));
}

/** The policy ID a changed gate module carries, or undefined — the loader's filename contract. */
function policyIdOf(path: string): string | undefined {
  if (!(path.startsWith(GATES_PREFIX) && path.endsWith(TS_SUFFIX))) {
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
    return {
      sources: [],
      specs: [],
      unreachedSources: [],
      livenessScope: { kind: "full", reason: "changed paths are unknown" },
      unknown: true,
      delegatedTests: [],
    };
  }
  const unsupported = changed.find((path) => path.startsWith("tests/tooling/") && looksLikeTestFilename(path) && classifyTestFilename(path) === undefined);
  if (unsupported !== undefined) {
    throw new Error(`affected-tooling cannot qualify an unsupported test kind: ${unsupported}`);
  }
  // Deleted/renamed inputs and executable runner configuration cannot be traced through the current import graph.
  const opaque = changed.find(
    (path) =>
      ((path.startsWith(INSTRUMENT_SRC_PREFIX) || path.startsWith("tests/tooling/")) && !existsRel(path, root)) ||
      ((path.startsWith(INSTRUMENT_SRC_PREFIX) || path.startsWith("tests/tooling/")) && !/\.tsx?$/u.test(path) && !path.endsWith(".md")) ||
      (path.startsWith("tooling/") && !path.startsWith(INSTRUMENT_SRC_PREFIX) && !path.endsWith(".md")) ||
      (/^(?:scripts\/|tests\/support\/|\.claude\/hooks\/|\.github\/(?:workflows|actions)\/)/u.test(path) && !path.endsWith(".md")) ||
      (!path.includes("/") && /\.(?:[cm]?[jt]sx?|json|ya?ml)$/u.test(path)),
  );
  if (opaque !== undefined) {
    return {
      sources: [],
      specs: [],
      unreachedSources: [],
      livenessScope: { kind: "full", reason: `unbounded changed input: ${opaque}` },
      unknown: true,
      delegatedTests: [],
    };
  }
  const delegatedTests = changed.filter((path) => {
    const kind = path.startsWith("tests/tooling/") ? classifyTestFilename(path) : undefined;
    return kind !== undefined && runtimeForTestFamily(kind.definition.family) !== "vitest";
  });
  const directSpecs = changed.filter((path) => isRunnableToolingSpec(path) && existsRel(path, root));
  const sources = instrumentSources(root, changed);
  const helpers = changed.filter(
    (path) => path.startsWith("tests/tooling/") && /\.tsx?$/u.test(path) && !isRunnableToolingSpec(path) && classifyTestFilename(path) === undefined,
  );
  const subjects = [...sources, ...helpers];
  if (subjects.length === 0) {
    return {
      sources,
      specs: directSpecs.toSorted(),
      unreachedSources: [],
      livenessScope: { kind: "full", reason: "no changed instrument sources" },
      unknown: false,
      delegatedTests,
    };
  }
  const [importReach, policyReach] = toolingImportReach(root, subjects);
  const specs = new Set(directSpecs);
  const unreachedSources: string[] = [];
  const livenessSources: string[] = [];
  for (const source of subjects) {
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
    delegatedTests,
  };
}

function reportNoAffectedTooling(root: string, boundary: MeasurementBoundary | null): void {
  if (boundary !== null) {
    emitLine(`instrument-affected: no affected native tooling inputs in measured ${boundary.base}..${boundary.head}.`);
    return;
  }
  // THE EMPTY ANSWER IS ANNOUNCED IN THE ARTIFACT, NOT ONLY IN A LOG NOBODY OPENS (#2472). Since the base
  // became the real branch point, `pnpm check` ON MAIN resolves it to HEAD and this stage correctly
  // measures nothing — which is exactly the shape a reader must never mistake for coverage. The
  // `[verify-notice]` channel puts the ref, the commit and the reason into `reports/verify.json`'s
  // `notices` for this stage, where the tail block renders it beside the ✓ (contract/stage.ts).
  const base = resolvePublishBase(root);
  emitLine(
    base !== null && base.isHead
      ? `${NOTICE_MARKER} instrument-affected measured NOTHING: the merge base resolved to HEAD itself (${base.ref} @ ${base.commit.slice(0, SHORT_SHA)}), so this checkout is ON the mainline tip and has no branch to recertify. This is a fact about the checkout, not a clean bill of health for tooling/src — the whole instrument battery is \`pnpm verify --full\`.`
      : `instrument-affected: this branch changed no tooling/src source since ${base === null ? "its merge base" : `${base.ref} @ ${base.commit.slice(0, SHORT_SHA)}`} — nothing to recertify.`,
  );
}

/** `pnpm check:instrument-affected` — the stage body. */
export function runInstrumentAffected(root: string): number {
  const boundary = resolveMeasurementBoundary(root);
  const mode = inheritedProcessEnv()[VERIFY_TOOL_MODE_ENV];
  if (mode !== undefined && !VERIFY_TOOL_MODES.some((candidate) => candidate === mode)) {
    throw new Error(`${VERIFY_TOOL_MODE_ENV} must be affected or full`);
  }
  if (mode !== undefined && boundary === null) {
    throw new Error(`${VERIFY_TOOL_MODE_ENV} requires an explicit validated measurement boundary`);
  }
  if (boundary !== null) {
    emitLine(`${NOTICE_MARKER} measurement boundary: ${boundary.base}..${boundary.head}`);
  }
  const selection = selectAffectedInstrumentTests(root, mode === "full" ? null : publishChangedPaths(root, boundary));
  for (const path of selection.delegatedTests) {
    const kind = classifyTestFilename(path);
    if (kind !== undefined) {
      emitLine(`${NOTICE_MARKER} changed test ${path} is owned by ${runtimeForTestFamily(kind.definition.family)}, not affected-tooling Vitest runtime`);
    }
  }
  if (selection.unknown) {
    warn(`instrument-affected: ${selection.livenessScope.reason} — running the whole instrument battery rather than selecting nothing.`);
    return runSpecs(root, ["tests/tooling"], selection.livenessScope);
  }
  if (selection.unreachedSources.length > 0) {
    // A CHANGED INSTRUMENT THAT REACHES NO SPEC IS A FINDING, NOT A PASS. `test-presence` owns the
    // obligation; this stage would otherwise print a clean zero over the exact blindness #1967 is about.
    warn(
      `instrument-affected: ${String(selection.unreachedSources.length)} changed instrument/test input(s) reach NO spec under tests/tooling — ` +
        `${selection.unreachedSources.join(", ")}. A changed instrument with no test that reaches it is unrecertified, not clean (tooling/src/verify/gates/GATE-AUTHORING.md §8).`,
    );
    return EXIT.violations;
  }
  if (selection.sources.length === 0 && selection.specs.length === 0) {
    reportNoAffectedTooling(root, boundary);
    return EXIT.clean;
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
        [VERIFY_BASE_ENV]: undefined,
        [VERIFY_HEAD_ENV]: undefined,
        [VERIFY_TOOL_MODE_ENV]: undefined,
        [INSTRUMENT_AFFECTED_POLICIES_ENV]: livenessScope.kind === "policies" ? encodeInstrumentAffectedPolicyIds(livenessScope.policyIds) : undefined,
      }),
      stdio: "inherit",
    },
  );
  return res.status ?? EXIT.toolError;
}
