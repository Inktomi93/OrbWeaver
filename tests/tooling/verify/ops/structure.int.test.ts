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
import { GATE_PHASES } from "../../../../tooling/src/verify/contract/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** A minimal, VALID descriptor: scans everything, flags nothing. `scanRoot: () => true` + a `visitFile`
 *  keeps it out of the zero-scan alarm, so a failure here is never that alarm wearing a disguise. */
const OK_GATE = `export const gate = {
  name: "planted-ok",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "the planted control gate — see tooling/src/verify/contract/run-manifest.ts",
  scanRoot: () => true,
  visitFile: () => undefined,
  mustFlag: [{ files: "export const a = 1;\\n" }],
  mustPass: [{ files: "export const b = 1;\\n" }],
};
`;

/** The file the planted gate scans — without it every planted run trips the zero-scan alarm instead. */
const SCANNED = { "packages/x/src/y.ts": "export const y = 1;\n" };
const GATE_DIR = "tooling/src/verify/gates";
const POLL_DELAY_MS = 50;
const READINESS_BUDGET_MS = scaledBudget(30_000);
const SUBPROCESS_CLEANUP_BUDGET_MS = scaledBudget(5000);
const TIMEOUT_CHILD_BUDGET_MS = scaledBudget(10_000);
const OOM_CHILD_BUDGET_MS = scaledBudget(60_000);
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

test("a complete run stamps its identity, reconciles ran===active, and exits clean", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-ok.ts`]: OK_GATE });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(0);
  const run = manifest(root);
  expect(run).toMatchObject({ complete: true, ran: 1, active: 1, corpusFiles: 1, registered: 1, unregistered: [], incompleteReasons: [] });
  expect(res.stdout).toContain("run COMPLETE");
  expect(reportOk(root)).toBe(true);
  // #1029: a COMPLETE run — and only a complete one — becomes what `reports/check-structure.json` names.
  expect(publishedRunId(root)).toBe(run.runId);
});

test("`show` reads a complete artifact (the negative control for the refusal below)", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-ok.ts`]: OK_GATE });
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

/** A planted gate that burns a FIXED AMOUNT OF WORK in one named phase. Work, not a wall-clock deadline:
 *  the case's subject is ATTRIBUTION (which phase of which gate was charged), and a loop of a known size
 *  proves that without reading an ambient clock from the test — the deadline form spelled `Date.now()`
 *  here, which is `test-determinism`'s exact ban. The harness times the hook's own return, so only real
 *  occupied CPU inside it can land on this gate. */
const HOG_ITERATIONS = 40_000_000;
const HOG_GATE = OK_GATE.replace(
  "visitFile: () => undefined,",
  `visitFile: () => undefined,\n  run: () => {\n    let burnt = 0;\n    for (let i = 0; i < ${String(HOG_ITERATIONS)}; i += 1) {\n      burnt += i % 7;\n    }\n    if (burnt < 0) {\n      throw new Error("unreachable — the planted cost must not be optimised away");\n    }\n  },`,
).replace('"planted-ok"', '"planted-hog"');

interface TimingView {
  readonly timing: { readonly totalMs: number; readonly gateMs: number };
  readonly gates: readonly { readonly name: string; readonly timing: { readonly totalMs: number; readonly phaseMs: Record<string, number> } }[];
}

test("the artifact carries per-gate wall-clock, and the summary line names the slowest", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-ok.ts`]: OK_GATE, [`${GATE_DIR}/planted-hog.ts`]: HOG_GATE });
  const res = await runCli("verify", ["structure"], { cwd: root });
  expect(res.code).toBe(0);
  const report = runArtifact<TimingView>(root);

  // EVERY gate is timed — a report where only the interesting ones carry a number is the silent
  // `undefined` the writer refuses (tests/tooling/verify/lib/timing.test.ts holds that arm).
  expect(report.gates).toHaveLength(2);
  for (const gate of report.gates) {
    expect(Number.isFinite(gate.timing.totalMs)).toBe(true);
    const phases = GATE_PHASES;
    expect(Object.keys(gate.timing.phaseMs).toSorted()).toEqual([...phases].toSorted());
    const sum = phases.reduce((total: number, phase) => total + (gate.timing.phaseMs[phase] ?? 0), 0);
    expect(gate.timing.totalMs).toBeCloseTo(sum, 3);
  }

  // ATTRIBUTION, which is the whole claim: the hog's cost lands in the PHASE that spent it, the free gate
  // beside it is not credited with any of it, and the two are ordered by what they actually did. No
  // absolute millisecond is asserted — that would be a claim about the machine, not about the ledger.
  const hog = report.gates.find((gate) => gate.name === "planted-hog");
  const free = report.gates.find((gate) => gate.name === "planted-ok");
  const hogRun = hog?.timing.phaseMs["run"] ?? 0;
  const freeTotal = free?.timing.totalMs ?? Number.POSITIVE_INFINITY;
  expect(hogRun).toBeGreaterThan(0);
  expect(hogRun).toBeGreaterThan(freeTotal);
  expect(hog?.timing.totalMs ?? 0).toBeGreaterThan(freeTotal);
  // The free gate has no `run` hook at all, so its own run phase must be exactly zero — the negative
  // control that says the hog's number is the HOOK's cost and not a per-gate constant.
  expect(free?.timing.phaseMs["run"]).toBe(0);

  // The ledger adds up: the pass wall clock encloses the sum of its gates, by construction and not by
  // rounding luck (per-gate numbers floor, the pass total ceils).
  expect(report.timing.gateMs).toBeCloseTo((hog?.timing.totalMs ?? 0) + (free?.timing.totalMs ?? 0), 3);
  expect(report.timing.totalMs).toBeGreaterThanOrEqual(report.timing.gateMs);

  // The console half: the format a reader diffs across runs, and the slowest gate named on it.
  expect(res.stdout).toContain("single-pass cost: ");
  expect(res.stdout).toContain("ms wall — gate hooks ");
  expect(res.stdout).toMatch(/slowest 2: planted-hog \d+\.\dms \(run\) · planted-ok /u);
  expect(res.stdout).toContain("(per-gate timing: reports/runs/structure/");
});

// ── control 1: a corpus file that registers NOTHING makes the run SHORT, not clean ──────────────────

test("a corpus file exporting no descriptor is a SHORT run — exit 2, never a shorter clean report", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-ok.ts`]: OK_GATE,
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

test("a gate that throws at LOAD exits 2 and leaves an artifact that says it is not a verdict", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-ok.ts`]: OK_GATE,
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

// ── control 3: SIGKILL mid-run (the wall-clock/`kill -9` class) ─────────────────────────────────────

test("a run KILLED mid-pass leaves the in-flight stub, and `show` refuses it", async ({ plantedTree, repoRoot, runCli }) => {
  const readyFile = "planted-hang-ready";
  const root = await plantedTree({
    ...SCANNED,
    // A gate whose `run` announces entry through a planted readiness file and never returns. The parent
    // SIGKILLs only after that signal — the same abnormal-termination class as an operator `kill -9` or a
    // lefthook wall-clock kill, without assuming startup completed inside an arbitrary sleep.
    [`${GATE_DIR}/planted-hang.ts`]: `import { writeFileSync } from "node:fs";\n${OK_GATE.replace(
      "visitFile: () => undefined,",
      `run: () => {\n    writeFileSync(${JSON.stringify(readyFile)}, "ready");\n    while (true) {\n      /* planted hang */\n    }\n  },`,
    ).replace('"planted-ok"', '"planted-hang"')}`,
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
  runCli,
}) => {
  const readyFile = "planted-timeout-ready";
  const root = await plantedTree({
    ...SCANNED,
    [`${GATE_DIR}/planted-timeout.ts`]: `import { writeFileSync } from "node:fs";\n${OK_GATE.replace(
      "visitFile: () => undefined,",
      `run: () => {\n    writeFileSync(${JSON.stringify(readyFile)}, "ready");\n    while (true) {\n      /* planted timeout */\n    }\n  },`,
    ).replace('"planted-ok"', '"planted-timeout"')}`,
  });
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: TIMEOUT_CHILD_BUDGET_MS });
  expect(existsSync(join(root, readyFile)), res.stderr).toBe(true);
  expect(res.timedOut).toBe(true);
  expect(isRealHeapOom(res)).toBe(false);
});

test("a gate that OOMs under a planted heap ceiling exits non-zero and leaves the in-flight stub", {
  timeout: OOM_CHILD_BUDGET_MS + SUBPROCESS_CLEANUP_BUDGET_MS,
}, async ({ plantedTree, runCli }) => {
  const readyFile = "planted-oom-ready";
  const root = await plantedTree({
    ...SCANNED,
    // Allocation without bound under a bounded heap: node aborts (exit 134 / SIGABRT). The readiness
    // marker proves the loader completed and the planted gate entered `run` before memory exhaustion, so
    // an ever-heavier startup cannot satisfy this control by crashing before the in-flight stub exists.
    [`${GATE_DIR}/planted-oom.ts`]: `import { writeFileSync } from "node:fs";\n${OK_GATE.replace(
      "visitFile: () => undefined,",
      `run: () => {\n    writeFileSync(${JSON.stringify(readyFile)}, "ready");\n    const hog = [];\n    while (true) {\n      hog.push(new Array(1_000_000).fill(0));\n    }\n  },`,
    ).replace('"planted-ok"', '"planted-oom"')}`,
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
