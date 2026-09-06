// THE LYING-TOOL PIN for two `pnpm ct:scoped` runners in ONE worktree (#1581).
//
// THE DEFECT, measured 2026-09-04: the ct arm cleared and rebuilt ONE shared dir (`playwright/.cache`) per
// worktree, so a second runner's clear+rebuild landed under the first's live vite server and the FIRST run
// reported failures in tests it never touched — `201/2`, both reds at rpg-context-section.ct.tsx:738,:754,
// then `203/203` for the same file set alone at the same box load. Nothing in the run said a word: it
// printed an ordinary CT SUMMARY, which is the shape this repo fixes on sight.
//
// TWO HALVES PINNED HERE, both directions each:
//   · the CACHE is per invocation (two leases never share a directory, and each is REMOVED on release), and
//   · the LOCK detects a live sibling and REFUSES with the holder's pid — while a stale lock (a killed run)
//     is stolen rather than obeyed, because a lock nobody holds must never wedge the tree.
//
// NO REAL CT BATCH RUNS HERE. Proving the race by launching two chromium fleets under load is exactly the
// experiment the lane was told not to run; the mechanism is a lockfile + a path, and both are pure enough
// to drive with a fake pid table. The CLI-tier arm (a held lock makes `cli.ts scoped-test ct` exit 2 before
// it spawns anything) lives in scoped-test.int.test.ts, where the refusal costs no runner.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { vi } from "vitest";
import { readConcurrencyProfile } from "../../../../tooling/src/_shared/concurrency-profile.ts";
import { CT_CACHE_DIR_ENV } from "../../../../tooling/src/_shared/ct-run-slot.ts";
import { acquireCtRunnerLock, acquireCtRunnerSlots, CT_RUN_DIR_REL, ctRunnerLockPath } from "../../../../tooling/src/verify/lib/ct-runner-lock.ts";
import { HOST_POOL_ROOT_ENV, hostPoolDir } from "../../../../tooling/src/verify/lib/host-slots.ts";

import { expect, test } from "../../../support/tool-fixtures.ts";

/** A disposable worktree root. */
function scratchRoot(): string {
  return mkdtempSync(join(tmpdir(), "orb-ct-lock-"));
}

/** Nobody is alive but the pid we name — the fake process table that makes the stale arm deterministic. */
function aliveOnly(...pids: readonly number[]): (pid: number) => boolean {
  return (pid): boolean => pids.includes(pid);
}

test("a SECOND runner in the same worktree is refused, and the refusal names the live holder (#1581)", () => {
  const root = scratchRoot();
  try {
    const first = acquireCtRunnerLock(root, { pid: 4242, alive: aliveOnly(4242, 4243) });
    expect(first.kind).toBe("held");

    const second = acquireCtRunnerLock(root, { pid: 4243, alive: aliveOnly(4242, 4243) });
    expect(second.kind, "the second runner must not get a lease while the first is live").toBe("busy");
    if (second.kind !== "busy") {
      throw new Error("#1581 pin: the busy arm did not report a holder");
    }
    expect(second.holder.pid).toBe(4242);
    // The refusal must be ACTIONABLE, not just a denial: who holds it, why it matters, and what to do.
    expect(second.refusal).toContain("pid 4242");
    expect(second.refusal).toContain("#1581");
    expect(second.refusal).toContain("DIFFERENT worktree");
    expect(second.refusal).toContain("CT_PORT");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sequential runs are UNAFFECTED — release hands the tree back (#1581 positive control)", () => {
  const root = scratchRoot();
  try {
    const first = acquireCtRunnerLock(root, { pid: 5001, alive: aliveOnly(5001, 5002) });
    if (first.kind !== "held") {
      throw new Error("#1581 pin: the first lock was refused on an empty tree");
    }
    first.lease.release();
    expect(existsSync(ctRunnerLockPath(root)), "release must remove the lockfile").toBe(false);

    const second = acquireCtRunnerLock(root, { pid: 5002, alive: aliveOnly(5001, 5002) });
    expect(second.kind, "a run AFTER another finished is the normal case and must not be refused").toBe("held");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two concurrent leases get DISTINCT build caches, each removed on release (#1581)", () => {
  const root = scratchRoot();
  try {
    // The real fix, independent of the lock: even bypassed (a caller with its own pid table), two runs can
    // never build in the same directory — the corruption needed a SHARED one.
    const a = acquireCtRunnerLock(root, { pid: 6001, alive: aliveOnly(), now: (): Date => new Date(1000) });
    const b = acquireCtRunnerLock(root, { pid: 6002, alive: aliveOnly(), now: (): Date => new Date(2000) });
    if (a.kind !== "held" || b.kind !== "held") {
      throw new Error("#1581 pin: a stale-lock steal should have granted both leases");
    }
    expect(a.lease.cacheDir).not.toBe(b.lease.cacheDir);
    // …and neither is the shared default the defect lived in.
    expect(a.lease.cacheDir).not.toContain(join("playwright", ".cache"));
    expect(a.lease.cacheDir).toContain(CT_RUN_DIR_REL);
    expect(existsSync(a.lease.cacheDir), "a lease's cache dir exists before the build").toBe(true);
    a.lease.release();
    expect(existsSync(a.lease.cacheDir), "release removes the build dir — no accumulation across runs").toBe(false);
    expect(existsSync(b.lease.cacheDir), "…and never a sibling's").toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a STALE lock (its holder is gone) is stolen, loudly, never obeyed (#1581)", () => {
  const root = scratchRoot();
  try {
    const seed = acquireCtRunnerLock(root, { pid: 7001, alive: aliveOnly(7001) });
    if (seed.kind !== "held") {
      throw new Error("#1581 pin: could not seed a lock");
    }
    // The killed run's file survives; its process does not.
    const next = acquireCtRunnerLock(root, { pid: 7002, alive: aliveOnly(7002) });
    expect(next.kind, "a lock nobody holds must never wedge the next run").toBe("held");
    if (next.kind !== "held") {
      throw new Error("#1581 pin: the steal did not produce a lease");
    }
    // The self-heal is REPORTED — a silent steal would hide a runner that is actually alive under a pid
    // this probe could not see.
    expect(next.lease.stolenFrom).toBe(7001);
    expect(JSON.parse(readFileSync(ctRunnerLockPath(root), "utf8")), "the lockfile now names the new holder").toMatchObject({ pid: 7002 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the CT config ROUTES the launcher's cache dir into playwright's own knob (#1581 red-first)", async () => {
  // The half a lock cannot give you: playwright-ct resolves `use.ctCacheDir` (or defaults to the SHARED
  // `playwright/.cache`), so unless the config reads the launcher's directory, two runs still build in one
  // place. Asserting the knob rather than a build proves the wiring without a chromium. Against the
  // pre-#1581 config this expectation reads `undefined`.
  const dir = mkdtempSync(join(tmpdir(), "orb-ct-cache-"));
  // `vi.stubEnv`, not a raw `process.env` write: the house door for an env seam under test (the
  // lifecycle int test's idiom), and it restores itself.
  vi.stubEnv(CT_CACHE_DIR_ENV, dir);
  try {
    // A COMPUTED specifier, deliberately: `playwright-ct.config.ts` is EXCLUDED from the root type program
    // by ruling (tsconfig.json — the dual-vite type world its @playwright/experimental-ct-react pin
    // creates), and a static import here would drag it back in and red `types:graph` on the config's own
    // `process.env.CI` reads. A runtime import still executes the REAL config, which is the subject.
    const specifier = pathToFileURL(join(import.meta.dirname, "..", "..", "..", "..", "playwright-ct.config.ts")).href;
    const loaded = (await import(specifier)) as { readonly default?: { readonly use?: { readonly ctCacheDir?: string } } };
    expect(loaded.default?.use?.ctCacheDir, "the config must hand playwright the per-invocation dir").toBe(dir);
  } finally {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a MALFORMED lockfile is debris, not a holder (#1581)", () => {
  const root = scratchRoot();
  try {
    const first = acquireCtRunnerLock(root, { pid: 8001, alive: aliveOnly(8001) });
    if (first.kind !== "held") {
      throw new Error("#1581 pin: could not seed a lock");
    }
    // A half-written file (a runner killed mid-write) must not be readable as "someone holds this forever".
    writeFileSync(ctRunnerLockPath(root), '{"pid": ');
    const next = acquireCtRunnerLock(root, { pid: 8002, alive: aliveOnly(8001, 8002) });
    expect(next.kind).toBe("held");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── THE HOST-WIDE CT CAP (#1835) ───────────────────────────────────────────────────────────────────────
// Everything above is about ONE WORKTREE. `acquireCtRunnerSlots` adds the second cap — at most
// `ctRunnersHostWide` chromium fleets on the whole BOX — and the two behave DIFFERENTLY on purpose: the
// local lock REFUSES a corrupting sibling instantly, the host pool WAITS for a busy box. A refused CT run
// is an exit-2 tool error in a lane, which breaks a merge train; waiting costs only wall clock.
// The pool's own mechanics (steal, degrade, release) are pinned in host-slots.test.ts; what only THIS file
// can answer is that the CT door composes the two in the right ORDER and frees both.

/** A scratch per-user runtime dir, so a test never touches the REAL /run/user/<uid> CT pool — a planted
 *  holder there would block an operator's live `pnpm ct:scoped`. */
function scratchRuntime(): NodeJS.ProcessEnv {
  return { [HOST_POOL_ROOT_ENV]: mkdtempSync(join(tmpdir(), "orb-ct-host-")) };
}

/** Where the CT host pool's slot files live for a given scratch runtime dir. The `label`/`waitBaseMs` are
 *  irrelevant to the path — only `name` is — so this reads the same directory the door writes. */
function ctSlotFile(env: NodeJS.ProcessEnv, slot: number): string {
  return join(hostPoolDir({ name: "ct", label: "", slots: 1, waitBaseMs: 1 }, env), `${String(slot)}.lock`);
}

const HOST_CT_SLOTS = readConcurrencyProfile({}).ctRunnersHostWide;

test("the CT door takes BOTH caps and releases BOTH (#1581 local + #1835 host-wide)", async () => {
  const root = scratchRoot();
  const env = scratchRuntime();
  try {
    const held = await acquireCtRunnerSlots(root, { pid: 9001, alive: aliveOnly(9001), host: { env, pid: 9001, alive: aliveOnly(9001) } });
    expect(held.kind).toBe("held");
    if (held.kind !== "held") {
      return;
    }
    expect(held.lease.hostSlot, "a free box hands out the first host slot").toBe(1);
    expect(existsSync(ctRunnerLockPath(root)), "the per-worktree lock is held too").toBe(true);
    expect(existsSync(ctSlotFile(env, 1)), "and so is the host slot").toBe(true);

    held.lease.release();
    expect(existsSync(ctRunnerLockPath(root)), "release frees the worktree lock").toBe(false);
    expect(existsSync(ctSlotFile(env, 1)), "release frees the host slot too").toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
  }
});

test("a LOCAL refusal never occupies a host slot — the doomed run is refused before it takes one", async () => {
  const root = scratchRoot();
  const env = scratchRuntime();
  try {
    const first = acquireCtRunnerLock(root, { pid: 9101, alive: aliveOnly(9101, 9102) });
    expect(first.kind).toBe("held");
    const second = await acquireCtRunnerSlots(root, { pid: 9102, alive: aliveOnly(9101, 9102), host: { env, pid: 9102, alive: aliveOnly(9101, 9102) } });
    expect(second.kind, "a live sibling in the SAME tree is still a refusal, not a queue").toBe("busy");
    expect(existsSync(ctSlotFile(env, 1)), "and it took no host slot on its way out").toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
  }
});

test("a run in ANOTHER worktree WAITS for a host slot rather than being refused, and names what it is behind", async () => {
  const env = scratchRuntime();
  // One worktree per runner — the shape the per-worktree lock is structurally blind to, and the shape six
  // lanes on this box actually take.
  const roots = Array.from({ length: HOST_CT_SLOTS + 1 }, () => scratchRoot());
  try {
    for (let i = 0; i < HOST_CT_SLOTS; i += 1) {
      const lock = await acquireCtRunnerSlots(roots[i] ?? "", { pid: 9200 + i, alive: () => true, host: { env, pid: 9200 + i, alive: () => true } });
      expect(lock.kind, "each worktree gets its own local lock").toBe("held");
    }
    expect(existsSync(ctSlotFile(env, HOST_CT_SLOTS)), "the host pool is now full").toBe(true);

    const queuedBehind: string[] = [];
    let clockMs = 7_000_000;
    const extra = await acquireCtRunnerSlots(roots[HOST_CT_SLOTS] ?? "", {
      pid: 9299,
      alive: () => true,
      host: {
        env,
        pid: 9299,
        alive: () => true,
        now: () => new Date(clockMs),
        // The real ceiling is load-scaled off 45 minutes; the injected clock jumps a day per poll so the
        // degrade arm is reached in one iteration instead of in wall-clock time.
        sleep: (ms) => {
          clockMs += ms + 86_400_000;
          return Promise.resolve();
        },
        onQueued: (holder) => queuedBehind.push(holder.label),
        onNotice: () => undefined,
      },
    });
    expect(queuedBehind.length, "the waiter names the holder it is behind").toBe(1);
    expect(extra.kind, "a busy BOX is never a refusal — only a corrupting sibling in the same tree is").toBe("held");
    // Read unconditionally: a conditional expect can pass by never running, which is the one thing this
    // arm must not do.
    expect(extra.kind === "held" ? extra.lease.hostSlot : "REFUSED", "past the ceiling it proceeds unslotted rather than dying").toBeNull();
  } finally {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
    rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
  }
});
