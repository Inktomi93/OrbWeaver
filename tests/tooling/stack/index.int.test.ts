// Shell-level dispatch tests: these drive the REAL `tooling/src/stack/stack.sh` argument handling, not the
// parser it delegates to.
//
// WHY THIS FILE EXISTS. `tests/tooling/stack-mode.test.ts` pins `parseStackArgv` — and that was not
// enough, because the shell used to classify argv ITSELF and only ever looked for a mode in argument
// position 2. Anything it did not recognise fell through to DEV, silently, and the parser those unit
// tests pin never saw the argv at all. Three driven counterexamples (2026-08-07):
//   • `up --debug prod`   → ran the DEV stack with the debug surface armed
//   • `up --nope`         → ran the DEV stack, flag dropped on the floor
//   • `restart --force prod` → reached `do_force_restart`, which SIGKILLs whatever holds :8788/:5173
//     AND the entire detached vLLM fleet, drops the pidfile, then boots DEV
// A green unit suite over a parser the shell bypasses is a green suite over nothing. So every case below
// spawns bash on the actual script.
//
// MECHANISM: `STACK_DISPATCH_PROBE=1` makes stack.sh print its classification and exit immediately —
// after classification, before any action — so nothing is spawned, no port is touched, and the prod
// supervisor is never exec'd. `.int.test.ts` because it shells out; it writes nothing to the tree.
import type { SpawnSyncReturns } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { probeServedTransform } from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const STACK_SH = fileURLToPath(new URL("../../../tooling/src/stack/stack.sh", import.meta.url));
const ENGINES_SH = fileURLToPath(new URL("../../../tooling/src/stack/engines.sh", import.meta.url));
const DEV_IDENTITY_ENTRY = fileURLToPath(new URL("../../../tooling/src/stack/ops/dev-identity-entry.ts", import.meta.url));
/** The refusal every unclearable identity must still carry (hoisted: no per-call regex literals). */
const MANUAL_CLEANUP_INT_RE = /manual cleanup|relaunch/u;

interface Dispatch {
  readonly status: number;
  readonly line: string;
  readonly stderr: string;
}

function dispatch(...argv: readonly string[]): Dispatch {
  // `SpawnSyncReturns<string | null>`, not node's `<string>`: a spawn that never STARTS (no `bash`
  // on PATH) returns null for both pipes, so the `?? ""` guards below are load-bearing.
  const res: SpawnSyncReturns<string | null> = spawnSync("bash", [STACK_SH, ...argv], {
    encoding: "utf8",
    env: { ...process.env, STACK_DISPATCH_PROBE: "1" },
  });
  const line = (res.stdout ?? "").split("\n").find((l) => l.startsWith("DISPATCH ")) ?? "";
  return { status: res.status ?? -1, line, stderr: res.stderr ?? "" };
}

// ── the three refuted counterexamples ────────────────────────────────────────────────────────────────

test("a mode AFTER a flag still routes to prod — position 2 is not the only place a mode may appear", () => {
  const got = dispatch("up", "--debug", "prod");
  expect(got.status).toBe(0);
  expect(got.line).toContain("mode=prod");
  expect(got.line).toContain("debug=1");
});

test("an unknown flag EXITS 2 with usage — it never falls through to dev", () => {
  const got = dispatch("up", "--nope");
  expect(got.status).toBe(2);
  expect(got.line).toBe("");
  expect(got.stderr).toContain("unknown flag '--nope'");
  expect(got.stderr).toContain("usage: stack.sh");
});

test("`restart --force prod` REFUSES — the dev force-teardown must never run against a prod request", () => {
  // The defect this pins: force-restart SIGKILLs the :8788/:5173 holders AND the detached vLLM fleet,
  // ignoring ownership. Reaching it from an argv that said `prod` is a destructive verb aimed at the
  // wrong mode. Exit 2 and touch nothing.
  const got = dispatch("restart", "--force", "prod");
  expect(got.status).toBe(2);
  expect(got.line).toBe("");
  expect(got.stderr).toContain("--force is dev-only");
});

// ── nothing unclassifiable is allowed to proceed ─────────────────────────────────────────────────────

test("an unknown verb exits 2 with usage; start-fg prod now dispatches as FOREGROUND prod", () => {
  const unknown = dispatch("frobnicate");
  expect(unknown.status).toBe(2);
  expect(unknown.stderr).toContain("unknown verb 'frobnicate'");
  // start-fg used to be dev-only and refused in prod. It is NOW the FOREGROUND prod run — the on-box direct
  // launch (`NODE_ENV=production node <entry>.ts` in this terminal, no pidfile) that replaced `pnpm start`
  // (launch-centralize / #309). The shell classifies it and routes mode=prod to stack-prod.ts.
  const fg = dispatch("start-fg", "prod");
  expect(fg.status).toBe(0);
  expect(fg.line).toBe("DISPATCH verb=start-fg mode=prod debug=0 force=0 rest=");
});

test("--build is refused in dev at the SHELL, not silently ignored", () => {
  const got = dispatch("up", "--build");
  expect(got.status).toBe(2);
  expect(got.stderr).toContain("--build is prod-only");
});

// ── the pre-mode call sites still dispatch byte-identically ──────────────────────────────────────────

test("playwright / snap-stage / multi-user-fixture spellings survive the delegation", () => {
  // These three are spelled by NAME in playwright.config.ts, snap-stage.ts and multi-user-fixture.sh.
  expect(dispatch("start").line).toBe("DISPATCH verb=start mode=dev debug=0 force=0 rest=");
  expect(dispatch("stop").line).toBe("DISPATCH verb=stop mode=dev debug=0 force=0 rest=");
  expect(dispatch("start-fg").line).toBe("DISPATCH verb=start-fg mode=dev debug=0 force=0 rest=");
});

test("the dev force-restart spellings still reach the force path, and a bare call is status dev", () => {
  expect(dispatch("restart", "--force").line).toBe("DISPATCH verb=restart mode=dev debug=0 force=1 rest=");
  expect(dispatch("force-restart").line).toBe("DISPATCH verb=restart mode=dev debug=0 force=1 rest=");
  expect(dispatch().line).toBe("DISPATCH verb=status mode=dev debug=0 force=0 rest=");
});

test("foreign fleet-shaped argv receives zero signals from the strict dev identity door", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-foreign-stack-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 60_000)", ".cache/vllm/venv EngineCore Worker_TP"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
  });
  await once(child, "spawn");
  const pid = child.pid;
  expect(pid).toBeGreaterThan(1);
  if (pid === undefined || pid <= 1) {
    throw new Error("foreign-stack probe did not receive a safe child pid");
  }
  try {
    const probe = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "probe"], { cwd: repoRoot, encoding: "utf8" });
    expect(probe.status).toBe(1);
    expect(probe.stdout).toContain("verdict=absent");
    expect(() => process.kill(pid, 0)).not.toThrow();
  } finally {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Test owns this disposable group; it may have exited independently.
    }
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("clear-absent surfaces an unlink failure instead of claiming a blocked identity path was cleared", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-dev-identity-clear-"));
  try {
    const preload = path.join(repoRoot, "fail-unlink.cjs");
    writeFileSync(
      preload,
      "require('node:fs').unlinkSync = () => { const error = new Error('planted EIO unlink failure'); error.code = 'EIO'; throw error; };\n",
    );
    const probe = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "clear-absent"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: `--require=${preload}` },
    });
    expect(probe.status).not.toBe(0);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("logs passes its positional arguments through untouched", () => {
  expect(dispatch("logs", "server", "80").line).toBe("DISPATCH verb=logs mode=dev debug=0 force=0 rest=server 80");
});

test("prod routing carries the orthogonal flags", () => {
  expect(dispatch("up", "prod").line).toContain("mode=prod");
  expect(dispatch("status", "prod").line).toContain("verb=status mode=prod");
  const built = dispatch("up", "prod", "--debug", "--build");
  expect(built.line).toContain("mode=prod");
  expect(built.line).toContain("debug=1");
});

// ── the served-module probe, END TO END against a fake vite (#524) ───────────────────────────────────
//
// The unit controls in index.test.ts pin the classifier. THESE pin the whole op: the mtime walk, the
// `/@fs/<abs>` fetch, the candidate walk-down, and the verdict. A fake vite is the only way to drive the
// wedge — the real one cannot be asked to serve a stale transform on demand, and killing its watcher on the
// operator's live stack to find out is exactly the thing this probe exists to make unnecessary.

/** A planted module whose landed export the wedged arm withholds. */
const PLANTED_MODULE = "export const landedAfterTheWatcherDied = 42;\n";
const FS_PREFIX_RE = /^\/@fs/u;

async function withFakeVite(body: (requestedPath: string) => string | null, run: () => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? "").replace(FS_PREFIX_RE, "").split("?")[0] ?? "");
    const served = body(requested);
    if (served === null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/javascript" }).end(served);
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  // VITE_PORT is how stack.sh hands the probe its port — the test drives the same seam, and restores it.
  process.env["VITE_PORT"] = String(port);
  try {
    await run();
  } finally {
    process.env["VITE_PORT"] = "";
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("a fake vite that serves the file back is FRESH — the negative control the wedge is measured against", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/ui/src/canary.ts": PLANTED_MODULE });
  await withFakeVite(
    (requested) => (requested.endsWith("canary.ts") ? PLANTED_MODULE : null),
    async () => {
      const verdict = await probeServedTransform([`${root}/packages/ui/src`]);
      expect(verdict.state).toBe("fresh");
    },
  );
});

test("a fake vite serving a body WITHOUT the landed export is STALE — the dead-watcher wedge, caught", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/ui/src/canary.ts": PLANTED_MODULE });
  await withFakeVite(
    () => "// the transform vite computed before the watcher died\n",
    async () => {
      const verdict = await probeServedTransform([`${root}/packages/ui/src`]);
      expect(verdict.state).toBe("stale");
      expect(verdict.message).toContain("landedAfterTheWatcherDied");
    },
  );
});

test("a vite that does not answer at all is UNREACHABLE, never fresh", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/ui/src/canary.ts": PLANTED_MODULE });
  await withFakeVite(
    () => null, // every request 404s — the module is not served
    async () => {
      expect((await probeServedTransform([`${root}/packages/ui/src`])).state).toBe("unreachable");
    },
  );
});

// ── #1162: the teardown's LAST word must be TRUE ────────────────────────────────────────────────────
//
// `do_stop` printed "stack: group <pgid> still has verified survivors after KILL — manual cleanup
// required" and then tore down clean; twice in one day an orchestrator ran `pgrep -g <pgid>` and found
// ZERO survivors. Measured red-first on the unmodified source with the fixture below: after the recorded
// leader really exits, `clear-absent` exited 1 with
//   verdict=refused reason="recorded dev-stack leader pid N is absent; survivor ownership is unknowable…"
// UNCONDITIONALLY — not a race. `recordedDevStackVerdict` can only answer `absent` when the record file is
// already gone, and `clear-absent` is the only thing that deletes it, so the success arm was unreachable
// and every clean teardown ended in a false alarm demanding manual action.
//
// Both arms are here because either alone is a lie detector with one eye: the alarm must go SILENT when
// the group is empty, and must still FIRE when a survivor really outlived the leader (the ruling in
// index.test.ts — a dead leader never signals a same-group survivor — is preserved, its INPUT refined).
const LEADER_HOLD = "setInterval(() => undefined, 60_000)";
const LEADER_WITH_CHILD = `require('node:child_process').spawn(process.execPath, ['-e', '${LEADER_HOLD}'], { stdio: 'ignore' }); ${LEADER_HOLD}`;
const GROUP_EXIT_GRACE_MS = 1500;
/** Explicit, because these arms spawn a disposable leader plus two node children: on a contended box that
 *  outruns vitest's 5s default and reports a TIMEOUT where the assertion never ran (observed at loadavg
 *  ~32 while writing this pin — the same arms passed in 4.2s on a quiet one). */
const IDENTITY_ARM_TIMEOUT_MS = 60_000;

/** A disposable repo root holding a CAPTURED dev-stack identity for a real, disposable leader.
 *  `script` runs as the leader body; it must keep the process alive until the test kills it. */
async function capturedFakeLeader(script: string): Promise<{ readonly root: string; readonly pid: number }> {
  const root = mkdtempSync(path.join(tmpdir(), "orb-dev-identity-1162-"));
  mkdirSync(path.join(root, "tooling", "src", "stack"), { recursive: true });
  // The capture door demands the leader's argv name THIS root's stack.sh + `_leader`, and cwd === root.
  const child = spawn(process.execPath, ["-e", script, path.join(root, "tooling", "src", "stack", "stack.sh"), "_leader"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
  });
  await once(child, "spawn");
  const pid = child.pid;
  if (pid === undefined || pid <= 1) {
    throw new Error("#1162 fixture: the disposable leader did not receive a safe pid");
  }
  const capture = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "capture", String(pid)], { cwd: root, encoding: "utf8" });
  expect(capture.status, `capture must own the fixture leader — got ${capture.stdout}${capture.stderr}`).toBe(0);
  return { root, pid };
}

function killGroup(pid: number): void {
  // @orb-gate-ignore caught-failure-ownership(empty:error): the test owns this disposable group; it may already have exited. Ends if the fixture needs proof the teardown landed.
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

test("clear-absent CLEARS a departed leader whose group is empty — no false survivors alarm (#1162)", { timeout: IDENTITY_ARM_TIMEOUT_MS }, async () => {
  const { root, pid } = await capturedFakeLeader(LEADER_HOLD);
  try {
    killGroup(pid);
    await new Promise((resolve) => setTimeout(resolve, GROUP_EXIT_GRACE_MS));
    expect(existsSync(`/proc/${pid}`), "the fixture leader must really be gone before the verdict is taken").toBe(false);

    const cleared = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "clear-absent"], { cwd: root, encoding: "utf8" });
    expect(cleared.status, `clear-absent must succeed over an empty group — said ${cleared.stdout}${cleared.stderr}`).toBe(0);
    expect(cleared.stdout).toContain("verdict=absent");
    // The record is the thing being cleared: leaving it behind is what made the next boot ambiguous.
    expect(existsSync(path.join(root, ".cache", "stack", "stack.pgid"))).toBe(false);
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});

test("clear-absent still REFUSES when a survivor really outlived the leader (#1162 planted control)", { timeout: IDENTITY_ARM_TIMEOUT_MS }, async () => {
  const { root, pid } = await capturedFakeLeader(LEADER_WITH_CHILD);
  try {
    // Kill ONLY the leader — its child stays in the same process group, which is the state the warning
    // was minted for and the one where it is TRUE.
    process.kill(pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, GROUP_EXIT_GRACE_MS));
    expect(existsSync(`/proc/${pid}`)).toBe(false);

    const refused = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "clear-absent"], { cwd: root, encoding: "utf8" });
    expect(refused.status, "a leaderless group that still holds a member must NOT be cleared").toBe(1);
    expect(refused.stdout).toMatch(MANUAL_CLEANUP_INT_RE);
    // …and the record survives, because something still needs an owner.
    expect(existsSync(path.join(root, ".cache", "stack", "stack.pgid"))).toBe(true);
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});

// ── #1165: the engine boot VERDICT must match what the fleet did ────────────────────────────────────
//
// Measured on main 2026-09-02 ~15:20Z: `pnpm engines:start` printed `RESULT engines verb=start
// status=boot-timeout` and exited 1, and all three engines answered /health within ~20s of that exit —
// the launcher's own pidfile named them. The 300s wait was shorter than a cold three-engine boot, and
// the exit code said "failed" about a boot that succeeded; a caller scripting on it re-bounces a healthy
// fleet.
//
// NO HARDWARE IS TOUCHED HERE. `ENGINES_START_PROBE=1` is the shell twin of engines.ts's
// `ENGINES_DISPATCH_PROBE` (see tests/tooling/stack/ops/engines.int.test.ts and the standing ban in
// .claude/rules/lane-standing-facts.md): it skips the venv bootstrap, the reconcile AND the spawn, and
// runs ONLY the wait/verdict loop against whatever `VLLM_*_PORT` names — here, three throwaway http
// servers. `ENGINES_BOOT_TIMEOUT=0` makes the deadline deterministic: the wait loop never iterates, so
// every arm below measures the VERDICT the deadline produces, not a race against a timer.
const FAKE_HEALTH_ENGINES = ["embed", "rerank", "gen"] as const;
const ENGINES_PROBE_TIMEOUT_MS = 30_000;

/** A throwaway /health door per named engine. `absent` engines get NO server (their port never answers);
 *  `downFirst` makes a door 503 for its first N probes and 200 after — a boot measured in PROBES, not in
 *  wall-clock, so "came up during the wait" and "came up only on the deadline re-probe" are exact states
 *  rather than a race with a timer. The probe counts engines.sh actually makes: the top-level
 *  `fleet_healthy` short-circuits on the FIRST engine, then every wait iteration polls each engine once,
 *  then the deadline re-probe polls once more. */
async function fakeHealthFleet(
  opts: { readonly absent?: readonly string[]; readonly downFirst?: Readonly<Record<string, number>> } = {},
): Promise<{ readonly ports: Record<string, number>; readonly close: () => Promise<void> }> {
  const absent = opts.absent ?? [];
  const servers = await Promise.all(
    FAKE_HEALTH_ENGINES.filter((name) => !absent.includes(name)).map(async (name) => {
      let seen = 0;
      const server = createServer((_req, res) => {
        seen += 1;
        if (seen <= (opts.downFirst?.[name] ?? 0)) {
          res.writeHead(503).end("booting");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error(`#1165 fixture: the fake ${name} health door did not bind a port`);
      }
      return [name, server, address.port] as const;
    }),
  );
  const ports: Record<string, number> = {};
  for (const [name, , port] of servers) {
    ports[name] = port;
  }
  // A port nothing listens on: the absent engines must still be NAMED by the refusal.
  for (const name of absent) {
    ports[name] = 1;
  }
  return {
    ports,
    close: async (): Promise<void> => {
      await Promise.all(servers.map(async ([, server]) => await new Promise<void>((resolve) => server.close(() => resolve()))));
    },
  };
}

/** THE SEAM MUST EXIST BEFORE WE SPAWN ANYTHING. These arms clear `VLLM_DISABLED` — the suite-wide
 *  safety that would otherwise stop engines.sh at its first line — so the ONLY thing standing between
 *  this spec and real vLLM is `ENGINES_START_PROBE`. Read it out of the script before every spawn (the
 *  discipline the sibling engines.ts pin's header states after a red-first plant took the live fleet
 *  down on 2026-09-02): const + read, so a refactor that drops the guard fails HERE, loudly. */
function assertStartProbeSeam(): void {
  const script = readFileSync(ENGINES_SH, "utf8");
  const seams = script.split("ENGINES_START_PROBE").length - 1;
  if (seams < 1 || !script.includes("NO venv") || !script.includes("NO spawn")) {
    throw new Error(`engines.sh lost its ENGINES_START_PROBE no-spawn seam (found ${seams}) — REFUSING to spawn the launcher`);
  }
}

/** ASYNC, never spawnSync: the fake /health doors live in THIS process, and a synchronous spawn blocks
 *  the event loop that would answer them — every engine then reads as down and the arms prove nothing.
 *  (Measured while writing this pin: all three arms produced `status=boot-timeout … came-up=…never`.) */
async function enginesStart(ports: Record<string, number>, bootTimeout: string): ReturnType<typeof spawnNiced> {
  assertStartProbeSeam();
  return await spawnNiced("bash", [ENGINES_SH, "start"], {
    env: {
      // Cleared deliberately: the suite sets it, and the boot-verdict seam lives past that early exit.
      // Empty is not one of the truthy spellings engines.sh accepts, so it falls through.
      VLLM_DISABLED: "",
      ENGINES_START_PROBE: "1",
      ENGINES_BOOT_TIMEOUT: bootTimeout,
      VLLM_EMBED_PORT: String(ports["embed"]),
      VLLM_RERANK_PORT: String(ports["rerank"]),
      VLLM_GEN_PORT: String(ports["gen"]),
    },
    timeoutMs: ENGINES_PROBE_TIMEOUT_MS,
  });
}

/** engines.sh exits before its boot logic on a GPU-less host; say so rather than voting on nothing. */
function requireGpuHost(stdout: string, skip: (note?: string) => unknown): void {
  if (stdout.includes("status=no-gpu")) {
    skip("no NVIDIA GPU on this host — engines.sh exits at skip_if_disabled, before the boot-verdict seam");
  }
}

test("a fleet coming up DURING the wait is `up`, with came-up-at (#1165 control)", { timeout: ENGINES_PROBE_TIMEOUT_MS }, async ({ skip }) => {
  // embed answers 503 to the top-level idempotency check and 200 from the first wait poll on — so this
  // is a real BOOT the wait observed, not the `already-up` short-circuit.
  const fleet = await fakeHealthFleet({ downFirst: { embed: 1 } });
  try {
    const res = await enginesStart(fleet.ports, "5");
    requireGpuHost(res.stdout, skip);
    expect(res.stdout).toContain("status=up");
    // The sizing question is now a data question — the RESULT line carries the answer for every engine.
    expect(res.stdout).toMatch(/came-up=embed=\d+s,rerank=\d+s,gen=\d+s/u);
    await expect(res).toExitWith(0);
  } finally {
    await fleet.close();
  }
});

test("a fleet that comes up AFTER the deadline is `booted-late`, exit 0 — not a failure (#1165)", { timeout: ENGINES_PROBE_TIMEOUT_MS }, async ({ skip }) => {
  // Every door answers 503 for exactly as many probes as the run makes before its deadline, and 200 on
  // the ONE re-probe the deadline owes — the measured incident's shape, minus the five minutes.
  const fleet = await fakeHealthFleet({ downFirst: { embed: 2, rerank: 1, gen: 1 } });
  try {
    const res = await enginesStart(fleet.ports, "1");
    requireGpuHost(res.stdout, skip);
    expect(res.stdout).toContain("status=booted-late");
    expect(res.code, "a healthy fleet must never exit non-zero — a caller re-bounces it").toBe(0);
  } finally {
    await fleet.close();
  }
});

test("a fleet with ONE engine still down times out, exit 1, NAMING it (#1165 planted control)", { timeout: ENGINES_PROBE_TIMEOUT_MS }, async ({ skip }) => {
  const fleet = await fakeHealthFleet({ absent: ["gen"] });
  try {
    const res = await enginesStart(fleet.ports, "0");
    requireGpuHost(res.stdout, skip);
    expect(res.stdout).toContain("status=boot-timeout");
    // The half that makes the alarm actionable: WHICH engine, and that the others are accounted for.
    expect(res.stdout).toContain("down=gen:");
    expect(res.stdout).toContain("gen=never");
    await expect(res).toExitWith(1);
  } finally {
    await fleet.close();
  }
});
