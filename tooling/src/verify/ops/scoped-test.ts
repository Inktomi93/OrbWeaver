// THE SCOPED TEST FRONT DOOR — `pnpm test:scoped` and `pnpm ct:scoped` enter here instead of reaching a
// runner directly, so that a path the runner would silently ignore becomes a REFUSAL (#1192).
//
// THE DEFECT THIS EXISTS FOR. Both rows used to be bare package.json commands, and both vitest and
// playwright read an unmatched path filter as "no tests over here", not as misuse. On 2026-09-02 a merge
// floor named a CT spec at a path that does not exist; the run printed `CT SUMMARY — PASS  ·  58 passed`
// and exit 0, and the file it never opened was never mentioned. The counting surface was honest — it
// counted what ran — but the FLOOR was a lie, because a floor is a claim about a NAMED SET of files.
// Reproduced on this tree before the fix (two real CT paths + one stale): `PASS · 4 passed`, exit 0.
// The same probe through `pnpm test:scoped` (one real + one stale vitest path): exit 0, 1 file run.
// The third door, `pnpm verify --file`, already refused it — hence the shared rule in
// `_shared/scoped-run-paths.ts` rather than a third hand-rolled existence check here.
//
// TWO SPAWNS, DELIBERATELY. The preflight asks the RUNNER what it would collect (`vitest list`,
// `playwright test --list`) rather than re-implementing either matcher — measured at 0.60s and 0.76s on
// this tree, against CT runs measured in minutes. Re-deriving "which files does this filter select" from
// the configs would be a second, drifting copy of the very semantics being audited. The collection pass
// runs ONLY when the caller named at least one path-shaped operand, so the unfiltered spellings
// (`pnpm test:ct`) pay nothing.
//
// BOTH WRAPPED BEHAVIOURS ARE PRESERVED, and each is load-bearing: `rm -rf playwright/.cache` before every
// CT spawn (a stale cache replays errors that stopped existing), and `nice -n 19` on every child (the box
// co-hosts a homelab; an un-niced fleet starved it). The nice comes from the ONE subprocess door,
// `_shared/proc.ts` — this module never touches `node:child_process`.
//
// HAZARD, PAID FOR IN THIS LANE: `vitest list --json <path>` reads the FOLLOWING POSITIONAL as the json
// OUTPUT path. Probing it with `--json tests/tooling/smoke.test.ts` OVERWROTE that test file with a JSON
// array. The only safe spelling is the `=`-joined `--json=<abs path>` to a scratch file we own; a bare
// `--json` anywhere near operands is a file-destroying footgun.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { ScopedOperand } from "@orb/tooling/_shared/scoped-run-paths";
import {
  barrenOperands,
  barrenRefusal,
  isPathShaped,
  resolveOperand,
  toRepoRelative,
  unresolvedOperands,
  unresolvedRefusal,
} from "@orb/tooling/_shared/scoped-run-paths";
import type { ScopedTestCollection, ScopedTestRunner } from "../contract/scoped-test.ts";
import { SCOPED_TEST_RUNNERS } from "../contract/scoped-test.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:scoped <paths…>  /  pnpm ct:scoped <paths…>");

export const SCOPED_TEST_USAGE =
  `usage: node tooling/src/verify/cli.ts scoped-test <${SCOPED_TEST_RUNNERS.join("|")}> [paths…] [runner flags…]\n` +
  "  node = the vitest projects (pnpm test:scoped) · ct = the playwright CT config (pnpm ct:scoped).\n" +
  "  Every path-shaped operand must EXIST (else exit 3) and must contribute at least one collected test\n" +
  "  (else exit 2) — a runner treats an unmatched path filter as silence, which certifies unopened files.";

/** Playwright's `--list --reporter=json` dumps the whole resolved config beside the specs; vitest's list
 *  file is small. 64MiB so a large CT selection can never come back as an ENOBUFS kill read as "no tests". */
const LIST_MAX_BUFFER = 67_108_864; // 64MiB — matches tests-execution-membership's listing headroom.

const CT_CONFIG = "playwright-ct.config.ts";
const CT_CACHE_REL = join("playwright", ".cache");

function vitestBin(root: string): string {
  return join(root, "node_modules", "vitest", "vitest.mjs");
}

function playwrightBin(root: string): string {
  return join(root, "node_modules", "@playwright", "test", "cli.js");
}

/** `vitest list --filesOnly --json=<file>` → the test files the caller's filters actually select.
 *  `--filesOnly` is load-bearing for speed (without it `list` enumerates every CASE in the tree), and the
 *  `=`-joined json path is load-bearing for SAFETY — see the header hazard. */
function collectNode(root: string, rest: readonly string[]): ScopedTestCollection {
  const dir = mkdtempSync(join(tmpdir(), "orb-scoped-test-"));
  const out = join(dir, "list.json");
  try {
    const res = runNicedSync(process.execPath, [vitestBin(root), "list", "--filesOnly", `--json=${out}`, ...rest], {
      cwd: root,
      maxBuffer: LIST_MAX_BUFFER,
    });
    if (res.status !== 0) {
      return { error: `\`vitest list --filesOnly\` failed (status ${String(res.status)})\n${res.stderr}` };
    }
    const parsed: unknown = JSON.parse(readFileSync(out, "utf8"));
    if (!Array.isArray(parsed)) {
      return { error: "`vitest list --filesOnly` did not produce an array" };
    }
    const files: string[] = [];
    for (const entry of parsed) {
      const file = readField(entry, "file");
      if (file !== undefined) {
        files.push(toRepoRelative(root, file));
      }
    }
    return { files };
  } catch (err) {
    return { error: `\`vitest list --filesOnly\` produced no readable listing: ${String(err)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A string property of an unknown record, or undefined — the runners' JSON is vendor data, not our shape. */
function readField(entry: unknown, key: string): string | undefined {
  if (typeof entry !== "object" || entry === null || !(key in entry)) {
    return;
  }
  const value = (entry as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** Walk the playwright JSON suite tree collecting every `file`. Nested suites repeat the field, so one
 *  recursive read covers both the top-level grouping and per-describe nesting. */
function walkSuiteFiles(node: unknown, rootDir: string, root: string, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkSuiteFiles(child, rootDir, root, out);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const file = readField(node, "file");
  if (file !== undefined) {
    out.add(toRepoRelative(root, resolve(rootDir, file)));
  }
  for (const key of ["suites", "specs"]) {
    if (key in node) {
      walkSuiteFiles((node as Record<string, unknown>)[key], rootDir, root, out);
    }
  }
}

/** `playwright test --list --reporter=json` → the specs the caller's filters select. Exit 1 with a parsable
 *  body is the "matched nothing" case and stays a COLLECTION (an empty one), which the barren arm then
 *  reports per-operand; only an unparsable body is a collection failure. */
function collectCt(root: string, rest: readonly string[]): ScopedTestCollection {
  const res = runNicedSync(process.execPath, [playwrightBin(root), "test", "-c", CT_CONFIG, "--list", "--reporter=json", ...rest], {
    cwd: root,
    maxBuffer: LIST_MAX_BUFFER,
  });
  const start = res.stdout.indexOf("{");
  const end = res.stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { error: `\`playwright test --list\` produced no JSON (status ${String(res.status)})\n${res.stderr || res.stdout}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout.slice(start, end + 1));
  } catch (err) {
    return { error: `\`playwright test --list\` produced invalid JSON: ${String(err)}` };
  }
  const report = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const rootDir = readField(report["config"], "rootDir") ?? root;
  const files = new Set<string>();
  walkSuiteFiles(report["suites"], rootDir, root, files);
  return { files: [...files] };
}

function collect(runner: ScopedTestRunner, root: string, rest: readonly string[]): ScopedTestCollection {
  return runner === "node" ? collectNode(root, rest) : collectCt(root, rest);
}

/** The real run, streamed to the operator's terminal. The CT arm clears the playwright cache FIRST —
 *  the behaviour the package.json row used to carry inline, and dropping it is a regression. */
function spawnRun(runner: ScopedTestRunner, root: string, rest: readonly string[]): number {
  if (runner === "ct") {
    rmSync(join(root, CT_CACHE_REL), { recursive: true, force: true });
    mkdirSync(join(root, CT_CACHE_REL), { recursive: true });
    const ct = runNicedSync(process.execPath, [playwrightBin(root), "test", "-c", CT_CONFIG, ...rest], { cwd: root, stdio: "inherit" });
    return ct.status ?? EXIT.toolError;
  }
  const node = runNicedSync(process.execPath, [vitestBin(root), "run", ...rest], { cwd: root, stdio: "inherit" });
  return node.status ?? EXIT.toolError;
}

/** The preflight verdict: `undefined` = cleared to run, otherwise the exit code to return instead. */
function preflight(runner: ScopedTestRunner, root: string, rest: readonly string[], operands: readonly ScopedOperand[]): number | undefined {
  const unresolved = unresolvedOperands(operands, "runner");
  if (unresolved.length > 0) {
    // The ARGV is wrong — misuse (3), the same verdict `verify --file` gives this class. Thrown rather
    // than returned so the operator reads it through run-tool's one `ARG ERROR` channel.
    throw new UsageError(unresolvedRefusal(unresolved));
  }
  if (operands.length === 0) {
    return; // no path claims to audit (a bare `--grep` run) — nothing to certify, nothing to refuse
  }
  const collected = collect(runner, root, rest);
  if ("error" in collected) {
    warn(`TOOL ERROR   the scoped-test preflight could not ask the runner what it would collect:\n${collected.error}`);
    return EXIT.toolError;
  }
  const barren = barrenOperands(operands, collected.files);
  if (barren.length === 0) {
    return;
  }
  warn(`UNFED PATH   ${barrenRefusal(barren, collected.files)}`);
  return EXIT.toolError;
}

/** `cli.ts scoped-test <runner> …` — preflight the caller's path claims, then delegate to the runner. */
export function runScopedTest(root: string, argv: readonly string[]): number {
  const [runner, ...rest] = argv;
  if (runner === undefined || !(SCOPED_TEST_RUNNERS as readonly string[]).includes(runner)) {
    throw new UsageError(`unknown runner ${runner === undefined ? "(none given)" : JSON.stringify(runner)}\n${SCOPED_TEST_USAGE}`);
  }
  const tier = runner as ScopedTestRunner;
  const operands = rest.filter(isPathShaped).map((arg) => resolveOperand(root, arg));
  const refused = preflight(tier, root, rest, operands);
  return refused ?? spawnRun(tier, root, rest);
}
