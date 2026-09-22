// The VITEST-TIER ratchet aggregate (train-gate tier, #667). WHY THIS EXISTS: `pnpm check` is static and
// `check:structure` never runs a vitest suite, so an enforcement test going RED on main is invisible to
// every merge gate — the next cold lane pays the diagnosis. Paid twice in one day (2026-08-24):
//   1. B2's merge left `automation.createRuleFromPreset`/`listRulePresets` unclassified in the cross-tenant
//      IDOR sweep (`tests/server/transport/cross-tenant-sweep.suite.int.test.ts`) — red on main for hours.
//   2. #640's merge left `add-chat-book-dialog` with no coverage decision in `chat-component-presence.test.ts`
//      — red on main until a sibling lane's floor tripped it.
// This is the ONE cheap command a merge train runs to catch exactly that class, in sub-minute time.
//
// THE CONVENTION (glob-first, not a hand list — so enumeration does not rot):
//   • every `tests/tooling/**/*.test.ts` / `*.int.test.ts` whose BASENAME contains "ratchet", "presence",
//     or "conformance" (case-insensitive) — the tooling package's OWN coverage/structure ratchets and their
//     permanent gate pins. A brand-new file shaped like this is picked up automatically (no row to add).
//   • every `tests/tooling/workboard/**` file — the workboard mirror (the Project-board contract's own
//     round-trip suite).
//   • every `tests/contracts/**/*.contract.test.ts` — the exact-tuple wire pins (already a suffix
//     convention; the `.contract.test.ts` name IS the routing decision).
//   • `EXPLICIT_INCLUDES` — a DELIBERATELY tiny hand list for ratchets that live OUTSIDE tests/tooling/**
//     (the naming convention structurally cannot reach them because they're not the tooling package's own
//     tests — they're a DOMAIN's own completeness guard). Currently one row: the cross-tenant IDOR sweep,
//     named because it is escape #1 above.
//   • `EXCLUDED` — files that WOULD match the convention but are pulled OUT, each with a reason + a measured
//     wall-clock cost, so an exclusion is an audited decision, never a silent drop.
//
// MEASURED (2026-08-24, this tree, `--maxWorkers=4`). WITHOUT `gate-conformance.repo.int.test.ts` (see below):
// 4 tooling ratchet files, the workboard mirror, 71 contract pins, and the cross-tenant sweep — 87 test
// files / 990 tests in 36.97s vitest-reported duration (37.7s wall, cold `pnpm test:scoped` invocation).
// WITH `gate-conformance.repo.int.test.ts` folded in: 56.05s vitest-reported / 67.34s wall through the full
// `pnpm test:ratchets` door (cold node + the barrel import) under SIBLING-LANE CONTENTION — over the
// sub-minute budget on that run (isolated it measured 22-24s standalone, so the combined total is
// contention-sensitive, not a fixed cost). `gate-conformance.repo.int.test.ts` is therefore EXCLUDED (below):
// it is the heaviest single candidate (~20-24s, driving every contract-form gate's mustFlag/mustPass proof
// over the real registry) and it is ALREADY covered at push-tier — it is an ordinary `.int.test.ts` file
// under `tests/`, so `pnpm test` (and therefore `pnpm verify --push`) already runs it; dropping it from
// THIS aggregate loses no coverage, it only moves its cadence from every-merge to pre-push. The
// cross-tenant sweep stays IN (measured 2.2-9.3s across runs) because it is escape #1's own reproduction,
// not a discretionary heavy row.
//
// `tests/tooling/check-gates.repo.int.test.ts` is NOT a candidate under the naming convention (its basename
// matches none of ratchet/presence/conformance) — it stays out by construction, not because it's listed in
// `EXCLUDED`. It is listed there anyway, rename-safe: it is NOT concurrency-safe with itself (shared `__g_`
// fixture paths) and stays `check:structure`'s own harness /
// the orchestrator's to run at a train — never this aggregate's, even if a future rename would otherwise
// make it name-match.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { TestFamily } from "../../_shared/test-kinds.ts";
import { classifyTestFilename, runtimeForTestFamily } from "../../_shared/test-kinds.ts";

// This is a LIBRARY module — the real door is `pnpm test:ratchets` (→ `cli.ts ratchet-gate`). Refuse being
// the process entry so `node <this path>` cannot load, run nothing, and print a bare zero a reader trusts.
refuseDirectInvocation(import.meta.url, "pnpm test:ratchets");

const RATCHET_NAME_RE = /(ratchet|presence|conformance)/iu;
const TOOLING_TESTS_PREFIX = "tests/tooling/";
const WORKBOARD_PREFIX = "tests/tooling/workboard/";
const CONTRACT_PIN_PREFIX = "tests/contracts/";
const NODE_MODULES = "node_modules";
const TESTS_DIR = "tests";

/** A ratchet-shaped file pulled OUT of the aggregate despite matching the inclusion convention. */
export interface RatchetExclusion {
  readonly path: string;
  readonly reason: string;
}

export interface RatchetClassification {
  /** repo-relative posix paths, sorted, that the aggregate runs. */
  readonly included: readonly string[];
  readonly excluded: readonly RatchetExclusion[];
}

/** Ratchets living OUTSIDE `tests/tooling/**` — the naming convention cannot reach them because they are a
 *  DOMAIN's own completeness guard, not the tooling package's. Kept deliberately tiny: each row earns its
 *  place with the escape it would have caught (#667). */
const EXPLICIT_INCLUDES: readonly string[] = [
  "tests/server/transport/cross-tenant-sweep.suite.int.test.ts", // #667 escape 1 — the cross-tenant IDOR completeness guard
];

/** Convention-matching files pulled OUT, each with a reason + how it's covered instead. Rename-safe: a row
 *  here still excludes the path even if a future rename would otherwise make it convention-match. */
const EXCLUDED: readonly RatchetExclusion[] = [
  {
    path: "tests/tooling/check-gates.repo.int.test.ts",
    reason:
      "NOT concurrency-safe with itself (shared __g_ fixture paths) — never overlaps a sibling invocation " +
      "or a drain battery. Stays check:structure's own harness / the orchestrator's to run at a train.",
  },
  {
    path: "tests/tooling/gate-conformance.repo.int.test.ts",
    reason:
      "measured 20-24s standalone, the heaviest single candidate — folding it in pushed the aggregate's " +
      "wall time to 67s under sibling-lane contention (over the sub-minute train-gate budget; #667). " +
      "It is a registered repository-resource integration test, so pnpm test / pnpm verify --push already run it at push-tier — " +
      "excluding it here costs no coverage, only cadence (every-push instead of every-merge).",
  },
];

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

function hasVitestCapability(family: TestFamily): boolean {
  const runtime = runtimeForTestFamily(family);
  return runtime === "vitest" || runtime === "vitest-typecheck";
}

/** Recursively walk `tests/` for every authored kind Vitest can run or typecheck. Playwright CT/E2E kinds
 *  are outside this aggregate; kind recognition itself comes from the canonical registry. */
export function discoverTestFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === NODE_MODULES) {
        continue;
      }
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      const testKind = classifyTestFilename(entry.name);
      if (testKind !== undefined && hasVitestCapability(testKind.definition.family)) {
        out.push(toPosix(relative(root, abs)));
      }
    }
  };
  walk(join(root, TESTS_DIR));
  return out.sort((a, b) => a.localeCompare(b));
}

/** Does this repo-relative path match the RATCHET convention (tooling's own ratchet/presence/conformance
 *  self-tests, the workboard mirror, or a contract exact-tuple pin)? Pure — no filesystem I/O — so a test
 *  can drive it over a synthetic candidate list without touching disk (the planted-control shape). */
export function isRatchetShaped(relPath: string): boolean {
  const testKind = classifyTestFilename(relPath);
  if (testKind === undefined || !hasVitestCapability(testKind.definition.family)) {
    return false;
  }
  if (relPath.startsWith(CONTRACT_PIN_PREFIX) && testKind.definition.family === "contract") {
    return true;
  }
  if (relPath.startsWith(WORKBOARD_PREFIX)) {
    return true;
  }
  if (relPath.startsWith(TOOLING_TESTS_PREFIX)) {
    const basename = relPath.slice(relPath.lastIndexOf("/") + 1);
    return RATCHET_NAME_RE.test(basename);
  }
  return false;
}

/** Classify a candidate file list into the aggregate's included set + the excluded-with-reason set. Pure —
 *  the CLI door (`runRatchetGateCli`) is the only caller that feeds it real disk paths; a test feeds it a
 *  synthetic list to prove the convention picks up a file it has never seen before (no hand-list edit). */
export function classifyRatchetFiles(candidatePaths: readonly string[]): RatchetClassification {
  const excludedPaths = new Map(EXCLUDED.map((e) => [e.path, e.reason]));
  const included = new Set<string>();
  const excluded: RatchetExclusion[] = [];
  for (const p of candidatePaths) {
    const excludedReason = excludedPaths.get(p);
    if (excludedReason !== undefined) {
      excluded.push({ path: p, reason: excludedReason });
      continue;
    }
    if (isRatchetShaped(p)) {
      included.add(p);
    }
  }
  for (const p of EXPLICIT_INCLUDES) {
    if (candidatePaths.includes(p)) {
      included.add(p);
    }
  }
  return { included: [...included].sort(), excluded: excluded.sort((a, b) => a.path.localeCompare(b.path)) };
}

const VITEST_BIN = "node_modules/.bin/vitest";
const MS_PER_SECOND = 1000;

/** The CLI door: real disk walk → classify → run vitest over exactly the included set, `stdio: "inherit"`
 *  so the operator sees vitest's own report live, then print the wall-clock (a train gate that doesn't
 *  measure itself is not a train gate). Exit code mirrors vitest's own contract (0 clean / 1 failing
 *  tests); vitest terminated by signal (null status) is a tool error, never a silent pass. */
export function runRatchetGateCli(root: string): number {
  const startedAt = performance.now();
  const candidates = discoverTestFiles(root);
  const { included, excluded } = classifyRatchetFiles(candidates);

  process.stdout.write(`test:ratchets — ${included.length} file(s), ${excluded.length} excluded\n`);
  for (const path of included) {
    process.stdout.write(`  · ${path}\n`);
  }
  if (excluded.length > 0) {
    process.stdout.write("\nexcluded (matches the convention, pulled out — see reasons):\n");
    for (const { path, reason } of excluded) {
      process.stdout.write(`  ✗ ${path}\n      ${reason}\n`);
    }
  }
  process.stdout.write("\n");

  const result = runNicedSync(VITEST_BIN, ["run", ...included, "--maxWorkers=4"], { cwd: root, stdio: "inherit" });
  const elapsedMs = performance.now() - startedAt;
  process.stdout.write(`\ntest:ratchets — ${(elapsedMs / MS_PER_SECOND).toFixed(2)}s wall\n`);

  if (result.status === null) {
    return 2; // killed by signal — never a verdict
  }
  return result.status;
}
