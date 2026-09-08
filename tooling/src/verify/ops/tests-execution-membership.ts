// The execution-membership reconciliation stage — tests-type-membership's EXECUTION-lane sibling
// (GitHub issue #22): every test file is EXECUTED by some runner, and every runner glob
// matches ≥1 file. Three directions, all proven triple-evidenced against the reference repos this program
// burned down (marinara's 10k-line hand-rolled regression layer + its server `pnpm test` globs matching
// ZERO files — silent no-op; ST's 7,300-line suite unenforced by any script; neo's workspace suite outside
// the root `pnpm test`).
//
// Speaks the repo's own 0/1/2/3 exit scheme: 0 clean · 1 violations (an unrun file, an empty-match glob, or
// a file claimed by TWO+ runtime views) · 2 tool error (a runner's own `--list` broke — a broken listing is
// not a verdict).
//
// EVIDENCE SOURCE, NOT RE-IMPLEMENTATION: rather than hand-parsing each config's glob strings (which drifts
// the instant a config changes — the exact disease this stage exists to prevent), it asks each runner its
// OWN `--list` view: `vitest list --filesOnly --json` (every execution group in one call — unit/
// integration/repository/tooling/contract/types), `playwright test --list --reporter=json -c playwright.config.ts`
// (e2e; run with `E2E_LIVE=1` so the `@live`-gated specs, which the runner reaches structurally but skips by
// grep at routine-run time, still count as "reachable" — a grep filter is a SELECTION policy, not a
// membership question), and the same `--list` against `playwright-ct.config.ts` (CT). Each `--list` also
// IS the "does this glob match anything" answer for its config — an empty result set from a runner whose
// test tree is non-empty is the marinara disease live.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { classifyTestFilename, TEST_RESOURCE_NAMES, VITEST_RUNTIME_FAMILY_GROUPS, VITEST_TYPECHECK_GROUP_NAMES } from "@orb/tooling/_shared/test-kinds";

refuseDirectInvocation(import.meta.url, "pnpm check:tests-execution-membership");

// Non-mirror trees test-layout.ts already exempts from the SOURCE-mirror requirement — `tests/support/**`
// (fixtures/factories, no runner suffix by construction) needs no membership check either; enumerated here
// for the doc trail, not because the walk special-cases it (a `.test.ts` under support/ would still need a
// runner, same as anywhere else — support/ is exempt from MIRRORING, not from EXECUTION).
const LIST_FILES_MAX_BUFFER = 67_108_864; // matches tests-type-membership's headroom for a wide listing.

type RunnerFiles = { readonly files: ReadonlySet<string> } | { readonly error: string };

// The vitest projects that actually EXECUTE a test at runtime (vitest.config.ts's `test.projects`). `types`
// is deliberately excluded: its `test.include` is `[]` (typecheck-ONLY via `typecheck.include`, no runtime
// pass — see the config's own comment on that project) — so a `.test-d.ts` file listed under `types` is not
// a second EXECUTOR of anything, and must not count toward the "claimed by two runtime views" direction
// below. The runtime execution groups (unit/integration/repository/contract/tooling) all run real
// assertions. `tooling` is the instrument battery, split out of unit+integration by #1523; `repository`
// is the resource-owning half that runs after normal groups. Membership here keeps those splits from silently orphaning a
// file: a project name missing from this set makes every file it owns read as UNRUN.
const VITEST_RUNTIME_PROJECTS: ReadonlySet<string> = new Set([...VITEST_RUNTIME_FAMILY_GROUPS, ...TEST_RESOURCE_NAMES, "tooling"]);

/** The vitest projects that run NO runtime pass (`test.include: []`, typecheck-only via
 *  `typecheck.include`) — the #1313 `.test-d.ts` split. Named, rather than "anything not in the runtime
 *  set", because the two sets TOGETHER are this stage's claim to have classified the config. */
const VITEST_TYPECHECK_PROJECTS: ReadonlySet<string> = new Set(VITEST_TYPECHECK_GROUP_NAMES);

/** Project names `vitest list` reported that this stage classifies as NEITHER runtime nor typecheck-only.
 *
 *  MEASURED FALSE CLEAN (#1842): adding the repository-resource execution group without adding it to the runtime set
 *  above left this stage GREEN — its ten files still landed in the direction-2 union (that union is every
 *  `--list` row, whatever the project), and direction 3 only reds on TWO OR MORE claims, never on ZERO. So
 *  a whole lane silently vanished from the runtime accounting while the stage printed three ✓ and a
 *  per-project line that simply did not mention it. A hardcoded classification that cannot notice a name it
 *  has never seen is exactly the marinara disease this stage exists to catch, one level up — so an
 *  unclassified project is a TOOL ERROR (the run is not a verdict), never a pass. */
export function unclassifiedVitestProjects(projectNames: Iterable<string>): readonly string[] {
  return [...new Set(projectNames)]
    .filter((name) => !(VITEST_RUNTIME_PROJECTS.has(name) || VITEST_TYPECHECK_PROJECTS.has(name)))
    .sort((a, b) => a.localeCompare(b));
}

interface VitestFilesOk {
  readonly files: ReadonlySet<string>;
  readonly runtimeByProject: ReadonlyMap<string, ReadonlySet<string>>;
  /** Every project name the listing carried — the input to `unclassifiedVitestProjects`. */
  readonly projects: ReadonlySet<string>;
}

type VitestFilesResult = VitestFilesOk | { readonly error: string };

/** Every test SOURCE file under `tests/**` carrying a runner suffix, as repo-relative posix paths (sorted).
 *  `playwright/**` carries no runner-suffixed files (harness/story modules only — CT_ROOT below covers the
 *  CT lane's `.ct.tsx` sources, which already live under `tests/`). */
function enumerateTestFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (relDir: string): void => {
    for (const entry of readdirSync(join(root, "tests", relDir), { withFileTypes: true })) {
      const rel = relDir.length === 0 ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        // Skip any node_modules under tests/ — a vendored/captured third-party tree ships its own
        // test files, which are not ours to execute and would read as unrun escapees. Generic by
        // design: the walk must not depend on WHICH fixture happens to carry a node_modules today.
        if (entry.name === "node_modules") {
          continue;
        }
        walk(rel);
      } else if (classifyTestFilename(entry.name) !== undefined) {
        out.push(`tests/${rel}`);
      }
    }
  };
  walk("");
  return out.sort((a, b) => a.localeCompare(b));
}

/** `vitest list --filesOnly --json` — every Node execution group (unit/integration/repository/tooling/
 *  contract/types) in ONE call. `--filesOnly` is load-bearing for SPEED, not just output shape — dropping it
 *  (measured live) makes `list` enumerate every individual TEST CASE across the whole tree instead of one
 *  row per file, pushing a sub-2s call past a 3-minute timeout; each row still carries `projectName`, so
 *  direction 3 below loses nothing by keeping the flag. Absolute paths; normalized to repo-relative posix. */
function vitestFiles(root: string): VitestFilesResult {
  const res = runNicedSync(process.execPath, [join(root, "node_modules", "vitest", "vitest.mjs"), "list", "--filesOnly", "--json"], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (res.status !== 0) {
    return { error: `\`vitest list --filesOnly --json\` failed (status ${String(res.status)})\n${res.stderr}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (err) {
    return { error: `\`vitest list --filesOnly --json\` produced invalid JSON: ${String(err)}` };
  }
  if (!Array.isArray(parsed)) {
    return { error: "`vitest list --filesOnly --json` did not produce an array" };
  }
  const files = new Set<string>();
  const projects = new Set<string>();
  const runtimeByProject = new Map<string, Set<string>>();
  for (const entry of parsed) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "file" in entry &&
      typeof (entry as { file: unknown }).file === "string" &&
      "projectName" in entry &&
      typeof (entry as { projectName: unknown }).projectName === "string"
    ) {
      const { file, projectName } = entry as { file: string; projectName: string };
      const rel = relative(root, file).split("\\").join("/");
      files.add(rel);
      projects.add(projectName);
      if (VITEST_RUNTIME_PROJECTS.has(projectName)) {
        const set = runtimeByProject.get(projectName) ?? new Set<string>();
        set.add(rel);
        runtimeByProject.set(projectName, set);
      }
    }
  }
  return { files, runtimeByProject, projects };
}

interface PwSuite {
  readonly specs?: readonly { readonly file: string }[];
  readonly suites?: readonly PwSuite[];
}
interface PwListJson {
  readonly suites?: readonly PwSuite[];
}

function collectPwFiles(suites: readonly PwSuite[] | undefined, out: Set<string>): void {
  if (suites === undefined) {
    return;
  }
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      out.add(spec.file);
    }
    collectPwFiles(suite.suites, out);
  }
}

/** `playwright test --list --reporter=json -c <config>` — the JSON suite tree's `specs[].file`, relative to
 *  the config's `testDir`. `testDirRel` is joined back on to normalize to repo-relative posix (playwright
 *  reports paths relative to its OWN `testDir`, not the repo root). */
function playwrightFiles(root: string, config: string, testDirRel: string, extraEnv?: Readonly<Record<string, string>>): RunnerFiles {
  const res = runNicedSync(join(root, "node_modules", ".bin", "playwright"), ["test", "--list", "--reporter=json", "-c", config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
    // biome-ignore lint/style/noProcessEnv: E2E_LIVE passthrough to the child (the @live-spec reachability probe) — greppable plain env, not config.
    env: { ...process.env, ...extraEnv },
  });
  // playwright's --list exits 1 (not 0) when a project's testMatch resolves to ZERO specs — "Error: No
  // tests found" lands in the JSON's own `errors[]`, stdout is still valid — so status alone can't gate
  // parse-worthiness, or the exact empty-glob shape this stage exists to catch would misreport as a TOOL
  // error instead of the violation it is. Only a genuinely unparseable stdout (a crash before the reporter
  // wrote anything) is a tool error.
  if (res.stdout.length === 0) {
    return { error: `\`playwright test --list -c ${config}\` failed (status ${String(res.status)})\n${res.stderr}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (err) {
    return { error: `\`playwright test --list -c ${config}\` produced invalid JSON (status ${String(res.status)}): ${String(err)}` };
  }
  const out = new Set<string>();
  collectPwFiles((parsed as PwListJson).suites, out);
  const files = new Set<string>();
  for (const rel of out) {
    files.add(`${testDirRel}/${rel}`);
  }
  return { files };
}

const FIX_HINT =
  "a test-suffixed file must be matched by the union of every runner's --list view (Vitest's configured projects, " +
  "playwright.config.ts's e2e testMatch, playwright-ct.config.ts's CT testMatch) — else it never runs " +
  "(the silent-green disease). Add it under a runner's testDir/include, or fix the mismatched suffix/path.";

const MULTI_MEMBERSHIP_FIX_HINT =
  "a file must be claimed by EXACTLY ONE runtime view — a file two views both execute runs twice (double-" +
  "counted assertions/timing/flake) or contends for the SAME describe/test name across projects. Narrow the " +
  "losing view's include/exclude so only one runtime project (or one playwright config) matches the file.";

/** The reconciliation core (exported for a proof test): the test files matched by NO runner. */
export function findUnrunFiles(testFiles: readonly string[], runnerUnion: ReadonlySet<string>): readonly string[] {
  return testFiles.filter((rel) => !runnerUnion.has(rel));
}

/** Direction 3 (exported for a proof test): a test file claimed by TWO OR MORE runtime views — every vitest
 *  RUNTIME project (never `types`, which executes nothing) plus the two playwright configs, each named as
 *  its own view so a violation prints exactly which views collided rather than just "ambiguous". One-lane-
 *  ness used to be an unverified construction property of the include/exclude sets (read by hand off
 *  `vitest list --json`'s `projectName`); this makes it a checked invariant instead. */
export function findMultiMembershipFiles(membership: ReadonlyMap<string, readonly string[]>): readonly (readonly [string, readonly string[]])[] {
  return [...membership.entries()].filter(([, views]) => views.length > 1).sort(([a], [b]) => a.localeCompare(b));
}

/** Every runtime view (each vitest runtime project + the two playwright configs) as its own named claimant,
 *  keyed by the file it claims — the input `findMultiMembershipFiles` reconciles. */
function buildRuntimeMembership(
  vitestRuntimeByProject: ReadonlyMap<string, ReadonlySet<string>>,
  e2eFiles: ReadonlySet<string>,
  ctFiles: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  const membership = new Map<string, string[]>();
  const claim = (rel: string, view: string): void => {
    const views = membership.get(rel);
    if (views === undefined) {
      membership.set(rel, [view]);
    } else {
      views.push(view);
    }
  };
  for (const [project, files] of vitestRuntimeByProject) {
    for (const rel of files) {
      claim(rel, `vitest:${project}`);
    }
  }
  for (const rel of e2eFiles) {
    claim(rel, "playwright-e2e");
  }
  for (const rel of ctFiles) {
    claim(rel, "playwright-ct");
  }
  return membership;
}

/** Prints the direction-1 (empty-view) report; returns whether it found a violation. */
function reportEmptyRunners(emptyRunners: readonly { readonly label: string }[]): boolean {
  if (emptyRunners.length === 0) {
    process.stdout.write("  ✓ every runner view matches ≥1 file\n");
    return false;
  }
  process.stdout.write(`  ✗ ${emptyRunners.length} runner view(s) matched ZERO files (a silent no-op suite):\n`);
  for (const v of emptyRunners) {
    process.stdout.write(`      · ${v.label}\n`);
  }
  return true;
}

/** Prints the direction-2 (unrun-file) report; returns whether it found a violation. */
function reportUnrunFiles(unrun: readonly string[]): boolean {
  if (unrun.length === 0) {
    process.stdout.write("  ✓ every tests/** runner-suffixed file is matched by ≥1 runner view\n");
    return false;
  }
  process.stdout.write(`  ✗ ${unrun.length} test file(s) matched by NO runner — never executed:\n`);
  for (const rel of unrun) {
    process.stdout.write(`      · ${rel}\n`);
  }
  return true;
}

/** Prints the direction-3 (multi-membership) report; returns whether it found a violation. */
function reportMultiMembership(multiMembership: readonly (readonly [string, readonly string[]])[]): boolean {
  if (multiMembership.length === 0) {
    process.stdout.write("  ✓ every claimed test file is claimed by exactly one runtime view\n");
    return false;
  }
  process.stdout.write(`  ✗ ${multiMembership.length} test file(s) claimed by TWO OR MORE runtime views:\n`);
  for (const [rel, views] of multiMembership) {
    process.stdout.write(`      · ${rel} — ${views.join(", ")}\n`);
  }
  process.stdout.write(`\n  FIX: ${MULTI_MEMBERSHIP_FIX_HINT}\n`);
  return true;
}

/** The `tests-execution-membership` verb. */
export function runTestsExecutionMembership(root: string): number {
  const vitest = vitestFiles(root);
  // playwright's e2e testMatch structurally reaches every `.spec.ts` under tests/e2e, including the
  // `@live`-tagged specs the routine `grepInvert` skips at RUN time (a selection policy, not a membership
  // question) — E2E_LIVE=1 makes --list's own collection see them too, so a `@live` spec counts as "run by
  // some runner" the same as any other, per the runner's OWN testMatch.
  const e2e = playwrightFiles(root, "playwright.config.ts", "tests/e2e", Object.fromEntries([["E2E_LIVE", "1"]]));
  const ct = playwrightFiles(root, "playwright-ct.config.ts", "tests");

  const errors = [vitest, e2e, ct].filter((r): r is { readonly error: string } => "error" in r);
  if (errors.length > 0) {
    for (const e of errors) {
      process.stderr.write(`tests-execution-membership: ${e.error}\n`);
    }
    return EXIT.toolError; // a broken --list is a broken checker, not "no violations"
  }

  const vitestFilesOk = vitest as VitestFilesOk;
  // THE CLASSIFICATION CHECK, BEFORE ANY DIRECTION RUNS: a project name this stage cannot place is not a
  // violation of the repo's test layout — it is this stage not knowing what it is looking at, and every
  // count below would be quietly short by one lane. Refuse loudly instead (exit 2).
  const unclassified = unclassifiedVitestProjects(vitestFilesOk.projects);
  if (unclassified.length > 0) {
    process.stderr.write(
      `tests-execution-membership: \`vitest list\` reported project(s) this stage cannot classify: ${unclassified.join(", ")}.\n` +
        "  Add each to VITEST_RUNTIME_PROJECTS (it runs assertions) or VITEST_TYPECHECK_PROJECTS (test.include is []) in\n" +
        "  tooling/src/verify/ops/tests-execution-membership.ts. An unclassified lane drops out of the runtime accounting\n" +
        "  silently — the per-project line simply stops mentioning it — so the verdict is withheld rather than guessed.\n",
    );
    return EXIT.toolError;
  }
  const e2eFilesOk = e2e as { readonly files: ReadonlySet<string> };
  const ctFilesOk = ct as { readonly files: ReadonlySet<string> };

  // ── direction 1: GLOB→FILE — every runner's --list view must be non-empty (an empty match is the
  // marinara silent-no-op disease: the config resolves, the runner exits 0, and NOTHING ran). ──
  const runnerViews: readonly { readonly label: string; readonly files: ReadonlySet<string> }[] = [
    { label: "vitest", files: vitestFilesOk.files },
    { label: "playwright e2e (playwright.config.ts)", files: e2eFilesOk.files },
    { label: "playwright-ct (playwright-ct.config.ts)", files: ctFilesOk.files },
  ];
  const emptyRunners = runnerViews.filter((v) => v.files.size === 0);

  // ── direction 2: FILE→RUNNER — every test-suffixed source file must land in the union of every view. ──
  const runnerUnion = new Set<string>([...vitestFilesOk.files, ...e2eFilesOk.files, ...ctFilesOk.files]);
  const testFiles = enumerateTestFiles(root);
  const unrun = findUnrunFiles(testFiles, runnerUnion);

  process.stdout.write(
    `tests-execution-membership — ${testFiles.length} test file(s) across ${runnerViews.length} runner view(s) (union: ${runnerUnion.size} file(s))\n`,
  );

  const directionsDirty = [reportEmptyRunners(emptyRunners), reportUnrunFiles(unrun)];
  if (directionsDirty.some(Boolean)) {
    process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
  }

  // ── direction 3: ONE-LANE-NESS — every test file must be claimed by EXACTLY ONE runtime view. ──
  const membership = buildRuntimeMembership(vitestFilesOk.runtimeByProject, e2eFilesOk.files, ctFilesOk.files);
  const multiMembership = findMultiMembershipFiles(membership);
  const perProjectSummary = [...vitestFilesOk.runtimeByProject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, files]) => `${project} ${files.size}`)
    .join(" · ");
  process.stdout.write(`  runtime views by project: ${perProjectSummary}\n`);
  directionsDirty.push(reportMultiMembership(multiMembership));

  return directionsDirty.some(Boolean) ? EXIT.violations : EXIT.clean;
}
