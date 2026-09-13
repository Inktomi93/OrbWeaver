// The DIRECT-INVOCATION refusal (tooling/src/_shared/entrypoint.ts) — the permanent pin for a lying
// instrument (#509). `tooling/src/verify/ops/*.ts` are LIBRARY modules with no main: running one loaded it,
// executed nothing and exited 0. docs/history/gate-authoring-legacy-2026-09-13.md §8 prescribed exactly that as "the live pass" for
// months, so a lane following the doc's letter got a green that never ran a gate — and the doc's literal
// spelling (`pnpm exec tsx …/ops/structure.ts`) was worse still: pnpm printed its own lockfile ✓ lines over
// the silence. A bare zero must mean "I could not run", never "clean".
//
// Three arms, and the corpus arm is the one that keeps proving: a NEW ops module born without the guard is
// a new instance of the same lie, and nothing else on the tree would notice.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getWorkspace, moduleScopeCallees, soleExportedFunction } from "../../../tooling/src/_shared/ts-workspace.ts";
import { REVIEWED_GRANTS } from "../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget, spawnNodeWithBudget } from "../_load-budget.ts";

// LOAD-HONEST BUDGET (#606). The verify-census test below spawns one `node` per ops module (~12 boots,
// ~1.7s solo) and lived on the parallel lane's DEFAULT 5000ms — which under multi-lane contention blew and
// surfaced as an opaque timeout indistinguishable from a real refusal-regression red. Each spawn now runs
// under a load-scaled child `timeout` that throws a SELF-IDENTIFYING ORB-LOAD-KILL when contention (not a
// missing guard) is the cause, and the test carries a load-scaled wall-clock. Solo (factor 1) is unchanged.
const CENSUS_TEST_BUDGET = scaledBudget(15_000, 4);
const PER_CHILD_BUDGET = scaledBudget(5000, 4);

const OPS_DIR = join("tooling", "src", "verify", "ops");
const RUNNER_HOME = join("tooling", "src", "_shared", "run-tool.ts");
const TOOLING_SRC = join("tooling", "src");
const EXIT_TOOL_ERROR = 2;
/** The governed non-cli argv entries, derived from the central reviewed-grant table — the same rows the
 *  `tooling-argv-front-door` policy's authority rests on, so the two halves of one law cannot drift. */
const governedArgvEntries: ReadonlySet<string> = new Set(
  REVIEWED_GRANTS.filter((grant) => grant.policyId === "tooling-argv-front-door").map((grant) => grant.subject),
);

/** REAL PROGRAMS are DERIVED, never listed. A module that enters through the one entry runner at module
 *  scope IS a process entry: running it does the work it exists for (booting the production server, the
 *  vLLM fleet, the dev-identity probe), so it must NOT be spawned here and cannot be expected to refuse.
 *
 *  The hand-kept name list this replaces went stale exactly once and cost a red main: `dev-identity-entry.ts`
 *  was BORN a program in #751's stack work, the structural gate correctly passed it, this test correctly
 *  failed it, and neither was wrong about its own rule — the two halves of one law simply kept separate
 *  answers to "is this a program?". Both now read `moduleScopeCallees` + `soleExportedFunction` from
 *  `_shared/ts-workspace.ts`, so they cannot disagree and there is no row to rot. */
function realEntries(repoRoot: string, modules: readonly string[]): ReadonlySet<string> {
  // NARROW glob on purpose: the default workspace scope walks every package, which RACES a sibling suite
  // that creates and removes a temp fixture dir mid-glob (ts-morph throws "Directory not found" on the
  // vanished path — seen on a full `verify --push`). This census only ever needs the ops corpus plus the
  // runner home, and scoping it is both race-free and faster.
  const project = getWorkspace({
    root: repoRoot,
    globs: [`${repoRoot}/tooling/src/*/ops/**/*.ts`, `${repoRoot}/${RUNNER_HOME}`],
  });
  const runner = soleExportedFunction(project, join(repoRoot, RUNNER_HOME));
  if (runner === undefined) {
    // BLINDNESS, not silence: an unresolvable runner name would make every module look like a program,
    // emptying the census and turning this test into a permanent false clean.
    throw new Error(`${RUNNER_HOME} no longer exports exactly one function — the program derivation is blind`);
  }
  const entries = new Set<string>();
  for (const rel of modules) {
    const sf = project.getSourceFile(join(repoRoot, rel));
    if (sf !== undefined && moduleScopeCallees(sf).has(runner)) {
      entries.add(rel);
    }
  }
  return entries;
}

function opsModules(repoRoot: string): readonly string[] {
  return readdirSync(join(repoRoot, OPS_DIR))
    .filter((f) => f.endsWith(".ts"))
    .sort();
}

/** EVERY `tooling/src/<tool>/ops/**` library module, repo-relative — the whole corpus the gate governs. */
function allOpsModules(repoRoot: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(rel);
      } else if (entry.name.endsWith(".ts")) {
        out.push(rel);
      }
    }
  };
  for (const tool of readdirSync(join(repoRoot, TOOLING_SRC), { withFileTypes: true })) {
    const opsDir = join(TOOLING_SRC, tool.name, "ops");
    if (tool.isDirectory() && readdirSync(join(repoRoot, TOOLING_SRC, tool.name)).includes("ops")) {
      walk(opsDir);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

test("EVERY tooling ops module in the FLEET refuses when RUN — one law, sixteen tools", ({ repoRoot }) => {
  // The #527 widening. The verify-only census above was the class's first home; the same lie is available
  // in snap/ast/ui-audit/… ops, and `tooling/src/verify/ops/gen/*` (nine baseline WRITERS) were the loudest
  // instance: running one printed nothing, wrote no baseline and exited 0, while four gate messages told the
  // reader to do exactly that. Spawn-based on purpose — the structural half is the gate; this is the half
  // that answers "does the process actually refuse?".
  const all = allOpsModules(repoRoot);
  const programs = realEntries(repoRoot, all);
  // A fleet with NO derived program is the derivation silently failing, not a fleet of libraries.
  expect(programs.size).toBeGreaterThan(0);
  const modules = all.filter((rel) => !programs.has(rel));
  const bad = modules.filter((rel) => {
    const run = spawnSync("node", [rel], { cwd: repoRoot, encoding: "utf8" });
    return run.status !== EXIT_TOOL_ERROR || !run.stderr.includes("direct invocation") || run.stdout !== "";
  });

  expect(bad).toEqual([]);
  // The walk-fence tripwire: a zero from an empty census would be a false clean. 130 modules across 16 tools
  // at the widening; the floor only proves the walk read the fleet, not just one tool's dir.
  expect(modules.length).toBeGreaterThan(opsModules(repoRoot).length);
}, 180_000);

test("running an ops module DIRECTLY refuses loudly — exit 2, naming the real entry", ({ repoRoot }) => {
  const run = spawnSync("node", [join(OPS_DIR, "structure.ts")], { cwd: repoRoot, encoding: "utf8" });

  // Exit 2 = tool error (the run is NOT a verdict) — never 0, which is what this cost us, and never 1,
  // which the exit contract reserves for "violations found".
  expect(run.status).toBe(EXIT_TOOL_ERROR);
  expect(run.stderr).toContain("direct invocation");
  // The refusal is a FIX, not a scolding: it names the door that actually runs the gates.
  expect(run.stderr).toContain("pnpm check:structure");
  // And nothing pretended to be a result.
  expect(run.stdout).toBe("");
});

test("the guard is INERT on the normal path — the cli still runs", ({ repoRoot }) => {
  // The negative control. A guard that fired on import would take the whole harness down, so a green
  // above means nothing without this: `cli.ts` imports every ops module and must be unaffected.
  const run = spawnSync("node", [join("tooling", "src", "verify", "cli.ts"), "--help"], { cwd: repoRoot, encoding: "utf8" });
  expect(run.status).toBe(0);
  expect(run.stdout).toContain("usage: node tooling/src/verify/cli.ts");
});

test(
  "EVERY verify ops library refuses when RUN, while governed private entries preserve their argv contract",
  ({ repoRoot }) => {
    // Deliberately not a source grep. Writing this pin as `readFileSync(...).includes("refuseDirectInvocation")`
    // was the FIRST attempt and it was itself a lying proof: the scaffold's guard landed inside `new-gate.ts`'s
    // TEMPLATE STRING (so every future GATE would have carried it and new-gate.ts still exited 0), and the grep
    // said armed. Only running the module answers the question the pin is asking. Each spawn is budget-guarded:
    // a contention kill throws a legible ORB-LOAD-KILL (exit-2), never a `status:null` misread as a bad refusal.
    const modules = opsModules(repoRoot);
    const verdicts = modules.map((f) => {
      const run = spawnNodeWithBudget([join(OPS_DIR, f)], repoRoot, PER_CHILD_BUDGET, `ops-refusal census (${f})`);
      return `${f}: ${run.status}`;
    });

    expect(verdicts).toEqual(modules.map((f) => `${f}: ${governedArgvEntries.has(join(OPS_DIR, f)) ? 3 : EXIT_TOOL_ERROR}`));
    // A zero from an empty directory would be a false clean (the walk-fence lesson): the census must have
    // read something. Twelve modules at the pin's minting; the floor only proves the scan happened.
    expect(modules.length).toBeGreaterThan(1);
  },
  CENSUS_TEST_BUDGET,
);
