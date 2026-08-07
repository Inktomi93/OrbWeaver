// The execution-membership reconciliation stage — tests-type-membership's EXECUTION-lane sibling
// (#22, docs/retro-workboard.md): every test file is EXECUTED by some runner, and every runner glob
// matches ≥1 file. Two directions, both proven triple-evidenced against the reference repos this program
// burned down (marinara's 10k-line hand-rolled regression layer + its server `pnpm test` globs matching
// ZERO files — silent no-op; ST's 7,300-line suite unenforced by any script; neo's workspace suite outside
// the root `pnpm test`).
//
// Speaks the repo's own 0/1/2/3 exit scheme: 0 clean · 1 violations (an unrun file or an empty-match glob)
// · 2 tool error (a runner's own `--list` broke — a broken listing is not a verdict).
//
// EVIDENCE SOURCE, NOT RE-IMPLEMENTATION: rather than hand-parsing each config's glob strings (which drifts
// the instant a config changes — the exact disease this stage exists to prevent), it asks each runner its
// OWN `--list` view: `vitest list --filesOnly --json` (all six projects in one call — unit/integration/
// integration-serial/contract/types/parity), `playwright test --list --reporter=json -c playwright.config.ts`
// (e2e; run with `E2E_LIVE=1` so the `@live`-gated specs, which the runner reaches structurally but skips by
// grep at routine-run time, still count as "reachable" — a grep filter is a SELECTION policy, not a
// membership question), and the same `--list` against `playwright-ct.config.ts` (CT). Each `--list` also
// IS the "does this glob match anything" answer for its config — an empty result set from a runner whose
// test tree is non-empty is the shortcut pattern live.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

// Most-specific suffix first (so `.int.test.ts` isn't mis-stripped as `.test.ts`) — mirrors test-layout.ts's
// KIND list (the ONE canonical suffix taxonomy; `.suite.*` files are covered by their base suffix's runner,
// same lane, just a mirror-exemption — no separate runner glob to enumerate here).
const RUNNER_SUFFIXES: readonly string[] = [".int.test.ts", ".contract.test.ts", ".parity.test.ts", ".test-d.ts", ".ct.tsx", ".spec.ts", ".test.ts"];

// Non-mirror trees test-layout.ts already exempts from the SOURCE-mirror requirement — `tests/support/**`
// (fixtures/factories, no runner suffix by construction) needs no membership check either; enumerated here
// for the doc trail, not because the walk special-cases it (a `.test.ts` under support/ would still need a
// runner, same as anywhere else — support/ is exempt from MIRRORING, not from EXECUTION).
const LIST_FILES_MAX_BUFFER = 67_108_864; // matches tests-type-membership's headroom for a wide listing.

type RunnerFiles = { readonly files: ReadonlySet<string> } | { readonly error: string };

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
      } else if (RUNNER_SUFFIXES.some((s) => entry.name.endsWith(s))) {
        out.push(`tests/${rel}`);
      }
    }
  };
  walk("");
  return out.sort((a, b) => a.localeCompare(b));
}

/** `vitest list --filesOnly --json` — the six node projects (unit/integration/integration-serial/contract/
 *  types/parity) in ONE call. Absolute paths; normalized to repo-relative posix. */
function vitestFiles(root: string): RunnerFiles {
  const res = spawnSync(process.execPath, [join(root, "node_modules", "vitest", "vitest.mjs"), "list", "--filesOnly", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (res.status !== 0 || typeof res.stdout !== "string") {
    return { error: `\`vitest list --filesOnly --json\` failed (status ${String(res.status)})\n${res.stderr ?? ""}` };
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
  for (const entry of parsed) {
    if (typeof entry === "object" && entry !== null && "file" in entry && typeof (entry as { file: unknown }).file === "string") {
      files.add(
        relative(root, (entry as { file: string }).file)
          .split("\\")
          .join("/"),
      );
    }
  }
  return { files };
}

type PwSuite = { readonly specs?: readonly { readonly file: string }[]; readonly suites?: readonly PwSuite[] };
type PwListJson = { readonly suites?: readonly PwSuite[] };

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
  const res = spawnSync(join(root, "node_modules", ".bin", "playwright"), ["test", "--list", "--reporter=json", "-c", config], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: LIST_FILES_MAX_BUFFER,
    // biome-ignore lint/style/noProcessEnv: E2E_LIVE passthrough to the child (the @live-spec reachability probe) — greppable plain env, not config.
    env: { ...process.env, ...extraEnv },
  });
  // playwright's --list exits 1 (not 0) when a project's testMatch resolves to ZERO specs — "Error: No
  // tests found" lands in the JSON's own `errors[]`, stdout is still valid — so status alone can't gate
  // parse-worthiness, or the exact empty-glob shape this stage exists to catch would misreport as a TOOL
  // error instead of the violation it is. Only a genuinely unparseable stdout (a crash before the reporter
  // wrote anything) is a tool error.
  if (typeof res.stdout !== "string" || res.stdout.length === 0) {
    return { error: `\`playwright test --list -c ${config}\` failed (status ${String(res.status)})\n${res.stderr ?? ""}` };
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
  "a test-suffixed file must be matched by the union of every runner's --list view (vitest's six projects, " +
  "playwright.config.ts's e2e testMatch, playwright-ct.config.ts's CT testMatch) — else it never runs " +
  "(the silent-green disease). Add it under a runner's testDir/include, or fix the mismatched suffix/path.";

/** The reconciliation core (exported for a proof test): the test files matched by NO runner. */
export function findUnrunFiles(testFiles: readonly string[], runnerUnion: ReadonlySet<string>): readonly string[] {
  return testFiles.filter((rel) => !runnerUnion.has(rel));
}

function main(): void {
  const root = process.cwd();

  const vitest = vitestFiles(root);
  // playwright's e2e testMatch structurally reaches every `.spec.ts` under tests/e2e, including the
  // `@live`-tagged specs the routine `grepInvert` skips at RUN time (a selection policy, not a membership
  // question) — E2E_LIVE=1 makes --list's own collection see them too, so a `@live` spec counts as "run by
  // some runner" the same as any other, per the runner's OWN testMatch.
  const e2e = playwrightFiles(root, "playwright.config.ts", "tests/e2e", { E2E_LIVE: "1" });
  const ct = playwrightFiles(root, "playwright-ct.config.ts", "tests");

  const errors = [vitest, e2e, ct].filter((r): r is { readonly error: string } => "error" in r);
  if (errors.length > 0) {
    for (const e of errors) {
      process.stderr.write(`tests-execution-membership: ${e.error}\n`);
    }
    process.exit(EXIT_TOOL_ERROR); // a broken --list is a broken checker, not "no violations"
  }

  const vitestFilesOk = vitest as { readonly files: ReadonlySet<string> };
  const e2eFilesOk = e2e as { readonly files: ReadonlySet<string> };
  const ctFilesOk = ct as { readonly files: ReadonlySet<string> };

  // ── direction 1: GLOB→FILE — every runner's --list view must be non-empty (an empty match is the
  // marinara silent-no-op disease: the config resolves, the runner exits 0, and NOTHING ran). ──
  const runnerViews: readonly { readonly label: string; readonly files: ReadonlySet<string> }[] = [
    { label: "vitest (unit/integration/integration-serial/contract/types/parity)", files: vitestFilesOk.files },
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

  let dirty = false;
  if (emptyRunners.length > 0) {
    dirty = true;
    process.stdout.write(`  ✗ ${emptyRunners.length} runner view(s) matched ZERO files (a silent no-op suite):\n`);
    for (const v of emptyRunners) {
      process.stdout.write(`      · ${v.label}\n`);
    }
  } else {
    process.stdout.write("  ✓ every runner view matches ≥1 file\n");
  }

  if (unrun.length > 0) {
    dirty = true;
    process.stdout.write(`  ✗ ${unrun.length} test file(s) matched by NO runner — never executed:\n`);
    for (const rel of unrun) {
      process.stdout.write(`      · ${rel}\n`);
    }
  } else {
    process.stdout.write("  ✓ every tests/** runner-suffixed file is matched by ≥1 runner view\n");
  }

  if (dirty) {
    process.stdout.write(`\n  FIX: ${FIX_HINT}\n`);
    process.exit(EXIT_VIOLATIONS);
  }
  process.exitCode = EXIT_CLEAN;
}

// Direct-run guard (the tests-type-membership idiom): running the file spawns main(); an import (a proof
// test) gets only the exported `findUnrunFiles` core.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
