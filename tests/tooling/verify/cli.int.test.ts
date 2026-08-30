// Red-first receipt (#809 — NOT an @instrument-proof marker: `verify` is the gate harness, not an INSTRUMENT_TOOLS member): `verify`'s front door must answer `--help` from ARGV ALONE, before any subcommand
// body runs. RED before #809, measured on this tree: `node --max-old-space-size=512
// tooling/src/verify/cli.ts structure --help` aborted with exit 134 (heap OOM) in 5.4s, because the help
// request fell through to `runStructure`, which loads the whole-repo ts-morph project. A help path that
// builds a project cannot tell you how to use the tool on any machine without a raised heap — and the
// abort reads as "the checker broke", the exit-2 class the harness reserves for a run that is NOT a verdict.
//
// The small heap IS the assertion: every verb runs under a deliberately tiny ceiling, so a future verb
// whose help path touches the project fails HERE rather than only on a smaller machine. The verb list is
// read from the tool's own contract (VERIFY_VERBS), never a copy — a new verb joins this pin the day it is
// minted, which is the only shape that would have caught #809 (a code path nobody exercised).
import { VERIFY_VERBS } from "@orb/tooling/verify";
import { expect, test } from "../../support/tool-fixtures.ts";

/** A deliberately small heap: enough to load the module graph and print a line, far too small to build the
 *  ts-morph project. It rides NODE_OPTIONS because runCli spawns `process.execPath` with the script first,
 *  so a node flag cannot ride argv. `env` REPLACES the child environment (spawn semantics) — which is what
 *  keeps the workspace-wide `--max-old-space-size=16384` floor out of these children — so PATH is supplied
 *  for the `nice` lookup, and nothing else is. Built from pairs because the keys are ENV VOCABULARY. */
const SMALL_HEAP_ENV: Readonly<Record<string, string>> = Object.fromEntries([
  ["PATH", "/usr/bin:/bin:/usr/local/bin"],
  ["NODE_OPTIONS", "--max-old-space-size=512"],
]);
/** Generous next to the ~0.5s a real help answer takes, and multiples of the ~5s the OOM took to abort. */
const HELP_TIMEOUT_MS = 30_000;

// The explicit timeout is part of the pin: without it a regressed verb aborts at ~5s and vitest's own 5s
// default reports a TIMEOUT, hiding the 134 that names the defect (observed on the red-first run).
test.for([...VERIFY_VERBS])("`%s --help` answers from argv alone under a 512MB heap", { timeout: HELP_TIMEOUT_MS }, async (verb, { runCli }) => {
  const res = await runCli("verify", [verb, "--help"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  // 134 (SIGABRT after the heap abort) and a null code (killed) are the failure shapes; only 0 is an answer.
  await expect(res).toExitWith(0);
  expect(res.stdout, "help must name how to invoke the verb").toMatch(/usage/iu);
  expect(res.stdout).toContain(verb);
});

test("an unknown verb is still MISUSE, not a help answer", async ({ runCli }) => {
  const res = await runCli("verify", ["not-a-verb", "--help"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain('unknown verb "not-a-verb"');
});

// The abort itself takes ~5s (v8 fills the heap first), which is exactly vitest's default testTimeout —
// so this one names its own.
test("the 512MB ceiling BITES — the same verb without --help dies under it", { timeout: HELP_TIMEOUT_MS }, async ({ runCli }) => {
  // The planted positive control for the fixture itself: `structure` with no --help is the identical spawn
  // minus the flag, so it enters the subcommand body. If this ever exits 0, the heap ceiling stopped biting
  // and every green above became a test that cannot fail.
  const res = await runCli("verify", ["structure"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  expect(res.code, `expected a heap-starved failure, got ${String(res.code)}`).not.toBe(0);
});
