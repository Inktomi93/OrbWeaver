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
import { expect, test } from "../../../support/tool-fixtures.ts";

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

test("a run KILLED mid-pass leaves the in-flight stub, and `show` refuses it", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    // A gate whose `run` never returns. The fixture's own timeout SIGKILLs the child — the same
    // abnormal-termination class as an operator `kill -9` or a lefthook wall-clock kill.
    [`${GATE_DIR}/planted-hang.ts`]: OK_GATE.replace(
      "visitFile: () => undefined,",
      "run: () => {\n    while (true) {\n      /* planted hang */\n    }\n  },",
    ).replace('"planted-ok"', '"planted-hang"'),
  });
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: 4000 });
  expect(res.timedOut).toBe(true);
  expect(res.code).toBeNull(); // signal-killed — ALWAYS tool-error class, never a verdict
  expect(manifest(root).complete).toBe(false);
  // #1029: the stub is PRIVATE to the dead run — no pointer was published, so no reader can mistake it for
  // a verdict, and no concurrent sibling could have clobbered it either.
  expect(existsSync(join(root, "reports", "check-structure.json"))).toBe(false);
  const shown = await runCli("verify", ["show"], { cwd: root });
  expect(shown.code).toBe(2);
  expect(shown.stdout).toContain("IN-FLIGHT stub");
});

// ── control 4: a deliberate OOM under a tiny heap ceiling ───────────────────────────────────────────

test("a gate that OOMs under a planted heap ceiling exits non-zero and leaves the in-flight stub", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({
    ...SCANNED,
    // Allocation without bound under a 64MB ceiling: node aborts (exit 134 / SIGABRT). The ceiling is
    // PLANTED so the control costs 64MB and a second — a real-heap OOM control on a co-hosted box is a
    // load bomb, and the class being proven (abnormal termination mid-run) is identical.
    [`${GATE_DIR}/planted-oom.ts`]: OK_GATE.replace(
      "visitFile: () => undefined,",
      "run: () => {\n    const hog = [];\n    while (true) {\n      hog.push(new Array(1_000_000).fill(0));\n    }\n  },",
    ).replace('"planted-ok"', '"planted-oom"'),
  });
  const res = await runCli("verify", ["structure"], {
    cwd: root,
    // `spawnNiced` MERGES over the inherited env, so this replaces the workspace's 16GB NODE_OPTIONS
    // ceiling for this child only and leaves PATH (which `nice` needs) alone.
    env: Object.fromEntries([["NODE_OPTIONS", "--max-old-space-size=64"]]),
    timeoutMs: 60_000,
  });
  expect(res.code).not.toBe(0);
  expect(res.code).not.toBe(1); // never a VERDICT — an aborted checker is exit-2 class
  expect(manifest(root).complete).toBe(false);
  expect((await runCli("verify", ["show"], { cwd: root })).code).toBe(2);
});
