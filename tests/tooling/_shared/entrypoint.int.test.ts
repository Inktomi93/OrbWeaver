// The DIRECT-INVOCATION refusal (tooling/src/_shared/entrypoint.ts) — the permanent pin for a lying
// instrument (#509). `tooling/src/verify/ops/*.ts` are LIBRARY modules with no main: running one loaded it,
// executed nothing and exited 0. GATE-AUTHORING.md §8.1 prescribed exactly that as "the live pass" for
// months, so a lane following the doc's letter got a green that never ran a gate — and the doc's literal
// spelling (`pnpm exec tsx …/ops/structure.ts`) was worse still: pnpm printed its own lockfile ✓ lines over
// the silence. A bare zero must mean "I could not run", never "clean".
//
// Three arms, and the corpus arm is the one that keeps proving: a NEW ops module born without the guard is
// a new instance of the same lie, and nothing else on the tree would notice.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "../../support/tool-fixtures.ts";

const OPS_DIR = join("tooling", "src", "verify", "ops");
const TOOLING_SRC = join("tooling", "src");
const EXIT_TOOL_ERROR = 2;

/** stack.sh / engines.sh's node halves: REAL programs (module-scope `runTool`), so running one does the
 *  work it exists for — booting the production server or the vLLM fleet. They are excluded by NAME here
 *  because running them in a test would do exactly that; the STRUCTURAL half of this law
 *  (gate `tooling-ops-direct-invocation`) is what proves each of them still enters through `runTool`. */
const REAL_ENTRIES: ReadonlySet<string> = new Set([
  join("tooling", "src", "stack", "ops", "prod-entry.ts"),
  join("tooling", "src", "stack", "ops", "engines.ts"),
  join("tooling", "src", "stack", "ops", "engines-ctl.ts"),
]);

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
      } else if (entry.name.endsWith(".ts") && !REAL_ENTRIES.has(rel)) {
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
  const modules = allOpsModules(repoRoot);
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

test("EVERY verify ops module refuses when RUN — the next one cannot be born lying", ({ repoRoot }) => {
  // Deliberately not a source grep. Writing this pin as `readFileSync(...).includes("refuseDirectInvocation")`
  // was the FIRST attempt and it was itself a lying proof: the scaffold's guard landed inside `new-gate.ts`'s
  // TEMPLATE STRING (so every future GATE would have carried it and new-gate.ts still exited 0), and the grep
  // said armed. Only running the module answers the question the pin is asking.
  const modules = opsModules(repoRoot);
  const verdicts = modules.map((f) => {
    const run = spawnSync("node", [join(OPS_DIR, f)], { cwd: repoRoot, encoding: "utf8" });
    return `${f}: ${run.status}`;
  });

  expect(verdicts).toEqual(modules.map((f) => `${f}: ${EXIT_TOOL_ERROR}`));
  // A zero from an empty directory would be a false clean (the walk-fence lesson): the census must have
  // read something. Twelve modules at the pin's minting; the floor only proves the scan happened.
  expect(modules.length).toBeGreaterThan(1);
});
