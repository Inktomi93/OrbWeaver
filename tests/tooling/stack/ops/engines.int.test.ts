// The engine LAUNCHER's argv grammar, driven through the real program (#1115). `--detach` is the whole
// grammar, and a typo used to fall through to the FOREGROUND owner — the opposite process topology (the
// launcher then owns the fleet and dies with the shell), decided silently on a multi-minute GPU boot.
//
// THE NEUTERING SEAM, and why this file may spawn an engine launcher at all. The standing ban is real:
// running one — `--help` included — spawns vLLM against the live ports, and its pidfile reconciler reaps
// every engine process it does not own. So every spawn here sets `ENGINES_DISPATCH_PROBE`, the seam
// `main()` honours immediately after the argv grammar is decided and before `shouldSkip`, the boot lock,
// `reapOrphanedFamily` or any `spawnEngine` — the same shape as `stack.sh`'s `STACK_DISPATCH_PROBE`
// (tests/tooling/stack/index.int.test.ts). It is NOT merely belt-and-braces on the refusal: a red-first
// plant proves a refusal by REMOVING it, and without a seam the only thing then standing between this
// spec and production hardware is the code under test. Paid 2026-09-02 — a bite-proof for the sibling
// engines-ctl pin did exactly that and put the live embed + rerank engines to sleep, then a second plant
// excised the seam ALONG WITH the guard (it sliced a span that contained both) and took the fleet down.
//
// SO, IF YOU ARE PLANTING A RED HERE: excise by STATEMENT, never by span — delete exactly the
// `if (UNKNOWN_ENGINE_ARG !== undefined) { … }` block — and then RE-ASSERT the seam survived:
// `grep -c DISPATCH_PROBE_VAR tooling/src/stack/ops/engines.ts` must still be 2 (the const and its read)
// before you run anything.
//
// STATED DEVIATION from §5.1's `runCli` door: `stack` is BASH-FRONTED (Core-Tooling-Law §2.5/§4.1), so it
// has no `tooling/src/stack/cli.ts` for runCli to derive — and runCli THROWS for a tool without one. The
// node halves engines.sh execs are named directly, exactly as this suite's sibling spawns stack.sh.
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ENGINES = fileURLToPath(new URL("../../../../tooling/src/stack/ops/engines.ts", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SPAWN_TIMEOUT_MS = 30_000;
/** The seam above. Built from a pair because the key is ENV VOCABULARY; spawnNiced MERGES it over the
 *  ambient env, so PATH et al. still ride through. */
const PROBE_ENV: Readonly<Record<string, string>> = Object.fromEntries([["ENGINES_DISPATCH_PROBE", "1"]]);

async function run(...argv: readonly string[]): ReturnType<typeof spawnNiced> {
  return await spawnNiced(process.execPath, [ENGINES, ...argv], { cwd: REPO_ROOT, env: PROBE_ENV, timeoutMs: SPAWN_TIMEOUT_MS });
}

test("a typo'd flag is REFUSED — it never falls through to the foreground owner", { timeout: SPAWN_TIMEOUT_MS }, async () => {
  const res = await run("--detatch");
  await expect(res).toExitWith(3);
  expect(res.stderr, "the refusal must NAME the token, or the operator re-types the same typo").toContain("--detatch");
  expect(res.stdout, "and the run must not reach dispatch").not.toContain("DISPATCH");
});

test("a bare positional is refused too — the grammar is `[--detach]`, not a flag sniff", { timeout: SPAWN_TIMEOUT_MS }, async () => {
  const res = await run("gen");
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("gen");
});

test("the REAL flag dispatches, and DETACH is what it decides", { timeout: SPAWN_TIMEOUT_MS }, async () => {
  // The positive control for both refusals: same program, same spawn, the flag the grammar accepts. The
  // probe line carries the DECISION, so the pin covers the axis the typo used to flip silently — not just
  // "it exited 0". If this ever refused, the two reds above would be proving nothing but a broken program.
  const detached = await run("--detach");
  await expect(detached).toExitWith(0);
  expect(detached.stdout).toContain("DISPATCH detach=1");

  const foreground = await run();
  await expect(foreground).toExitWith(0);
  expect(foreground.stdout, "no flag = the foreground owner, the OTHER topology").toContain("DISPATCH detach=0");
});
