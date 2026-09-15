// RUN COMPLETENESS (#410) — the planted-control proof that `reports/check-structure.json` cannot be read
// as a verdict unless the run that wrote it actually finished and reconciled.
//
// WHY EVERY CASE HERE SPAWNS A REAL CLI OVER A PLANTED ROOT: the defect class is a run that DIES or comes
// back SHORT, and neither is expressible in-process — a killed pass has no return value to assert on. Each
// control plants a two-file tree (one gate + one file for it to scan), points `cli.ts structure` at it via
// cwd, and asserts BOTH halves: the child's exit code AND what the artifact on disk says about itself.
// A planted root also keeps every case ~1s: the corpus under it is the planted gate, not the real 219.
//
// THE FOUR ABNORMAL ARMS ARE THE POINT. Before #410 all four left the PREVIOUS run's complete-looking
// artifact on disk, which every reader the doctrine sends there ("read the report, never re-run") would
// consume as this run's clean verdict.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { spawnNicedChild } from "@orb/tooling/_shared/proc";
import { POLICY_PHASES } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { loadGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { plantedPolicySource } from "../../../support/planted-gate-corpus.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** A minimal, VALID policy that reports nothing ON THIS TREE: its one subject path is deliberately not
 *  planted (tests/support/planted-gate-corpus.ts states the silence convention). Its `mustFlag` row still
 *  fires on its own virtual fixture, so the loader's proof floor is satisfied without a second shape. */
const okPolicy = (repoRoot: string, id = "planted-ok", extraHooks?: string): string =>
  plantedPolicySource({
    repoRoot,
    id,
    subjectPath: "packages/x/src/unplanted.ts",
    token: "unplanted",
    ...(extraHooks === undefined ? {} : { extraHooks }),
  });

/** The file the planted corpus walks — a run over an empty fileset would measure something else. */
const SCANNED = { "packages/x/src/y.ts": "export const y = 1;\n" };
const GATE_DIR = "tooling/src/verify/gates";
const HOG_ITERATIONS = 40_000_000;
const POLL_DELAY_MS = 50;
const READINESS_BUDGET_MS = scaledBudget(30_000);
const SUBPROCESS_CLEANUP_BUDGET_MS = scaledBudget(5000);
const TIMEOUT_CHILD_BUDGET_MS = scaledBudget(10_000);
const OOM_CHILD_BUDGET_MS = scaledBudget(60_000);
/** EVERY CASE HERE SPAWNS A REAL CLI CHILD, so no case may run under vitest's DEFAULT 5s (#2289). The two
 *  arms that already carried budgets did so because their children are deliberately slow; the rest were
 *  left on the default and measured ~1-3s SOLO, which reads as headroom right up until contention — the
 *  `kill -9` arm below took 3.0s alone and TIMED OUT AT 5068ms inside a six-file batch, reported as a test
 *  failure rather than as the load kill it was. A planted-root CLI boot is node startup plus a one-gate
 *  corpus, so the base is an order of magnitude over the measurement and the load factor carries the rest:
 *  this is a HANG failsafe, never a duration assertion, and nothing in the file asserts on elapsed time.
 *
 *  IT MUST ALSO OUTLAST THE INNER BUDGETS. `waitUntil` polls for READINESS_BUDGET_MS and throws a message
 *  that NAMES what it waited for; a vitest timeout shorter than that would preempt the legible error with
 *  an opaque one, which is the same class of defect as the kill this file exists to make readable. */
const CLI_CASE_BUDGET_MS = scaledBudget(30_000);
/** The SIGKILL arm's own ceiling: two `waitUntil` polls (readiness, then the killed child's exit) plus the
 *  two `runCli` children around them, so its failsafe sits strictly above every budget nested inside it. */
const KILL_CASE_BUDGET_MS = READINESS_BUDGET_MS * 2 + SUBPROCESS_CLEANUP_BUDGET_MS + CLI_CASE_BUDGET_MS;
const HEAP_OOM_RE = /FATAL ERROR:.*heap out of memory/isu;

function isRealHeapOom(result: { readonly code: number | null; readonly stderr: string; readonly timedOut: boolean }): boolean {
  return !result.timedOut && result.code !== 0 && result.code !== 1 && HEAP_OOM_RE.test(result.stderr);
}

async function waitUntil(check: () => boolean, description: string): Promise<void> {
  const attempts = Math.ceil(READINESS_BUDGET_MS / POLL_DELAY_MS);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_DELAY_MS);
    });
  }
  throw new Error(`timed out waiting for ${description}`);
}

interface RunView {
  /** `<checkout>-<pid>-<timestamp>` (#1029) — the identity the published pointer must resolve to. */
  readonly runId: string;
  readonly complete: boolean;
  readonly ran: number;
  readonly active: number;
  readonly corpusFiles: number;
  readonly registered: number;
  readonly unregistered: readonly string[];
  readonly incompleteReasons: readonly string[];
}

/** THE RUN'S OWN ARTIFACT, not the published pointer (#1029). A run writes into
 *  `reports/runs/structure/<checkout>-<pid>-<timestamp>/` and publishes `reports/check-structure.json` as a
 *  symlink into it at COMPLETION ONLY — so the four abnormal arms below, whose whole point is that the run
 *  DIED, have no pointer to read and must be judged on the slot the dead run left. Each planted root hosts
 *  exactly one run, so its single slot is that run's. */
function runArtifact<T>(root: string): T {
  const runs = join(root, "reports", "runs", "structure");
  const slots = readdirSync(runs);
  if (slots.length !== 1) {
    throw new Error(`expected exactly one run slot under ${runs}, found ${slots.length}: ${slots.join(", ")}`);
  }
  return JSON.parse(readFileSync(join(runs, slots[0] ?? "", "check-structure.json"), "utf8")) as T;
}

function manifest(root: string): RunView {
  return runArtifact<{ run: RunView }>(root).run;
}

function reportOk(root: string): boolean {
  return runArtifact<{ ok: boolean }>(root).ok;
}

/** The PUBLISHED pointer's run id — the path every reader in the repo actually opens. Asserted separately
 *  from the slot so "the run wrote a verdict" and "the pointer resolves to it" stay two facts (#1029). */
function publishedRunId(root: string): string {
  return (JSON.parse(readFileSync(join(root, "reports", "check-structure.json"), "utf8")) as { run: RunView }).run.runId;
}

// ── the POSITIVE control: a healthy planted corpus reconciles and IS a verdict ──────────────────────

test("a complete run stamps its identity, reconciles ran===active, and exits clean", { timeout: CLI_CASE_BUDGET_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-ok.ts`]: okPolicy(repoRoot) });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(0);
  const run = manifest(root);
  expect(run).toMatchObject({ complete: true, ran: 1, active: 1, corpusFiles: 1, registered: 1, unregistered: [], incompleteReasons: [] });
  expect(res.stdout).toContain("run COMPLETE");
  expect(reportOk(root)).toBe(true);
  // #1029: a COMPLETE run — and only a complete one — becomes what `reports/check-structure.json` names.
  expect(publishedRunId(root)).toBe(run.runId);
});

test("`show` reads a complete artifact (the negative control for the refusal below)", { timeout: CLI_CASE_BUDGET_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-ok.ts`]: okPolicy(repoRoot) });
  expect((await runCli("verify", ["structure"], { cwd: root })).code).toBe(0);
  const shown = await runCli("verify", ["show"], { cwd: root });
  expect(shown.code).toBe(0);
  expect(shown.stdout).not.toContain("NOT a verdict");
});

// ── the COST ledger (#1107): the artifact must say what each gate took, not only what it decided ────
//
// Before this, `check-structure.json` carried a verdict and a denominator and NO timing, so every
// gate-cost claim came from a scratch profiler and could not be re-derived from the canonical artifact.
// The planted hog burns a known ~60ms in its `run` hook: a report that cannot tell it from the free gate
// beside it is the artifact this arm exists to refuse.

const hogPolicy = (repoRoot: string): string =>
  okPolicy(
    repoRoot,
    "planted-hog",
    `evaluate: () => {\n      let burnt = 0;\n      for (let i = 0; i < ${String(HOG_ITERATIONS)}; i += 1) {\n        burnt += i % 7;\n      }\n      if (burnt < 0) {\n        throw new Error("unreachable — the planted cost must not be optimised away");\n      }\n    },`,
  );

interface TimingView {
  readonly policy: { readonly timing: { readonly totalMs: number; readonly policyMs: number; readonly factMs: number } } | null;
  readonly gates: readonly { readonly name: string; readonly timing: { readonly totalMs: number; readonly phaseMs: Record<string, number> } }[];
}

test("the artifact carries per-policy wall-clock, and the summary line names the slowest", { timeout: CLI_CASE_BUDGET_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-ok.ts`]: okPolicy(repoRoot), [`${GATE_DIR}/planted-hog.ts`]: hogPolicy(repoRoot) });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(0);
  const report = runArtifact<TimingView>(root);

  // EVERY policy is timed — a report where only the interesting ones carry a number is the silent
  // `undefined` the writer refuses (tests/tooling/verify/lib/timing.test.ts holds that arm).
  expect(report.gates).toHaveLength(2);
  for (const gate of report.gates) {
    expect(Number.isFinite(gate.timing.totalMs)).toBe(true);
    expect(Object.keys(gate.timing.phaseMs).toSorted()).toEqual([...POLICY_PHASES].toSorted());
    const sum = POLICY_PHASES.reduce((total: number, phase) => total + (gate.timing.phaseMs[phase] ?? 0), 0);
    expect(gate.timing.totalMs).toBeCloseTo(sum, 3);
  }

  // ATTRIBUTION, which is the whole claim: the hog's cost lands in the PHASE that spent it, the free gate
  // beside it is not credited with any of it, and the two are ordered by what they actually did. No
  // absolute millisecond is asserted — that would be a claim about the machine, not about the ledger.
  const hog = report.gates.find((gate) => gate.name === "planted-hog");
  const free = report.gates.find((gate) => gate.name === "planted-ok");
  const hogEvaluate = hog?.timing.phaseMs["evaluate"] ?? 0;
  const freeTotal = free?.timing.totalMs ?? Number.POSITIVE_INFINITY;
  expect(hogEvaluate).toBeGreaterThan(0);
  expect(hogEvaluate).toBeGreaterThan(freeTotal);
  expect(hog?.timing.totalMs ?? 0).toBeGreaterThan(freeTotal);
  // The free policy has no `evaluate` hook at all, so its own evaluate phase must be exactly zero — the
  // negative control that says the hog's number is the HOOK's cost and not a per-policy constant.
  expect(free?.timing.phaseMs["evaluate"]).toBe(0);

  // The ledger adds up: the pass wall clock encloses the sum of its policies, by construction and not by
  // rounding luck (per-policy numbers floor, the pass total ceils).
  const passTiming = report.policy?.timing;
  expect(passTiming?.policyMs ?? 0).toBeCloseTo((hog?.timing.totalMs ?? 0) + (free?.timing.totalMs ?? 0), 3);
  expect(passTiming?.totalMs ?? 0).toBeGreaterThanOrEqual((passTiming?.policyMs ?? 0) + (passTiming?.factMs ?? 0));

  // The console half: the format a reader diffs across runs, and the slowest policy named on it.
  expect(res.stdout).toContain("final-pass cost: ");
  expect(res.stdout).toContain("ms wall — policies ");
  expect(res.stdout).toMatch(/slowest 2: planted-hog \d+\.\dms \(evaluate\) · planted-ok /u);
  expect(res.stdout).toContain("(per-policy timing: reports/runs/structure/");
});

// ── control 1: a corpus file that registers NOTHING makes the run SHORT, not clean ──────────────────

test("a corpus file exporting no descriptor is a SHORT run — exit 2, never a shorter clean report", { timeout: CLI_CASE_BUDGET_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-ok.ts`]: okPolicy(repoRoot),
    // The loader `continue`s past this. Before #410 that was invisible: the report simply had one fewer
    // entry, and every count a reader could reach agreed with itself.
    [`${GATE_DIR}/planted-silent.ts`]: "export const notADescriptor = 1;\n",
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(2);
  const run = manifest(root);
  expect(run.corpusFiles).toBe(2);
  expect(run.registered).toBe(1);
  expect(run.unregistered).toEqual([`${GATE_DIR}/planted-silent.ts`]);
  expect(run.incompleteReasons.join(" ")).toContain("registered NO descriptor");
  expect(reportOk(root)).toBe(false);
  expect(res.stdout).toContain("run INCOMPLETE");
});

// ── control 2: a gate that THROWS AT LOAD leaves the in-flight stub, not a stale verdict ────────────

test("a gate that throws at LOAD exits 2 and leaves an artifact that says it is not a verdict", { timeout: CLI_CASE_BUDGET_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-ok.ts`]: okPolicy(repoRoot),
    [`${GATE_DIR}/planted-boom.ts`]: 'throw new Error("planted load failure");\n',
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(2);
  // The IN-FLIGHT stub is what survives — the load never got far enough to write a report.
  expect(manifest(root).complete).toBe(false);
  const shown = await runCli("verify", ["show"], { cwd: root });
  expect(shown.code).toBe(2);
  expect(shown.stdout).toContain("NOT a verdict");
});

// ── control 2b: a gate that throws at RUN publishes a COMPLETE artifact, and its row must say so ────

/** THE COMPLEMENT OF CONTROL 2, AND THE ONE THE ARTIFACT ACTUALLY LIES IN (#2285). A LOAD throw kills the run
 *  before any report exists, so the reader gets the in-flight stub and a loud refusal. A RUN-PHASE throw does
 *  the opposite: `lib/pass.ts#guard` isolates it into `toolErrors`, every sibling gate finishes, the run
 *  COMPLETES and PUBLISHES — so `reports/check-structure.json` is a normal, readable, pointer-resolved
 *  artifact, and the only place it can tell a reader that one gate could not answer is that gate's own row.
 *
 *  Before this pin `ops/structure.ts#toLegacyRows` recomputed the row as `violations.length === 0`, so the
 *  broken gate published `ok: true` with an empty violations list — indistinguishable from a gate that ran
 *  clean, in the file the doctrine tells every downstream reader to consult INSTEAD of re-running. The two
 *  assertions below are the halves that must not disagree: the row is NOT ok, and the tool error names the
 *  same gate. Asserting the sibling stays `ok: true` is what stops the pin passing on a runtime that simply
 *  reds everything. */
test("a policy that throws at EVALUATE publishes an artifact whose row reads ok:false, not a clean zero", { timeout: CLI_CASE_BUDGET_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-ok.ts`]: okPolicy(repoRoot),
    [`${GATE_DIR}/planted-run-throw.ts`]: okPolicy(
      repoRoot,
      "planted-run-throw",
      'evaluate: () => {\n      throw new Error("planted run-phase failure");\n    },',
    ),
  });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(2);
  const report = runArtifact<{ ok: boolean; gates: readonly { name: string; ok: boolean; violations: readonly unknown[] }[] }>(root);
  const broken = report.gates.find((g) => g.name === "planted-run-throw");
  // The run COMPLETED and PUBLISHED — this is a readable artifact, which is exactly why its row must be honest.
  expect(manifest(root).complete).toBe(true);
  expect(publishedRunId(root)).toBe(manifest(root).runId);
  expect(broken).toBeDefined();
  expect(broken?.violations).toEqual([]);
  // THE PIN: zero findings AND a broken phase is not `ok`. Recomputing from the violations list says otherwise.
  expect(broken?.ok).toBe(false);
  // The positive control in the other direction: a gate that really did run clean still reads ok in the same
  // artifact, so a runtime that reddened every row could not satisfy this case.
  expect(report.gates.find((g) => g.name === "planted-ok")?.ok).toBe(true);
  expect(report.ok).toBe(false);
});

// ── control 3: SIGKILL mid-run (the wall-clock/`kill -9` class) ─────────────────────────────────────

test("a run KILLED mid-pass leaves the in-flight stub, and `show` refuses it", { timeout: KILL_CASE_BUDGET_MS }, async ({ plantedTree, repoRoot, runCli }) => {
  const readyFile = "planted-hang-ready";
  const root = await plantedTree({
    ...SCANNED,
    // A gate whose `run` announces entry through a planted readiness file and never returns. The parent
    // SIGKILLs only after that signal — the same abnormal-termination class as an operator `kill -9` or a
    // lefthook wall-clock kill, without assuming startup completed inside an arbitrary sleep.
    [`${GATE_DIR}/planted-hang.ts`]: `import { writeFileSync } from "node:fs";\n${okPolicy(
      repoRoot,
      "planted-hang",
      `evaluate: () => {\n      writeFileSync(${JSON.stringify(readyFile)}, "ready");\n      while (true) {\n        /* planted hang */\n      }\n    },`,
    )}`,
  });
  let output = "";
  const child = spawnNicedChild(process.execPath, [join(repoRoot, "tooling", "src", "verify", "cli.ts"), "structure"], {
    cwd: root,
    onOutput: (chunk) => {
      output += chunk.toString("utf8");
    },
  });
  try {
    await waitUntil(() => existsSync(join(root, readyFile)) || child.hasExited(), "the planted gate to enter its run hook");
    expect(existsSync(join(root, readyFile)), output).toBe(true);
    expect(child.hasExited(), output).toBe(false);
  } finally {
    child.killGroup("SIGKILL");
    await waitUntil(child.hasExited, "the SIGKILLed structure process to exit");
  }
  expect(manifest(root).complete).toBe(false);
  // #1029: the stub is PRIVATE to the dead run — no pointer was published, so no reader can mistake it for
  // a verdict, and no concurrent sibling could have clobbered it either.
  expect(existsSync(join(root, "reports", "check-structure.json"))).toBe(false);
  const shown = await runCli("verify", ["show"], { cwd: root });
  expect(shown.code).toBe(2);
  expect(shown.stdout).toContain("IN-FLIGHT stub");
});

// ── control 4: a deliberate OOM under a tiny heap ceiling ───────────────────────────────────────────

test("readiness followed by a harness timeout is not accepted as an OOM", { timeout: TIMEOUT_CHILD_BUDGET_MS + SUBPROCESS_CLEANUP_BUDGET_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const readyFile = "planted-timeout-ready";
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-timeout.ts`]: `import { writeFileSync } from "node:fs";\n${okPolicy(
      repoRoot,
      "planted-timeout",
      `evaluate: () => {\n      writeFileSync(${JSON.stringify(readyFile)}, "ready");\n      while (true) {\n        /* planted timeout */\n      }\n    },`,
    )}`,
  });
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: TIMEOUT_CHILD_BUDGET_MS });
  expect(existsSync(join(root, readyFile)), res.stderr).toBe(true);
  expect(res.timedOut).toBe(true);
  expect(isRealHeapOom(res)).toBe(false);
});

test("a gate that OOMs under a planted heap ceiling exits non-zero and leaves the in-flight stub", {
  timeout: OOM_CHILD_BUDGET_MS + SUBPROCESS_CLEANUP_BUDGET_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const readyFile = "planted-oom-ready";
  const root = await plantedTree({
    ...SCANNED,
    // Allocation without bound under a bounded heap: node aborts (exit 134 / SIGABRT). The readiness
    // marker proves the loader completed and the planted policy entered `evaluate` before memory
    // exhaustion, so an ever-heavier startup cannot satisfy this control by crashing before the in-flight
    // stub exists.
    [`${GATE_DIR}/planted-oom.ts`]: `import { writeFileSync } from "node:fs";\n${okPolicy(
      repoRoot,
      "planted-oom",
      `evaluate: () => {\n      writeFileSync(${JSON.stringify(readyFile)}, "ready");\n      const hog = [];\n      while (true) {\n        hog.push(new Array(1_000_000).fill(0));\n      }\n    },`,
    )}`,
  });
  const res = await runCli("verify", ["structure"], {
    cwd: root,
    // `spawnNiced` MERGES over the inherited env, so this replaces the workspace's 16GB NODE_OPTIONS
    // ceiling for this child only and leaves PATH (which `nice` needs) alone.
    env: Object.fromEntries([["NODE_OPTIONS", "--max-old-space-size=256"]]),
    timeoutMs: OOM_CHILD_BUDGET_MS,
  });
  expect(res.code).not.toBe(0);
  expect(res.code).not.toBe(1); // never a VERDICT — an aborted checker is exit-2 class
  expect(existsSync(join(root, readyFile)), res.stderr).toBe(true);
  expect(res.timedOut).toBe(false);
  expect(res.stderr).toMatch(HEAP_OOM_RE);
  expect(isRealHeapOom(res)).toBe(true);
  expect(manifest(root).complete).toBe(false);
  expect((await runCli("verify", ["show"], { cwd: root })).code).toBe(2);
});

// ── THE REAL-CORPUS ROSTER, successor to two `check-gates.repo.int.test.ts` arms (#2176 Phase F) ────────
//
// That suite planted `__g_*` fixtures inside the real package tree, which is why it was orchestrator-only
// and not concurrency-safe with itself, and it died at `lib/loader.ts`'s (since-retired) empty-legacy-roster
// refusal once the corpus went all-final. Two of its eight arms had FINAL subjects and land here:
//
//   the reserved-proof-files arm (proof surfaces stay project inputs but never become descriptor corpus,
//   and the roster accounts for every module once) — the `__g_`/`__dc_` exclusion and the roster
//   accounting identity; and the anti-drift arm (every active gate file under tooling/src/verify/gates is
//   run by report.ts) — which on the all-final corpus IS `unregistered === []`: the loader is the registry, every registered final policy
//    is dispatched (only the retired legacy contract had a `status` filter to drop one), and the doc-side
//    half is `enforcement-registry-parity`.
//
// The other two final-subject arms went to their own owners rather than here, because the property is not
// this file's: the population denominator on every rendered final line is the RENDERER's
// (`tests/tooling/verify/lib/render.int.test.ts`), and "no run is a NON-VERDICT" is the production EXIT
// contract, pinned against a real CLI child in `structure-corpus.suite.int.test.ts`'s withheld-owner arm
// (exit 2, `⚠ … WITHHELD by authority`) — a stronger receipt than observing one clean tree.
//
// SYNTHETIC-CORPUS controls for both halves stay in `tests/tooling/verify/lib/loader.test.ts`; what is
// added here is the REAL-TREE measurement, in process, with no planted file anywhere.
test("the real gate corpus registers every module it holds, admits no probe sentinel, and accounts for each row once", {
  timeout: CLI_CASE_BUDGET_MS,
}, async ({ repoRoot }) => {
  const corpus = await loadGateCorpus(repoRoot);
  // A denominator first: an empty corpus would satisfy every assertion below vacuously.
  expect(corpus.files.length).toBeGreaterThan(8);
  expect(corpus.files.filter((file: string) => file.includes("/__g_") || file.includes("/__dc_"))).toEqual([]);
  // ANTI-DRIFT: a module in the gates dir that registers nothing is a gate file doing nothing, silently.
  expect(corpus.unregistered).toEqual([]);
  // THE ACCOUNTING IDENTITY the run manifest reconciles: one roster row per module, nothing vanishing.
  expect(corpus.files.length).toBe(corpus.gates.length + corpus.unregistered.length);
  expect(corpus.roster.map(({ path }) => path)).toEqual([...corpus.files].toSorted());
});
