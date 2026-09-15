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
import type { RunSlot } from "@orb/tooling/_shared/artifacts";
import type { CliResult } from "../../support/tool-fixtures.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { plantedPolicySource } from "../../support/planted-gate-corpus.ts";
import { scaledBudget } from "../_load-budget.ts";

/** A valid descriptor whose `run` is a RENDEZVOUS: the first child holds its in-flight marker until the
 *  second child acknowledges that it has opened and scanned its own slot.
 *
 *  The census needs a conjunction: the leader marker exists before the follower scans, and the leader stays
 *  alive until that scan. The outer test establishes the first condition. Inside the planted policy, the in-flight census
 *  identifies the follower; it writes an acknowledgement only after its slot scan and
 *  returns immediately. The leader alone waits for that acknowledgement, so neither child can be stranded
 *  waiting for a sibling that has already departed.
 *
 *  `Atomics.wait` yields between checks without burning CPU. The slice budget is only a failsafe against a
 *  hang; normal completion is driven by the acknowledgement and the exact artifact assertions below. */
/** The ROOT is derived from a source file rather than handed in: a policy context exposes `relativePath`
 *  and the resolved fileset, never the root (the legacy `GateRunCtx.root` retired with its contract at
 *  #2176 Phase F). Subtracting the relative path from the absolute one is exact, and it fails LOUDLY (a
 *  throw inside the hook is a tool error) rather than silently reading the wrong directory. */
const slowHook = `evaluate: () => {
      const probe = ctx.files[0];
      if (probe === undefined) {
        throw new Error("the planted concurrency gate saw no source file — the fixture tree never loaded");
      }
      const absolute = probe.getFilePath();
      const root = absolute.slice(0, absolute.length - ctx.relativePath(probe).length - 1);
      const slots = join(root, "reports", "runs", "structure");
      const followerAck = join(root, "reports", "planted-concurrency-follower-ready");
      const open = readdirSync(slots).filter((name) => existsSync(join(slots, name, ".inflight"))).length;
      if (open >= 2) {
        writeFileSync(followerAck, "ready\\n");
        return;
      }
      for (let i = 0; i < MAX_SLICES && !existsSync(followerAck); i += 1) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SLICE_MS);
      }
    },`;

const slowPolicy = (repoRoot: string): string =>
  `import { existsSync, readdirSync, writeFileSync } from "node:fs";\nimport { join } from "node:path";\n\nconst SLICE_MS = 25;\nconst MAX_SLICES = 2000;\n\n${plantedPolicySource(
    { repoRoot, id: "planted-slow", subjectPath: "packages/x/src/unplanted.ts", token: "unplanted", extraHooks: slowHook },
  )}`;

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

/** How long to wait between checks for the leader's marker. It bounds the SPIN, never the wait: the loop
 *  below ends on the CONDITION and the case's own `scaledBudget` timeout is what can fail it. The file's
 *  `slowHook` comment already rules out a busy-wait here ("a load bomb for a timing fixture"). */
const MARKER_POLL_MS = 10;

/** The run id of the first slot carrying an in-flight marker, or null while none does. */
function inflightRunId(root: string): string | null {
  const base = slotDir(root);
  if (!existsSync(base)) {
    return null;
  }
  for (const name of readdirSync(base)) {
    const marker = join(base, name, ".inflight");
    if (existsSync(marker)) {
      return (JSON.parse(readFileSync(marker, "utf8")) as { runId: string }).runId;
    }
  }
  return null;
}

/** BLOCK until the leading child has WRITTEN its in-flight marker, and hand back the run id it wrote.
 *
 *  THIS IS THE ORDERING THE RACING CENSUS REQUIRES, AND NOTHING IN THIS FIXTURE USED TO PROVIDE IT (#2248).
 *  `openRunSlot` (tooling/src/_shared/artifacts.ts) computes `racing` by scanning the other slots' markers
 *  and only THEN writes its own — so a second run can name the first if and only if it opens its slot after
 *  the first's marker is on disk. The planted policy sleeps inside `evaluate`, which is strictly AFTER that window,
 *  so it widens the two runs' OVERLAP and orders nothing: `runs.some((r) => r.concurrent.length > 0)` was
 *  green solo, where two `Promise.all` children happen to stagger, and red under batch load, where both can
 *  scan before either writes. A fixture that claims determinism owes the ordering, not a wider budget.
 *
 *  Waiting on the marker is waiting on THE SIGNAL ITSELF, which is the distinction from the fix this must
 *  not be: a fixed delay before the assertion hopes the ordering happened and still passes when it did not.
 *  This returns only once the ordering is a FACT, and a leader that dies without writing one is a loud
 *  failure naming its own stderr rather than a silent fall-through to a green `some`. */
async function leaderRunId(root: string, leading: Promise<CliResult>): Promise<string> {
  // A BOX, not a bare `let`: the assignment happens in a callback, so a plain local narrows to `null` at
  // its declaration and the liveness check below reads as `never`. The property read re-widens across the
  // loop's await, which is exactly the shape this needs.
  const leader: { exited: CliResult | null } = { exited: null };
  leading.then(
    (result) => {
      leader.exited = result;
    },
    (error: unknown) => {
      leader.exited = { code: null, stdout: "", stderr: String(error), timedOut: false };
    },
  );
  for (;;) {
    const runId = inflightRunId(root);
    if (runId !== null) {
      return runId;
    }
    const exited = leader.exited;
    if (exited !== null) {
      throw new Error(
        `the leading \`verify structure\` child exited (code ${exited.code}) before writing an in-flight marker — there is no ordering to wait on.\n${exited.stderr}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, MARKER_POLL_MS));
  }
}

// EXPLICIT BUDGET: this case spawns two real CLI children, and a broken child can leave the leader in the
// acknowledgement loop until its 50s failsafe. The timeout owns that failure path under sibling load.
test("two concurrent `check:structure` runs both keep their verdict, and the pointer names a COMPLETE one", { timeout: scaledBudget(60_000) }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-slow.ts`]: slowPolicy(repoRoot) });
  // ORDERED, not raced (#2248 — see `leaderRunId`). The leader starts, and the follower starts only once
  // the leader's in-flight marker exists, which is the one fact `openRunSlot`'s racing census reads. The
  // two are still genuinely CONCURRENT: the planted policy keeps the leader inside `evaluate` until the follower
  // acknowledges reaching its own post-scan hook. `racing` keeps only markers whose pid is ALIVE, which
  // makes the census below a real observation of a live sibling rather than of a leftover.
  const leading = runCli("verify", ["structure"], { cwd: root });
  const leader = await leaderRunId(root, leading);
  const [a, b] = await Promise.all([leading, runCli("verify", ["structure"], { cwd: root })]);
  expect([a.code, b.code], `${a.stderr}\n${b.stderr}`).toEqual([0, 0]);

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

  // THE FOLLOWER SAW THE LEADER AND SAID SO — a race is named, never silently last-write-wins. Asserted as
  // the exact census now the ordering is enforced (#2248): `runs.some((r) => r.concurrent.length > 0)` was
  // the whole pin, and "at least one of them saw somebody" is satisfied by either child in either
  // direction, so it could only ever be as strong as the ordering underneath it — which was none.
  //
  // Both halves are load-bearing and only ONE of them is about the follower. The leader took its census
  // before the follower's slot existed, so an EMPTY `concurrent` on the leader is the correct answer and
  // asserting it is what stops this passing on a run that named everything it could see.
  const followers = runs.filter((r) => r.runId !== leader);
  expect(followers).toHaveLength(1);
  expect(followers[0]?.concurrent.join(" ")).toContain(leader);
  expect(runs.find((r) => r.runId === leader)?.concurrent).toEqual([]);
});

test("a run names the LIVE sibling holding a slot — the racing-writer census, deterministically", { timeout: scaledBudget(60_000) }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({ ...SCANNED, [`${GATE_DIR}/planted-slow.ts`]: slowPolicy(repoRoot) });
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

// ── #2221: FINISHING IS NOT PUBLISHING ────────────────────────────────────────────────────────────────
//
// THE DEFECT. `publishRunSlot` was the ONLY unlinker of the `.inflight` marker, and TWO run shapes finish
// without publishing: a GATE-SCOPED run (#1964) and a NON-VERDICT run (#2167). Both left a marker behind
// forever, `abandonedRuns` reports a marker whose pid is gone as a run that DIED, and `check:show` refuses
// the published pointer on exactly that signal — so a complete verdict was reported as "that run never
// finished". Measured on main 2026-09-12 over `reports/runs/structure/` (N=32): 17 slots carried a marker
// and 13 of those were FINISHED fixture-mode runs.
//
// BOTH DIRECTIONS, because a guard that only ever says "fine" is not a guard: closing DROPS the marker and
// leaves nothing abandoned, while a slot that is genuinely IN FLIGHT still carries one and is still found.

test("#2221 — a run that finishes WITHOUT publishing leaves no in-flight marker and nothing abandoned", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const A = await import("@orb/tooling/_shared/artifacts");
  const slot = A.openRunSlot(root, "closeprobe");
  // the guard's own precondition: opening a slot DOES arm the marker, so its absence below is a removal
  expect(existsSync(join(slot.dir, ".inflight"))).toBe(true);

  A.closeRunSlot(slot);

  expect(existsSync(join(slot.dir, ".inflight"))).toBe(false);
  // and nothing was published — closing is the FINISH half alone, never a pointer
  expect(existsSync(join(root, "reports", "closeprobe"))).toBe(false);
  expect(A.abandonedRuns(root, "closeprobe")).toEqual([]);
});

test("#2221 NEGATIVE CONTROL — a slot whose run is genuinely DEAD is still reported abandoned", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const A = await import("@orb/tooling/_shared/artifacts");
  const slot = A.openRunSlot(root, "closeprobe");
  // pid 1 is alive, so re-point the marker at a pid that cannot be: the marker + a DEAD pid IS the tell.
  writeFileSync(join(slot.dir, ".inflight"), JSON.stringify({ runId: slot.runId, pid: 2 ** 30, checkout: "planted", startedAt: "2026-09-01T00:00:00.000Z" }));

  expect(A.abandonedRuns(root, "closeprobe").map(({ runId }) => runId)).toEqual([slot.runId]);
});

test("an adopted run slot transfers its in-flight ownership without minting another identity", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const A = await import("@orb/tooling/_shared/artifacts");
  const slot = A.openRunSlot(root, "ct");
  const markerPath = join(slot.dir, ".inflight");
  writeFileSync(markerPath, JSON.stringify({ runId: slot.runId, pid: 1, checkout: "stale", startedAt: "2026-09-01T00:00:00.000Z" }));

  const adopted = A.transferRunSlotOwnership(root, slot);
  const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { readonly runId: string; readonly pid: number };
  expect(adopted.dir).toBe(slot.dir);
  expect(marker).toMatchObject({ runId: slot.runId, pid: process.pid });
  expect(readdirSync(join(root, "reports", "runs", "ct"))).toEqual([slot.runId]);
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

test("concurrent publishers pruning ONE over-capacity ring never throw at each other's deletions", { timeout: scaledBudget(120_000) }, async ({
  plantedTree,
  repoRoot,
}) => {
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

test("PLANTED CONTROL: the old fixed-path writer loses one of two concurrent runs", { timeout: scaledBudget(60_000) }, async ({ plantedTree }) => {
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

// ── RETENTION IS BY AGE, NOT BY COUNT ALONE (#1341) ────────────────────────────────────────────────────
//
// THE DEFECT THESE PIN. `pruneRuns` kept the ten newest slots per instrument plus any slot a published
// pointer still resolves into. A `--no-shot` / `--eval` / `--text` run publishes NO pointer (`out=(none)`),
// so it is unreferenced and dies the moment ten newer runs land — while its end card printed
// `EVIDENCE <abs run.json>` as the receipt a review cites. Measured 2026-09-04 (cold-agent dogfood on
// /chats): side-eye cited `main-1723882-…T15-36-25-462Z` and `main-1726501-…T15-37-04-376Z` for a P1;
// twenty minutes later neither directory existed and `--reports` did not list them, so the P1 was
// unfalsifiable. 135 slots survived on disk that day — the ones carrying pointers.
//
// THE CONTRACT: no slot is pruned before `RETENTION_FLOOR_MS` (24h) whatever its references, the count cap
// applies only PAST that age, and a pruned run is RECORDED — a citation that resolves to nothing has to
// say why it is gone rather than read as a typo.

/** A slot another process left behind: an artifact, no in-flight marker, no pointer naming it. */
function plantSlot(root: string, instrument: string, id: string, at?: Date): string {
  const dir = join(root, "reports", "runs", instrument, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "artifact.json"), JSON.stringify({ runId: id }));
  if (at !== undefined) {
    utimesSync(dir, at, at);
  }
  return dir;
}

function plantedRunSlot(root: string, instrument: string, runId: string, at?: Date): RunSlot {
  return { instrument, runId, dir: plantSlot(root, instrument, runId, at), relDir: join("reports", "runs", instrument, runId), racing: [] };
}

const RETENTION_INSTRUMENT = "retainprobe";
/** Past `RETAINED_RUNS` (10) on purpose: the count cap alone would have deleted the oldest two. */
const CHEAP_RUNS = 12;
const RING_CAP_PLANTS = 10;

test("twelve POINTER-LESS runs published inside one minute all survive the ring", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const A = await import("@orb/tooling/_shared/artifacts");
  const base = join(root, "reports", "runs", RETENTION_INSTRUMENT);

  for (let i = 0; i < CHEAP_RUNS; i += 1) {
    // `[]` is the `--no-shot`/`--eval` run: it publishes no `latest` pointer at all, which is exactly the
    // shape the old ring treated as disposable.
    A.publishRunSlot(root, plantedRunSlot(root, RETENTION_INSTRUMENT, `cheap-${String(i).padStart(2, "0")}`), []);
  }

  // Every EVIDENCE path those twelve runs printed still resolves. Under the count-only ring the two
  // oldest were deleted by the eleventh publish, inside one minute of being cited.
  expect(readdirSync(base).sort()).toEqual(Array.from({ length: CHEAP_RUNS }, (_, i) => `cheap-${String(i).padStart(2, "0")}`));
  expect(readdirSync(base).every((name) => existsSync(join(base, name, "artifact.json")))).toBe(true);
});

test("past the age floor the count cap applies, and the pruned run is RECORDED rather than vanishing", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const A = await import("@orb/tooling/_shared/artifacts");
  const base = join(root, "reports", "runs", RETENTION_INSTRUMENT);
  // Frozen literal, not `Date.now() - N` — the determinism law bans the ambient clock in a fixture, and a
  // 2026-01 slot is past any floor this ring will ever carry.
  plantSlot(root, RETENTION_INSTRUMENT, "ancient-00", new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
  for (let i = 0; i < RING_CAP_PLANTS; i += 1) {
    plantSlot(root, RETENTION_INSTRUMENT, `fresh-${String(i).padStart(2, "0")}`);
  }
  A.publishRunSlot(root, plantedRunSlot(root, RETENTION_INSTRUMENT, "publisher-00"), []);

  // The floor is not a licence to keep everything: an aged slot past the cap still goes.
  expect(existsSync(join(base, "ancient-00"))).toBe(false);
  // …and nothing young went with it.
  expect(readdirSync(base).filter((name) => name.startsWith("fresh-"))).toHaveLength(RING_CAP_PLANTS);

  // THE RECEIPT: a bounded ledger beside the slots names what was deleted and when, so `--reports` can
  // answer a citation that no longer resolves with `PRUNED <id> <when>` instead of with silence.
  const ledger = readFileSync(join(base, ".pruned.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { readonly runId: string; readonly prunedAt: string });
  expect(ledger.map((row) => row.runId)).toEqual(["ancient-00"]);
  expect(Number.isFinite(Date.parse(ledger[0]?.prunedAt ?? ""))).toBe(true);
});

// ── #2262: CLOSING IS NOT PUBLISHING, AND IT IS NOT PRUNING EITHER ────────────────────────────────────
//
// THE DEFECT. `closeRunSlot` was `publishRunSlot(root, slot, [])`. The honest NAME was the point of #2221
// — a bare `publishRunSlot(…, [])` on a non-publishing path reads as a mistake and gets "tidied" back into
// the bug — and that ruling stands. What the delegation carried with it was a SIDE EFFECT: publishing ends
// with `pruneRuns`, so every run that merely CLOSED pruned the evidence ring too.
//
// WHY THAT IS A DEFECT AND NOT MERELY UNTIDY. `closeRunSlot`'s two callers are precisely the runs with no
// standing to delete anybody's evidence: a GATE-SCOPED run (#1964) and a NON-VERDICT run (#2167). The
// gate-scoped one is the #1584 per-conversion floor — cheap, narrow and run constantly — and it publishes
// no pointer, so it adds nothing to the ring while evicting from it. `pruneRuns` spares the in-flight, the
// just-finished and any slot a pointer resolves into; an older WHOLE-CORPUS verdict that no longer holds
// `latest` is none of those, so a burst of `--check <id>` floors can retire exactly the evidence #1341
// exists to keep.
//
// THE CONTRACT: closing and publishing share the UNLINK (and the honest empty `.published` manifest) and
// do not share the PRUNE. Deleting evidence is a publisher's act.

const CLOSE_INSTRUMENT = "closeprobe";

test("a CLOSED run drops its marker and prunes NOTHING — only a publisher may retire evidence (#2262)", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const A = await import("@orb/tooling/_shared/artifacts");
  const base = join(root, "reports", "runs", CLOSE_INSTRUMENT);
  // One slot past any age floor the ring will ever carry: under the count cap it is the row a PUBLISH
  // deletes, which is what makes it the discriminating subject here rather than a decoration.
  plantSlot(root, CLOSE_INSTRUMENT, "ancient-00", new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
  for (let i = 0; i < RING_CAP_PLANTS; i += 1) {
    plantSlot(root, CLOSE_INSTRUMENT, `fresh-${String(i).padStart(2, "0")}`);
  }

  const closing = plantedRunSlot(root, CLOSE_INSTRUMENT, "closer-00");
  writeFileSync(
    join(closing.dir, ".inflight"),
    JSON.stringify({ runId: "closer-00", pid: process.pid, checkout: "planted", startedAt: "2026-09-01T00:00:00.000Z" }),
  );
  A.closeRunSlot(closing);

  // THE HALF #2221 WON, still true: the marker is gone, so `abandonedRuns` cannot report this finished run
  // as one that DIED.
  expect(existsSync(join(closing.dir, ".inflight"))).toBe(false);
  expect(A.abandonedRuns(root, CLOSE_INSTRUMENT)).toEqual([]);

  // THE #2262 HALF: the aged slot a publisher would have retired is untouched, and nothing was recorded as
  // pruned — a run that declines to speak for the corpus does not get to decide what evidence survives.
  expect(existsSync(join(base, "ancient-00"))).toBe(true);
  expect(A.prunedRuns(root, CLOSE_INSTRUMENT)).toEqual([]);
  expect(readdirSync(base).sort()).toEqual(
    ["ancient-00", "closer-00", ...Array.from({ length: RING_CAP_PLANTS }, (_, i) => `fresh-${String(i).padStart(2, "0")}`)].sort(),
  );
});

test("POSITIVE CONTROL: the same ring, the same aged slot, a PUBLISH — and it is retired and recorded (#2262)", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const A = await import("@orb/tooling/_shared/artifacts");
  const base = join(root, "reports", "runs", CLOSE_INSTRUMENT);
  plantSlot(root, CLOSE_INSTRUMENT, "ancient-00", new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
  for (let i = 0; i < RING_CAP_PLANTS; i += 1) {
    plantSlot(root, CLOSE_INSTRUMENT, `fresh-${String(i).padStart(2, "0")}`);
  }

  A.publishRunSlot(root, plantedRunSlot(root, CLOSE_INSTRUMENT, "publisher-00"), []);

  // Without this arm the case above would pass just as well on a ring that prunes nothing EVER — which is
  // a different bug wearing the same green. The prune still works; it is now a publisher's act alone.
  expect(existsSync(join(base, "ancient-00"))).toBe(false);
  expect(A.prunedRuns(root, CLOSE_INSTRUMENT).map((r) => r.runId)).toEqual(["ancient-00"]);
});
