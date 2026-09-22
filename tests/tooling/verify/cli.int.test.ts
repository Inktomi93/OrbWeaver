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
import process from "node:process";
import type { MembershipReport } from "@orb/tooling/verify";
import { VERIFY_VERBS } from "@orb/tooling/verify";
import { readPolicyRepositoryInventory } from "../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

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
const HELP_TIMEOUT_MS = scaledBudget(30_000);

/** SMALL_HEAP_ENV with a PATH that can resolve the registry's argv[0]s (#2225 — `--list` now reads the
 *  environment it is handed). Keys stay ENV VOCABULARY, built from pairs, so the naming rule holds. */
function smallHeapEnvWithPath(path: string): Readonly<Record<string, string>> {
  return Object.fromEntries([...Object.entries(SMALL_HEAP_ENV), ["PATH", path]]);
}

// biome-ignore lint/style/noProcessEnv: the caller's PATH is the fixture INPUT here — the real `--list` door is always reached through `pnpm`, so this reproduces it rather than configuring anything.
const CALLER_PATH = process.env["PATH"] ?? "";

// The explicit timeout is part of the pin: without it a regressed verb aborts at ~5s and vitest's own 5s
// default reports a TIMEOUT, hiding the 134 that names the defect (observed on the red-first run).
test.for([...VERIFY_VERBS])("`%s --help` answers from argv alone under a 512MB heap", { timeout: HELP_TIMEOUT_MS }, async (verb, { runCli }) => {
  const res = await runCli("verify", [verb, "--help"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  // 134 (SIGABRT after the heap abort) and a null code (killed) are the failure shapes; only 0 is an answer.
  await expect(res).toExitWith(0);
  expect(res.stdout, "help must name how to invoke the verb").toMatch(/usage/iu);
  expect(res.stdout).toContain(verb);
});

// The explicit timeout is the same half of the pin the comment above states: this row alone carried
// vitest's 5s DEFAULT while every sibling spawn in this file budgets 30s, so under load it reported a
// vitest TIMEOUT instead of the exit code that names the defect (observed 2026-09-05 at 5,123ms while
// sibling spawns took 7-20s). Repaired in the #1584 asset-refs lane, which added the two spawns that
// pushed it over.
test("an unknown verb is still MISUSE, not a help answer", { timeout: HELP_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["not-a-verb", "--help"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain('unknown verb "not-a-verb"');
});

test("an explicit changed path outside the repository is CLI misuse, not a tool failure or empty selection", { timeout: HELP_TIMEOUT_MS }, async ({
  runCli,
}) => {
  const result = await runCli("verify", ["run", "--changed", "/tmp/outside-orbweaver.ts", "--json"], { timeoutMs: HELP_TIMEOUT_MS });
  await expect(result).toExitWith(3);
  expect(result.stderr).toContain("explicit selection path resolves outside repository");
});

// ── the TAIL axis (#1117) ────────────────────────────────────────────────────────────────────────────
//
// The VERB axis was always strict; the tail each verb received was not. These pins run under the SAME
// 512MB ceiling as the help pins above, which is half the assertion: a refusal that has to build the
// ts-morph project first is not a refusal, it is an OOM. Red-first, measured on the unmodified source:
//   `ledgers-fresh --scope packages/ui`      → exit 0, re-derived EVERY committed ledger over the whole tree
//   `scoped --package @orb/kit --bogus-flag` → exit 0 after a full scoped pass, flag dropped on the floor
//   `orphan-ratchet --updat`                 → exit 1 from a CHECK the operator never asked for (they asked
//                                              for the baseline REWRITE, which is the opposite verdict)
// `new-gate` and `baseline` are read-proven rather than run-proven in the same direction: their pre-fix
// effect IS the write we are refusing (a scaffolded gate file, a rewritten committed ledger), so the
// receipt for them is the refusal below, taken before either door opens.
const TAIL_REFUSALS: readonly (readonly [string, readonly string[], string])[] = [
  ["ledgers-fresh", ["--scope", "packages/ui"], "takes no arguments"],
  // `structure` now owns the final-policy scope grammar. An actually unknown token is still refused before
  // the run slot opens; `--changed` is a supported planner request and is exercised by the policy command tests.
  ["structure", ["--not-a-policy-flag"], "structure argument refusal"],
  ["gate-contract", ["--changed"], "takes no arguments"],
  ["policy-conformance", ["--changed"], "takes no arguments"],
  ["db-baseline", ["extra"], "takes no arguments"],
  ["asset-refs", ["extra"], "takes no arguments"],
  // #2056: a bare "takes no arguments" was a DEAD END here — `pnpm lint:eslint <paths>` is the spelling a
  // lane reaches for, the whole-repo verb genuinely takes none, and the scoped answer is a different tool.
  // The refusal must ROUTE, so the assertion is on the door rather than on the refusal's first clause.
  ["eslint", ["packages/ui/src/lib/class-merge.ts"], "pnpm exec eslint <files>"],
  ["tests-membership", ["--scope", "tests"], "accepts only --json"],
  ["orphan-ratchet", ["--updat"], "does not recognize"],
  ["new-gate", ["a-gate", "b-gate"], "ONE gate per invocation"],
  ["baseline", ["prose", "--chekc"], "unexpected argument"],
  ["scoped", ["--package", "@orb/kit", "--bogus-flag"], "unrecognised argument"],
];

test.for(TAIL_REFUSALS)(
  "`verify %s` refuses an unrecognised tail before doing any work",
  { timeout: HELP_TIMEOUT_MS },
  async ([verb, args, message], { runCli }) => {
    const res = await runCli("verify", [verb, ...args], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
    await expect(res).toExitWith(3);
    expect(res.stderr).toContain(message);
  },
);

// The other half of every refusal above: the spellings the two orchestrators drive hourly must be
// BYTE-STABLE. `--help` is not a tail (it is answered before the tail check), and a verb's own value
// flags survive — proven here at the front door, not by reading the parse.
test("a no-tail verb still answers --help, and a real flag still reaches its verb", { timeout: HELP_TIMEOUT_MS }, async ({ runCli }) => {
  const help = await runCli("verify", ["ledgers-fresh", "--help"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  await expect(help).toExitWith(0);
  // `--gate <substr>` is `debt`'s own grammar; a substring that matches no ledger is that verb's OWN
  // refusal (still exit 3) — the point is that the front door handed the flag through rather than eating it.
  const debt = await runCli("verify", ["debt", "--gate", "no-such-gate-anywhere"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  expect(debt.stderr + debt.stdout).toContain("no-such-gate-anywhere");
  // `pnpm verify --list` is `cli.ts run --list` — the single most-driven spelling in the repo (every lane
  // reads the tier ladder from it). It stays clean and still prints the registry.
  //
  // THE PATH IS PART OF THIS PIN NOW, not incidental (#2225). `--list` refuses a registry row whose
  // `argv[0]` resolves to nothing runnable, so it reads the environment it is handed. `SMALL_HEAP_ENV`'s
  // PATH is three directories chosen to make `nice` resolvable and nothing else, and `pnpm` — the argv[0]
  // of 29 of the 30 rows — is not among them; under it the refusal is CORRECT and this assertion was
  // measuring the fixture's PATH rather than the door. The REAL door is always reached through `pnpm`
  // itself, so pnpm resolves by construction: keep the 512MB ceiling, hand it the caller's PATH.
  const list = await runCli("verify", ["run", "--list"], { env: smallHeapEnvWithPath(CALLER_PATH), timeoutMs: HELP_TIMEOUT_MS });
  await expect(list).toExitWith(0);
  expect(list.stdout).toContain("the stage registry");

  // THE PLANTED POSITIVE CONTROL for that refusal — without it the exit 0 above is only evidence that
  // nothing can make `--list` fail. `SMALL_HEAP_ENV` UNCHANGED is that control: its three directories
  // resolve `nice` (so the runner still spawns) and NOT `pnpm` (argv[0] of 29 of the 30 rows), so the
  // listing must say so and exit 2 — TOOL ERROR, a registry the runner cannot execute is a broken
  // instrument — rather than printing thirty rows as if they were runnable. A PATH that resolves nothing
  // at all is NOT this control: it starves `nice` and the harness dies before the registry is consulted.
  const blind = await runCli("verify", ["run", "--list"], { env: SMALL_HEAP_ENV, timeoutMs: HELP_TIMEOUT_MS });
  await expect(blind).toExitWith(2);
  expect(blind.stdout, "it still prints the map").toContain("the stage registry");
  expect(blind.stdout, "and then names what it cannot run").toContain("REFUSED");
  expect(blind.stdout, "a `pnpm <script>` row is unrunnable without pnpm on PATH").toContain("lint:biome");
  // AND IT IS NOT INDISCRIMINATE: `lint:hook-syntax`'s argv[0] is `bash`, which /usr/bin DOES hold, so
  // that row stays out of the refusal. The resolver answers per row from evidence — the property #2220
  // was missing when a name allowlist sent `bash` to a node_modules/.bin that never had it.
  expect(blind.stdout).not.toContain('argv[0] "bash"');
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

test("membership JSON exposes every authored TS file, including unresolved config and declaration owners", { timeout: HELP_TIMEOUT_MS }, async ({
  runCli,
  repoRoot,
}) => {
  const res = await runCli("verify", ["tests-membership", "--json"], { timeoutMs: HELP_TIMEOUT_MS });
  await expect(res).toExitWith(0);
  const report = JSON.parse(res.stdout) as MembershipReport;
  expect(report.enforcement).toBe("world-ownership-ambient-distribution-and-closure-libraries");
  const expected = readPolicyRepositoryInventory(repoRoot).paths.filter((file) => /\.(?:ts|tsx|mts|cts)$/u.test(file));
  expect(report.rows.map((row) => row.file).toSorted()).toEqual([...expected].toSorted());
  expect(report.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ file: "knip.ts", world: "node", predicted: "tsconfig.json" }),
      expect.objectContaining({ file: "reset.d.ts", world: null, predicted: null, ambientScope: "all-programs", outcome: "ambient" }),
    ]),
  );
  expect(report.rows.filter(({ outcome }) => outcome === "unowned" || outcome === "unclassified")).toEqual([]);
  expect(report.unknownPrograms).toEqual([]);
  expect(report.testEscapees).toEqual([]);
  expect(report.libLeaks).toEqual([]);
  expect(report.closureLeaks).toEqual([]);
  expect(report.routingParityViolations).toEqual([]);
});
