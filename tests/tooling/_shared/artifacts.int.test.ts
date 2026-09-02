// CONCURRENT RUNS (#1029) — the planted-control proof that two invocations of one instrument on one
// checkout keep BOTH verdicts, and that the published pointer only ever names a run that FINISHED.
//
// THE DEFECT (owner ruling 2026-09-01: "all reports need to be able to be ran concurrently"). Every
// instrument wrote its artifact to ONE fixed path. Measured live that day: three concurrent
// `check:structure` runs on main, and `reports/check-structure.json` flipped from a complete 248-gate
// verdict to another run's IN-FLIGHT stub inside 30s. Every reader the doctrine sends there ("read the
// artifact, never re-run") consumed a different run's — or an unfinished — verdict as its own.
//
// WHY A REAL SPAWNED CLI, TWICE, AT ONCE: the class is a race between two PROCESSES over one filesystem
// path. It is not expressible in-process, and a single sequential run passes under the old code too. Each
// case therefore plants a two-file fixture project (one gate, one file for it to scan — never the real
// tree: `check:structure` over the repo takes minutes and collides with check-gates.int) and drives two
// `verify structure` children against it simultaneously.
//
// THE PLANTED CONTROL IS THE PRE-FIX WRITER. The last case replays exactly what every instrument used to do
// — stub to a FIXED path, work, final to the same FIXED path — driven the same way, and asserts that one
// run's artifact is destroyed. Without it, the green arm below would only prove that two runs both exited.
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "../../support/tool-fixtures.ts";

/** A valid descriptor whose `run` SLEEPS, so two children are provably in flight at the same time (a
 *  0.5s run pair could otherwise serialize by luck and prove nothing). `Atomics.wait` blocks without
 *  burning CPU — a busy-wait on a co-hosted box is a load bomb for a timing fixture. */
const SLOW_GATE = `export const gate = {
  name: "planted-slow",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "the planted concurrency control gate — see tooling/src/_shared/artifacts.ts (#1029)",
  scanRoot: () => true,
  visitFile: () => undefined,
  run: () => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    return [];
  },
  mustFlag: [{ files: "export const a = 1;\\n" }],
  mustPass: [{ files: "export const b = 1;\\n" }],
};
`;

const SCANNED = { "packages/x/src/y.ts": "export const y = 1;\n" };
const GATE_DIR = "tooling/src/verify/gates";
const REPORT = "check-structure.json";

interface RunView {
  readonly runId: string;
  readonly checkout: string;
  readonly complete: boolean;
  readonly artifactDir: string;
  readonly concurrent: readonly string[];
}

function slotDir(root: string): string {
  return join(root, "reports", "runs", "structure");
}

/** Every run slot this fixture project holds, with the manifest each one wrote. */
function slots(root: string): readonly RunView[] {
  return readdirSync(slotDir(root))
    .filter((name) => existsSync(join(slotDir(root), name, REPORT)))
    .map((name) => (JSON.parse(readFileSync(join(slotDir(root), name, REPORT), "utf8")) as { run: RunView }).run);
}

/** What `reports/check-structure.json` — the path EVERY reader in the repo opens — resolves to. */
function published(root: string): RunView {
  return (JSON.parse(readFileSync(join(root, "reports", REPORT), "utf8")) as { run: RunView }).run;
}

// EXPLICIT BUDGETS on all three: each case spawns real CLI children and the planted gate SLEEPS 1.5s to
// force the overlap, which is past vitest's 5s default the moment the box carries sibling lanes.
test("two concurrent `check:structure` runs both keep their verdict, and the pointer names a COMPLETE one", { timeout: 60_000 }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-slow.ts`]: SLOW_GATE });
  const [a, b] = await Promise.all([runCli("verify", ["structure"], { cwd: root }), runCli("verify", ["structure"], { cwd: root })]);
  expect([a.code, b.code]).toEqual([0, 0]);

  // BOTH runs' artifacts survive, under DISTINCT identities — the half the fixed path could not give.
  const runs = slots(root);
  expect(runs).toHaveLength(2);
  expect(new Set(runs.map((r) => r.runId)).size).toBe(2);
  expect(runs.every((r) => r.complete)).toBe(true);
  // The run id carries the CHECKOUT (owner: "unique markers inherit the worktree name"). The fixture tree
  // is not a checkout at all, so the checkout field is its directory name — never another tree's.
  expect(runs.every((r) => r.runId.startsWith(`${r.checkout}-`))).toBe(true);

  // The pointer is a symlink INTO one of those slots, and what it names is a finished run.
  expect(readlinkSync(join(root, "reports", REPORT))).toContain("runs/structure/");
  const pointer = published(root);
  expect(pointer.complete).toBe(true);
  expect(runs.map((r) => r.runId)).toContain(pointer.runId);

  // Whichever started second SAW the first and said so — a race is named, never silently last-write-wins.
  expect(runs.some((r) => r.concurrent.length > 0)).toBe(true);
});

test("a run names the LIVE sibling holding a slot — the racing-writer census, deterministically", { timeout: 60_000 }, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-slow.ts`]: SLOW_GATE });
  // A slot whose in-flight marker names a LIVE pid (this test process): the shape a concurrent instrument
  // leaves. Planted rather than raced, so the census assertion cannot be a coin flip.
  const sibling = join(slotDir(root), "planted-sibling");
  mkdirSync(sibling, { recursive: true });
  writeFileSync(
    join(sibling, ".inflight"),
    JSON.stringify({ runId: "planted-sibling", pid: process.pid, checkout: "planted", startedAt: new Date().toISOString() }),
  );

  expect((await runCli("verify", ["structure"], { cwd: root })).code).toBe(0);
  expect(published(root).concurrent.join(" ")).toContain("planted-sibling");
});

// ── THE PLANTED CONTROL: the pre-#1029 fixed-path writer, driven the same way, LOSES a run ─────────────

/** The writer every instrument used to be: an in-flight stub, then the finished report, both at ONE path
 *  shared by every process on the checkout. */
const OLD_WRITER = `import { writeFileSync } from "node:fs";
const [path, id, delayMs] = process.argv.slice(2);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
sleep(Number(delayMs));
writeFileSync(path, JSON.stringify({ runId: id, complete: false }));
sleep(600);
writeFileSync(path, JSON.stringify({ runId: id, complete: true }));
`;

test("PLANTED CONTROL: the old fixed-path writer loses one of two concurrent runs", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({ "old-writer.mjs": OLD_WRITER });
  const target = join(root, "fixed-report.json");
  const { spawnNiced } = await import("@orb/tooling/_shared/proc");
  const writer = join(root, "old-writer.mjs");
  await Promise.all([
    spawnNiced(process.execPath, [writer, target, "run-A", "0"]),
    // Starts mid-flight of A: its stub lands on top of A's, and its final report lands on top of A's final.
    spawnNiced(process.execPath, [writer, target, "run-B", "300"]),
  ]);

  const survivor = JSON.parse(readFileSync(target, "utf8")) as { runId: string; complete: boolean };
  // ONE artifact, ONE identity: run A finished and wrote a complete verdict, and it is simply gone. That
  // is the defect — not a torn file, an ERASED run, with no way for A's launcher to tell.
  expect(survivor.runId).toBe("run-B");
  expect(existsSync(join(root, "reports", "runs"))).toBe(false);
});
