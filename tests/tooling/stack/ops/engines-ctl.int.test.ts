// The fleet CONTROL half's argv grammar, driven through the real program (#1115). Its verbs each take no
// argument, and trailing tokens used to be DROPPED: `engines-ctl sleep --level 2` ran a plain level-1
// sleep and printed success for a request nobody honoured.
//
// THE NEUTERING SEAM. Every verb here touches the LIVE fleet — `reconcile` REAPS engine-family processes,
// `status` shells nvidia-smi and probes the ports, `sleep`/`wake`/`stop` post to the engines — so every
// spawn below sets `ENGINES_CTL_DISPATCH_PROBE`, which `main()` honours after the grammar is decided and
// before `fn()` (the `stack.sh` STACK_DISPATCH_PROBE convention; sibling: tests/tooling/stack/index.int.test.ts).
// A refusal is proved red-first by REMOVING it, and without this seam the only thing standing between such
// a plant and production hardware is the code under test. Paid 2026-09-02, twice, by this file's own
// bite-proof: the first plant removed the refusal and drove `sleep` (the live embed + rerank engines went
// to sleep); the second removed the refusal by SLICING from `if (argv.length > 1)` to `return await fn();`
// — a span that CONTAINS the probe block — so the seam went out with the guard and the de-neutered run
// executed every verb, `stop` and `reconcile` included, taking the fleet down.
//
// SO, IF YOU ARE PLANTING A RED HERE: excise by STATEMENT, never by span. Delete exactly the
// `if (argv.length > 1) { … }` block (or, in engines.ts, exactly the `if (UNKNOWN_ENGINE_ARG !== undefined)
// { … }` block), and then RE-ASSERT the seam survived — `grep -c DISPATCH_PROBE_VAR` on the planted file
// must still be 2 (the const and its read) before you run anything.
//
// STATED DEVIATION from §5.1's `runCli` door: `stack` is BASH-FRONTED (Core-Tooling-Law §2.5/§4.1) and has
// no `cli.ts` for runCli to derive; the node halves engines.sh execs are named directly.
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CTL = fileURLToPath(new URL("../../../../tooling/src/stack/ops/engines-ctl.ts", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SPAWN_TIMEOUT_MS = scaledBudget(30_000);
/** The seam above. A pair because the key is ENV VOCABULARY; spawnNiced merges it over the ambient env. */
const PROBE_ENV: Readonly<Record<string, string>> = Object.fromEntries([["ENGINES_CTL_DISPATCH_PROBE", "1"]]);
/** The verbs engines.sh execs, one per shell `case` arm. The refusal must offer every one of them. */
const VERBS: readonly string[] = ["status", "stop", "sleep", "wake", "reconcile"];

async function run(...argv: readonly string[]): ReturnType<typeof spawnNiced> {
  return await spawnNiced(process.execPath, [CTL, ...argv], { cwd: REPO_ROOT, env: PROBE_ENV, timeoutMs: SPAWN_TIMEOUT_MS });
}

test("an unknown verb is refused, and the refusal enumerates the LIVE verb map", { timeout: SPAWN_TIMEOUT_MS }, async () => {
  const res = await run("reconcille");
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("reconcille");
  for (const verb of VERBS) {
    // Derived from `Object.keys(VERBS)` at runtime — a verb that falls out of dispatch fails HERE.
    expect(res.stderr, `the refusal must offer '${verb}' — engines.sh execs it`).toContain(verb);
  }
});

test("a trailing token on a real verb is refused — never a plain run reported as success", { timeout: SPAWN_TIMEOUT_MS }, async () => {
  const res = await run("sleep", "--level", "2");
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("takes no arguments");
  expect(res.stderr).toContain("--level");
  expect(res.stdout, "the run must not reach dispatch").not.toContain("DISPATCH");
});

test("every verb engines.sh execs DISPATCHES — the grammar accepts each one, bare", { timeout: SPAWN_TIMEOUT_MS }, async () => {
  // The positive control for both refusals, and the other half of the enumeration above: the refusal
  // OFFERS these names, and each one really is accepted by the parse. Nothing runs — the probe stops the
  // program between the grammar and the verb.
  for (const verb of VERBS) {
    const res = await run(verb);
    await expect(res).toExitWith(0);
    expect(res.stdout).toContain(`DISPATCH verb=${verb}`);
  }
});
