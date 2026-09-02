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
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, utimesSync, writeFileSync } from "node:fs";
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
    // A FROZEN startedAt: the census keys off the marker's pid liveness, never its age, so a literal keeps
    // the fixture deterministic (test-determinism bans the ambient clock).
    JSON.stringify({ runId: "planted-sibling", pid: process.pid, checkout: "planted", startedAt: "2026-09-01T00:00:00.000Z" }),
  );

  expect((await runCli("verify", ["structure"], { cwd: root })).code).toBe(0);
  expect(published(root).concurrent.join(" ")).toContain("planted-sibling");
});

// ── THE PRUNE RACE (#1029 adversarial verification, 2026-09-02) ────────────────────────────────────────
//
// WHAT THE TWO CASES ABOVE COULD NOT SEE. Both run on a FRESH root, where the ring never reaches capacity
// and `pruneRuns` deletes nothing — so `statSync(...).mtimeMs`, the one per-slot read in the prune chain
// that answered a vanished slot with a THROW instead of a value, was never reached with a sibling in the
// window. The verifier reproduced it 12/15 trials with two publishers over a 12-slot ring: the ENOENT
// escaped `publishRunSlot` BEFORE the instrument returned its verdict, so a green run exited 2 with a raw
// stack and lost its history entry. All five instrument families share that call site.
//
// THE TWO PRECONDITIONS THIS CASE PLANTS, because neither arrives by accident:
//   1. a ring ALREADY OVER capacity — 12 stale slots, so every publisher has real deletions to perform;
//   2. publishes SYNCHRONIZED to overlap — the children meet at a RENDEZVOUS before publishing instead of
//      racing from spawn, so their filter-chain-then-delete windows interleave rather than serialize. The
//      barrier is a directory of readiness markers, not a wall-clock deadline: nobody reads a clock (the
//      determinism law bans the ambient one), the meet is TIGHTER than a deadline can be under load, and a
//      bounded spin means a crashed sibling costs one round's overlap rather than a hung suite.
// Three rounds on three fresh rings, four publishers each: bounded (the box carries sibling lanes) and
// far past the measured per-trial reproduction rate. The green direction is not probabilistic — the guard
// removes the failure mode, it does not narrow the window.

/** A publisher that does exactly what every instrument's finish step does — open a slot, write one
 *  artifact, publish + prune — but waits at a RENDEZVOUS so every sibling reaches its prune together.
 *  `Atomics.wait` sleeps a DURATION and reads no clock; the spin cap is what keeps a dead sibling from
 *  hanging the round. */
const PRUNE_RACER = `import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [artifacts, root, instrument, publishers, rendezvous, spinCap, spinMs] = process.argv.slice(2);
const A = await import(pathToFileURL(artifacts).href);
const slot = A.openRunSlot(root, instrument);
writeFileSync(A.runFile(slot, "artifact.json"), JSON.stringify({ runId: slot.runId }));
mkdirSync(rendezvous, { recursive: true });
writeFileSync(join(rendezvous, String(process.pid)), "");
for (let spin = 0; spin < Number(spinCap) && readdirSync(rendezvous).length < Number(publishers); spin += 1) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(spinMs));
}
A.publishRunSlot(root, slot, [{ alias: "artifact.json", target: "artifact.json" }]);
`;

const RACER = "prune-racer.mjs";
const RACE_INSTRUMENT = "raceprobe";
/** Slots pre-planted per round — past `RETAINED_RUNS` (10), so every publisher has deletions to do. */
const STALE_SLOTS = 12;
const PUBLISHERS = 4;
const ROUNDS = 3;
/** The rendezvous spin: `SPIN_CAP` × `SPIN_MS` is the ceiling a child waits for its siblings (2s — past
 *  four niced `spawnNiced` starts under lane load) before publishing anyway, so no round can hang. */
const SPIN_CAP = 400;
const SPIN_MS = 5;
const RENDEZVOUS = "rendezvous";

/** A ring already OVER capacity: prunable slots (no in-flight marker, no published manifest, no pointer
 *  naming them), with distinct mtimes so the age sort is real work rather than a tie. */
function plantStaleRing(root: string): void {
  for (let i = 0; i < STALE_SLOTS; i += 1) {
    const dir = join(root, "reports", "runs", RACE_INSTRUMENT, `stale-${String(i).padStart(2, "0")}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "artifact.json"), JSON.stringify({ runId: `stale-${i}` }));
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, i));
    utimesSync(dir, at, at);
  }
}

/** The line of a child's stderr that NAMES the failure — the `Error: ENOENT …` line when there is one,
 *  else the first line. A stack's first three lines are the source excerpt, not the message, so slicing
 *  from the top quotes `const stats = binding.stat(` and hides which errno fired. */
function errorLine(stderr: string): string {
  const lines = stderr.trim().split("\n");
  return (lines.find((l) => l.includes("Error:")) ?? lines[0] ?? "").trim();
}

function raceSlots(root: string): readonly string[] {
  return readdirSync(join(root, "reports", "runs", RACE_INSTRUMENT));
}

test("concurrent publishers pruning ONE over-capacity ring never throw at each other's deletions", { timeout: 120_000 }, async ({ plantedTree, repoRoot }) => {
  const { spawnNiced } = await import("@orb/tooling/_shared/proc");
  const artifacts = join(repoRoot, "tooling", "src", "_shared", "artifacts.ts");

  for (let round = 0; round < ROUNDS; round += 1) {
    const root = await plantedTree({ [RACER]: PRUNE_RACER });
    plantStaleRing(root);
    const rendezvous = join(root, RENDEZVOUS);
    const results = await Promise.all(
      Array.from({ length: PUBLISHERS }, () =>
        spawnNiced(process.execPath, [join(root, RACER), artifacts, root, RACE_INSTRUMENT, String(PUBLISHERS), rendezvous, String(SPIN_CAP), String(SPIN_MS)]),
      ),
    );

    // THE DEFECT, stated as the assertion: a publisher whose sibling removed a stale slot mid-prune exited
    // non-zero with an ENOENT stack — from code that had already landed every artifact and pointer, so the
    // run's OWN verdict was thrown away by its cleanup step.
    const failed = results.filter((r) => r.code !== 0);
    expect(failed.map((r) => `exit ${String(r.code)}: ${errorLine(r.stderr)}`)).toEqual([]);
    // Named separately from the exit code: a publisher that ENOENTs on a sibling's deletion is THIS defect,
    // and a red here that quoted only "exit 1" would send the next reader hunting the wrong failure.
    expect(results.flatMap((r) => (r.stderr.includes("ENOENT") ? [errorLine(r.stderr)] : []))).toEqual([]);

    // …and the guard must not have bought that by disabling retention: the ring shed slots, every
    // publisher's own artifact survived, and the pointer still resolves into one of them.
    const remaining = raceSlots(root);
    expect(remaining.length).toBeLessThan(STALE_SLOTS + PUBLISHERS);
    expect(remaining.length).toBeGreaterThanOrEqual(PUBLISHERS);
    const target = readlinkSync(join(root, "reports", "artifact.json"));
    expect(remaining.some((name) => target.includes(name))).toBe(true);
    expect(readFileSync(join(root, "reports", "artifact.json"), "utf8")).toContain("runId");
  }
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
