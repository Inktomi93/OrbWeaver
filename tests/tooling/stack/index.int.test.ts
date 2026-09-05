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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { probeServedTransform } from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const STACK_SH = fileURLToPath(new URL("../../../tooling/src/stack/stack.sh", import.meta.url));
const ENGINES_SH = fileURLToPath(new URL("../../../tooling/src/stack/engines.sh", import.meta.url));
const DEV_IDENTITY_ENTRY = fileURLToPath(new URL("../../../tooling/src/stack/ops/dev-identity-entry.ts", import.meta.url));
/** The refusal every unclearable identity must still carry (hoisted: no per-call regex literals). */
const MANUAL_CLEANUP_INT_RE = /manual cleanup|relaunch/u;
/** EXPLICIT, on every arm that spawns a `dev-identity-entry.ts` child. Measured on this box 2026-09-02:
 *  ONE such child costs 2.4-4.2s (node transpiles the entry's TS graph per spawn), so vitest's 5s default
 *  is inside the noise — and a blown budget reports a TIMEOUT, which reads exactly like an assertion red
 *  while the assertion never ran (#1040's lesson, one tier down). Two arms that predate #1162 flaked this
 *  way under lane load; the pre-#1162 sources timed the SAME, so the budget is the defect, not the code. */
const IDENTITY_ARM_TIMEOUT_MS = scaledBudget(60_000);
/** The same budget, for the arms that spawn `stack.sh` ITSELF (each invocation is a bash + a node
 *  `classify` child, ~0.3-0.6s, and several per arm). Measured 2026-09-05: under lane load the posture and
 *  GPU-probe arms both blew vitest's 5s default and reported TIMEOUTs that read exactly like assertion
 *  reds — the identical trap this file's identity budget above was minted for. */
const SHELL_ARM_TIMEOUT_MS = scaledBudget(60_000);

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

test("foreign fleet-shaped argv receives zero signals from the strict dev identity door", { timeout: IDENTITY_ARM_TIMEOUT_MS }, async () => {
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

test("clear-absent surfaces an unlink failure instead of claiming a blocked identity path was cleared", { timeout: IDENTITY_ARM_TIMEOUT_MS }, () => {
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
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The test owns this disposable group; it may have exited independently — the same cleanup posture as
    // the foreign-fleet probe above. NO `@orb-gate-ignore` here: caught-failure-ownership does not scan
    // `tests/` (its own header pins that boundary — tests are golden/cleanup behaviour), so a marker would
    // suppress nothing and `gate-ignore-inventory` reds it STALE, which is a loaded gun for the next catch.
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
const ENGINES_PROBE_TIMEOUT_MS = scaledBudget(30_000);

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
async function enginesStart(ports: Record<string, number>, bootTimeout: string, posture = "adopt-or-start"): ReturnType<typeof spawnNiced> {
  assertStartProbeSeam();
  return await spawnNiced("bash", [ENGINES_SH, "start"], {
    env: {
      // Cleared deliberately: the suite sets it, and the boot-verdict seam lives past that early exit.
      // Empty is not one of the truthy spellings engines.sh accepts, so it falls through.
      VLLM_DISABLED: "",
      // EXPLICIT since #1567 — spawnNiced inherits process.env, and engines.sh now gates its spawn on this
      // value, so an ambient posture on the runner's box would decide these arms instead of the fixture.
      ENGINES_POSTURE: posture,
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

// ── #1567: ENGINES_POSTURE is the SPAWN AUTHORITY, and engines.sh never read it ──────────────────────
//
// Owner-witnessed 2026-09-04: `.env` pins ENGINES_POSTURE=adopt-only (stack.sh's own header calls that
// posture "ADOPTS a running fleet — never spawns one", owner ruling 2026-08-01), no fleet was running,
// and `pnpm stack restart` put 38 GB of vLLM on the GPUs. Mechanism on the tree at the time: dev.sh
// called `engines.sh start` unconditionally and engines.sh contained ZERO reads of ENGINES_POSTURE, so
// its adopt-OR-start body ran under every posture. The refusal below is the missing branch.
//
// STILL NO HARDWARE: every arm keeps ENGINES_START_PROBE=1, so even a REGRESSED script cannot spawn —
// and the adopt-only arm asserts the START PROBE banner is ABSENT, which is what proves the refusal
// happens BEFORE the spawn seam rather than merely instead of it.
test("adopt-only with nothing to adopt REFUSES to spawn, exit 0 (#1567 red-first)", { timeout: ENGINES_PROBE_TIMEOUT_MS }, async ({ skip }) => {
  const fleet = await fakeHealthFleet({ absent: ["embed", "rerank", "gen"] });
  try {
    const res = await enginesStart(fleet.ports, "0", "adopt-only");
    requireGpuHost(res.stdout, skip);
    expect(res.stdout).toContain("adopt-only — no fleet to adopt; NOT spawning");
    // The escape hatch must be NAMED — a refusal the operator cannot act on just gets worked around.
    expect(res.stdout).toContain("ENGINES_POSTURE=adopt-or-start");
    expect(res.stdout).toContain("status=adopt-only-no-fleet");
    // The refusal precedes the spawn seam: the probe banner (printed where a real run spawns) never ran.
    expect(res.stdout, "adopt-only must return BEFORE the spawn seam, not inside it").not.toContain("START PROBE");
    await expect(res).toExitWith(0);
  } finally {
    await fleet.close();
  }
});

test("adopt-only WITH a healthy fleet still adopts (#1567 positive control)", { timeout: ENGINES_PROBE_TIMEOUT_MS }, async ({ skip }) => {
  const fleet = await fakeHealthFleet();
  try {
    const res = await enginesStart(fleet.ports, "0", "adopt-only");
    requireGpuHost(res.stdout, skip);
    // The whole point of adopt-only: a running fleet is USED. The refusal must not swallow that arm.
    expect(res.stdout).toContain("status=already-up");
    expect(res.stdout).not.toContain("no fleet to adopt");
    await expect(res).toExitWith(0);
  } finally {
    await fleet.close();
  }
});

test("posture off is a no-op start (#1567)", { timeout: ENGINES_PROBE_TIMEOUT_MS }, async ({ skip }) => {
  const fleet = await fakeHealthFleet({ absent: ["embed", "rerank", "gen"] });
  try {
    const res = await enginesStart(fleet.ports, "0", "off");
    requireGpuHost(res.stdout, skip);
    expect(res.stdout).toContain("status=posture-off");
    expect(res.stdout).not.toContain("START PROBE");
    await expect(res).toExitWith(0);
  } finally {
    await fleet.close();
  }
});

test("an unrecognised posture REFUSES loudly (exit 3, misuse) instead of spawning (#1567)", { timeout: ENGINES_PROBE_TIMEOUT_MS }, async () => {
  const fleet = await fakeHealthFleet({ absent: ["embed", "rerank", "gen"] });
  try {
    // A typo must never fall through to "manage the fleet". This arm needs no GPU: the validation runs at
    // the top of the script, before skip_if_disabled.
    const res = await enginesStart(fleet.ports, "0", "adopt_only");
    expect(res.stderr).toContain("off|adopt-only|adopt-or-start");
    expect(res.stdout).toContain("status=bad-posture");
    await expect(res).toExitWith(3);
  } finally {
    await fleet.close();
  }
});

// ── #1567: a TERM during the engine wait must END dev.sh, never leak an orphan ───────────────────────
//
// The second half of the same incident. `run_leader` TERMs dev.sh when the healthz gate times out and
// then returns, taking the process group with it. dev.sh was blocked inside `engines.sh start` (bounded
// by ENGINES_BOOT_TIMEOUT — 900s, five times the leader's gate), bash QUEUES a trap behind a foreground
// child, and the old handler cleaned up without exiting — so the queued signal was serviced minutes later
// and the script CONTINUED into `node --watch`. Owner-witnessed: a dead pidfile group with an orphan
// dev.sh reparented to `systemd --user`, holding :8788 (the earlier EADDRINUSE race, same shape).
//
// The fixture is a whole fake repo root: dev.sh derives $REPO from its own location, so a copy under
// <tmp>/tooling/src/stack/ finds OUR engines.sh (a sleeper — no vLLM, no ports, no GPU) and OUR entry
// (which touches `booted` and never exits). The proof is the marker: if it exists, the signalled script
// went on to boot a server.
const DEV_SH = fileURLToPath(new URL("../../../tooling/src/stack/dev.sh", import.meta.url));
const DEV_SIGNAL_ARM_TIMEOUT_MS = scaledBudget(60_000);
/** Generous vs the ~instant exit a fixed dev.sh makes, and far under the 30s sleeper the broken one waits
 *  out — so neither a loaded box nor a fast one changes the verdict. */
const DEV_SIGNAL_EXIT_GRACE_MS = scaledBudget(12_000);

function fakeDevTree(): { readonly root: string; readonly marker: string } {
  const root = mkdtempSync(path.join(tmpdir(), "orb-dev-signal-"));
  mkdirSync(path.join(root, "tooling", "src", "stack"), { recursive: true });
  mkdirSync(path.join(root, "packages", "server", "src", "entry"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", ".bin"), { recursive: true });
  writeFileSync(path.join(root, "tooling", "src", "stack", "dev.sh"), readFileSync(DEV_SH, "utf8"));
  // Stands in for a COLD engine boot: engines.sh's own wait is bounded at 900s by default, so the only
  // thing that matters here is that dev.sh is inside a long-running foreground child when the TERM lands.
  writeFileSync(path.join(root, "tooling", "src", "stack", "engines.sh"), "#!/usr/bin/env bash\nsleep 30\n");
  const marker = path.join(root, "booted");
  writeFileSync(
    path.join(root, "packages", "server", "src", "entry", "index.ts"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "1");\nsetInterval(() => undefined, 60_000);\n`,
  );
  writeFileSync(path.join(root, "node_modules", ".bin", "pino-pretty"), "#!/usr/bin/env bash\ncat\n", { mode: 0o755 });
  return { root, marker };
}

test("a TERM while dev.sh waits on engines EXITS it — no orphan server boot (#1567 red-first)", { timeout: DEV_SIGNAL_ARM_TIMEOUT_MS }, async () => {
  const { root, marker } = fakeDevTree();
  const child = spawn("bash", [path.join(root, "tooling", "src", "stack", "dev.sh")], { cwd: root, detached: true, stdio: "ignore" });
  await once(child, "spawn");
  const pid = child.pid;
  if (pid === undefined || pid <= 1) {
    throw new Error("#1567 fixture: the disposable dev.sh did not receive a safe pid");
  }
  try {
    // Land the signal while the script is INSIDE the engines wait — the exact window the orphan came from.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(existsSync(marker), "the fixture must signal BEFORE any server boot, or it proves nothing").toBe(false);
    process.kill(pid, "SIGTERM");
    const exited = await Promise.race([
      once(child, "exit").then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DEV_SIGNAL_EXIT_GRACE_MS)),
    ]);
    expect(exited, "dev.sh must act on TERM immediately, not queue it behind the engines wait").toBe(true);
    // …and it SIGNAL-EXITS: 143 = 128 + SIGTERM, the shell's own convention. "It exited" was too weak a
    // claim (chunk L, #1618 addendum) — a script that fell out of its own logic and exited 0 would satisfy
    // it, which is the very shape the orphan came from.
    expect(child.exitCode, "a signalled dev.sh must exit 143 (128 + SIGTERM), not merely stop").toBe(143);
    // The orphan's signature: the signalled script went on to bind the server anyway.
    expect(existsSync(marker), "a signalled dev.sh must NEVER go on to boot the watched server").toBe(false);
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});

// ── #1618: the SECOND spawn door — a FALSY `VLLM_DISABLED` ───────────────────────────────────────────
//
// `stack.sh` branched on `VLLM_DISABLED` being NON-EMPTY, which `false`/`0`/`no` satisfies. Such a caller
// therefore set NO `ENGINES_POSTURE`, SKIPPED the `.env` pin, and engines.sh — which reads ONLY
// `ENGINES_POSTURE` — fell back to its own `adopt-or-start` default and SPAWNED, while the server ran
// `.env`'s adopt-only. Same 38 GB as #1567, through a door that fix did not close.
//
// NOTHING IS SPAWNED HERE. `STACK_POSTURE_PROBE=1` is the posture twin of `STACK_DISPATCH_PROBE`: it
// prints what engines.sh will receive and exits, after the resolution and before any action.
// A key mapped to `undefined` is DELETED, not passed empty — and that matters here: `vitest.config.ts`
// pins `VLLM_DISABLED: "true"` for the whole suite env, so a probe that merely OMITS the key still
// inherits a TRUTHY one and measures the wrong branch entirely.
function postureProbe(env: Record<string, string | undefined>): string {
  const childEnv: Record<string, string | undefined> = { ...process.env, STACK_POSTURE_PROBE: "1" };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete childEnv[key];
    } else {
      childEnv[key] = value;
    }
  }
  // `<string | null>`, not node's `<string>` — same reason as `dispatch()` above: a spawn that never STARTS
  // returns null pipes, so the `?? ""` is load-bearing rather than a defensive habit.
  const res: SpawnSyncReturns<string | null> = spawnSync("bash", [STACK_SH, "up"], {
    encoding: "utf8",
    env: childEnv,
  });
  return (res.stdout ?? "").split("\n").find((line) => line.startsWith("POSTURE ")) ?? "";
}

test("a FALSY VLLM_DISABLED falls through to the pin/default — it never leaves engines.sh posture-less (#1618)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  // The defect, exactly: `false` used to consume the branch and export no posture at all.
  const line = postureProbe({ VLLM_DISABLED: "false" });
  expect(line).toContain("vllm-disabled=false");
  expect(line, "a posture MUST be resolved — an empty one is what let engines.sh default to adopt-or-start").not.toContain("engines=—");
  // …and it is the NON-SPAWNING one: whatever the `.env` pin says, or the adopt-only default.
  expect(line).toMatch(/engines=(adopt-only|off)\b/u);
  expect(line, "…and it must NOT be the spawning posture").not.toContain("engines=adopt-or-start");
});

test("a TRUTHY VLLM_DISABLED maps EXPLICITLY to posture off, named by its source (#1618)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  const line = postureProbe({ VLLM_DISABLED: "true" });
  expect(line).toContain("engines=off");
  expect(line).toContain("source=VLLM_DISABLED=true");
  expect(line).toContain("vllm-disabled=true");
});

test("VLLM_DISABLED is matched CASE-INSENSITIVELY — `TRUE` must not be rewritten to false (#1618 residual)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  // THE INVERSION THIS PINS: the case-sensitive first cut read `TRUE` as falsy, fell into the normalising
  // else-branch, and EXPORTED `VLLM_DISABLED=false` — an operator who spelled the spawn-safety switch in
  // caps got the opposite of what they asked for, silently, on the variable whose only job is "do not start
  // 38 GB of vLLM". Every spelling of ON must reach posture `off`.
  for (const spelling of ["TRUE", "True", "Yes", "ON", "YES"]) {
    const line = postureProbe({ VLLM_DISABLED: spelling });
    expect(line, `${spelling} must resolve to the engines-off posture`).toContain("engines=off");
    expect(line, `${spelling} must normalise to the schema's "true", never be inverted to false`).toContain("vllm-disabled=true");
  }
  // …and the falsy spellings stay falsy in any case — the fix must not make everything truthy.
  for (const spelling of ["FALSE", "False", "No", "OFF", "0"]) {
    const line = postureProbe({ VLLM_DISABLED: spelling });
    expect(line, `${spelling} must NOT map to the off posture`).not.toContain("engines=off");
    expect(line).toContain("vllm-disabled=false");
  }
});

test("the resolution order is host > VLLM_DISABLED > .env pin > default, and the SOURCE is printed (#1618)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  // A host export still wins outright (the e2e harness's adopt-only depends on it).
  expect(postureProbe({ ENGINES_POSTURE: "adopt-or-start", VLLM_DISABLED: "false" })).toContain("engines=adopt-or-start source=host");
  // Unset behaves exactly like the falsy case — that equivalence IS the fix. The key is DELETED, not
  // omitted: the suite env pins VLLM_DISABLED=true, so an omitted key would be the truthy branch.
  const unset = postureProbe({ VLLM_DISABLED: undefined });
  const falsy = postureProbe({ VLLM_DISABLED: "false" });
  expect(unset.replace(/vllm-disabled=\S+/u, "")).toBe(falsy.replace(/vllm-disabled=\S+/u, ""));
});

// ── #1495: the GPU idle probe must not report idle for a probe that never ran ────────────────────────
//
// `force_teardown` printed "teardown complete — ports free, GPU idle" on the strength of `gpu_idle`,
// whose whole body was a `while read` fed by `nvidia-smi … 2>/dev/null` in a process substitution: a
// MISSING or ERRORING probe produced zero rows, the loop never ran, and control fell to an unconditional
// `return 0`. The probe's failure was byte-identical to its success — VRAM reported idle without ever
// being measured. RED-FIRST RECEIPT (2026-09-05, the original body replanted under the seam below): the
// four failure arms and the absent-binary arm ALL answered `GPU code=0 text=GPU idle`.
//
// The one caller is force_teardown, which SIGKILLs the live dev stack and the whole vLLM fleet before it
// ever asks — so it can never be driven here (`.claude/rules/lane-standing-facts.md`: the engines and the
// live stack are off limits to a lane). `STACK_GPU_PROBE=1` is the seam, the `STACK_DISPATCH_PROBE`
// convention: print the verdict, exit, spawn nothing, touch no port.
const GPU_PROBE_LINE_RE = /^GPU code=(\d) text=(.*)$/mu;

interface GpuProbe {
  readonly code: string;
  readonly text: string;
}

/** Drive stack.sh's GPU probe seam with `nvidia-smi` PLANTED as `body` (a bash script first on PATH).
 *  `binDir` overrides PATH wholesale — the absent-binary arm hands in a symlink farm with no nvidia-smi. */
function gpuProbe(opts: { readonly body?: string; readonly pathOverride?: string; readonly env?: Record<string, string> }): GpuProbe {
  const home = mkdtempSync(path.join(tmpdir(), "orb-gpu-probe-"));
  try {
    const bin = path.join(home, "bin");
    mkdirSync(bin, { recursive: true });
    if (opts.body !== undefined) {
      const fake = path.join(bin, "nvidia-smi");
      writeFileSync(fake, `#!/usr/bin/env bash\n${opts.body}\n`, { mode: 0o755 });
    }
    const res: SpawnSyncReturns<string | null> = spawnSync("bash", [STACK_SH, "status"], {
      encoding: "utf8",
      env: {
        ...process.env,
        ...opts.env,
        STACK_GPU_PROBE: "1",
        STACK_RUN_DIR: path.join(home, "run"),
        PATH: opts.pathOverride ?? `${bin}:${process.env["PATH"] ?? ""}`,
      },
    });
    const match = GPU_PROBE_LINE_RE.exec(res.stdout ?? "");
    if (match === null) {
      throw new Error(`the GPU probe seam printed no verdict line — stdout=${res.stdout ?? ""} stderr=${res.stderr ?? ""}`);
    }
    return { code: match[1] ?? "", text: match[2] ?? "" };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("a GPU probe that could not run is UNKNOWN, never idle (#1495)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  // The four shapes of "the probe did not measure anything", each of which used to read as idle.
  expect(gpuProbe({ body: "exit 1" }).code, "a probe that exits non-zero measured nothing").toBe("2");
  expect(gpuProbe({ body: 'echo "Unable to determine the device handle" >&2; exit 9' }).code, "a driver error measured nothing").toBe("2");
  expect(gpuProbe({ body: "exit 0" }).code, "a probe that succeeded but printed NO rows measured no GPU").toBe("2");
  expect(gpuProbe({ body: 'echo "[N/A]"' }).code, "a non-numeric row is not a VRAM reading").toBe("2");
  // …and the UNKNOWN verdict says so out loud, with the operator's way forward.
  expect(gpuProbe({ body: "exit 1" }).text).toContain("GPU UNKNOWN");
  expect(gpuProbe({ body: "exit 1" }).text).toContain("STACK_GPU_CHECK=skip");
});

test("the GPU probe still answers idle/busy when it DOES measure (#1495 planted control)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  // The other direction: the refusal must not swallow a real reading, or force-restart never completes.
  expect(gpuProbe({ body: "echo 0\necho 0" }).code, "two GPUs under the floor is idle").toBe("0");
  expect(gpuProbe({ body: "echo 40000" }).code, "40GiB held is busy").toBe("1");
  expect(gpuProbe({ body: "echo 0\necho 40000" }).code, "ONE busy GPU makes the fleet busy").toBe("1");
  expect(gpuProbe({ body: "echo 1025" }).code, "one MiB over the 1024MiB floor is busy").toBe("1");
  expect(gpuProbe({ body: "echo 1024" }).code, "exactly at the floor is still idle").toBe("0");
});

test("a host with no nvidia-smi is NOT-MEASURED (3), which is not the same fact as UNKNOWN (#1495)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  // A GPU-less dev box holds no fleet VRAM and must still be able to force-restart; "there is no driver"
  // is a different fact from "the driver is here and would not answer", and only the latter refuses.
  // PATH is replaced by a symlink farm of every real PATH entry MINUS nvidia-smi, so `command -v` really
  // misses while bash/node/sed/curl stay reachable.
  const farmHome = mkdtempSync(path.join(tmpdir(), "orb-gpu-farm-"));
  try {
    const farm = path.join(farmHome, "farm");
    mkdirSync(farm, { recursive: true });
    let linked = 0;
    for (const dir of (process.env["PATH"] ?? "").split(":").filter((entry) => entry !== "")) {
      if (!existsSync(dir)) {
        continue;
      }
      for (const entry of readdirSync(dir)) {
        if (entry === "nvidia-smi" || existsSync(path.join(farm, entry))) {
          continue;
        }
        symlinkSync(path.join(dir, entry), path.join(farm, entry));
        linked += 1;
      }
    }
    // A farm that linked nothing would "prove" absence by breaking the shell instead — the zero-is-not-a-
    // measurement floor.
    expect(linked, "the PATH farm must actually contain the host's binaries").toBeGreaterThan(10);
    expect(existsSync(path.join(farm, "bash")), "bash must survive the farm or the probe cannot run").toBe(true);
    expect(existsSync(path.join(farm, "nvidia-smi")), "the farm's whole point is that nvidia-smi is missing").toBe(false);
    expect(gpuProbe({ pathOverride: farm }).code).toBe("3");
  } finally {
    rmSync(farmHome, { recursive: true, force: true });
  }
});

test("STACK_GPU_CHECK=skip opts out LOUDLY and never claims idle (#1495)", { timeout: SHELL_ARM_TIMEOUT_MS }, () => {
  // The escape hatch the UNKNOWN refusal owes an operator whose driver is wedged. It reports 3
  // (not measured) — never 0 — even while a planted probe would have said busy.
  const skipped = gpuProbe({ body: "echo 40000", env: { STACK_GPU_CHECK: "skip" } });
  expect(skipped.code).toBe("3");
  expect(skipped.text).toContain("not measured");
});

// ── #1013: a leaderless group is ADOPTED by its launch marker, or it is refused ──────────────────────
//
// Four receipts in one session (2026-09-01) came from one premise: ownership was written once at spawn and
// never reconciled against the LIVING tree, so any leader death made the pidfile lie in both directions —
// `engines:stop` refusing to signal engines it owned, and `stack start` refusing cleanup while its
// detached tree carried on healthy. The fix does not weaken the standing rule (a survivor with no launch
// identity signals nothing); it gives survivors an identity to carry. These drive the REAL entry through
// real processes: a marked group adopts, one unmarked member refuses, and a pre-marker record refuses.
const LAUNCH_MARKER_ENV = "ORB_STACK_LAUNCH_ID";
const PLANTED_MARKER = "9f8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d";

/** The leader body for the adoption arms: fork ONE child (optionally with the marker STRIPPED from its
 *  environment — the unmarked-member control), publish its pid, then hang. */
function leaderWithChild(pidFile: string, stripChildMarker: boolean): string {
  const childEnv = stripChildMarker ? `(() => { const e = { ...process.env }; delete e[${JSON.stringify(LAUNCH_MARKER_ENV)}]; return e; })()` : "process.env";
  return [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    `const kid = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1e9)'], { stdio: 'ignore', env: ${childEnv} });`,
    `writeFileSync(${JSON.stringify(pidFile)}, String(kid.pid));`,
    "setInterval(() => undefined, 1e9);",
  ].join("\n");
}

/** A disposable repo root whose CAPTURED leader carries `marker` (or none), plus its forked child's pid. */
async function markedFakeLeader(opts: { readonly marker: string | null; readonly stripChildMarker: boolean }): Promise<{
  readonly root: string;
  readonly pid: number;
  readonly childPid: number;
}> {
  const root = mkdtempSync(path.join(tmpdir(), "orb-dev-identity-1013-"));
  mkdirSync(path.join(root, "tooling", "src", "stack"), { recursive: true });
  const pidFile = path.join(root, "child.pid");
  const env = { ...process.env };
  if (opts.marker === null) {
    delete env[LAUNCH_MARKER_ENV];
  } else {
    env[LAUNCH_MARKER_ENV] = opts.marker;
  }
  const child = spawn(
    process.execPath,
    ["-e", leaderWithChild(pidFile, opts.stripChildMarker), path.join(root, "tooling", "src", "stack", "stack.sh"), "_leader"],
    {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env,
    },
  );
  await once(child, "spawn");
  const pid = child.pid;
  if (pid === undefined || pid <= 1) {
    throw new Error("#1013 fixture: the disposable leader did not receive a safe pid");
  }
  // The capture reads the LEADER's own /proc environ, so the record's marker is proof about the process,
  // never about the shell that asked.
  const capture = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "capture", String(pid)], { cwd: root, encoding: "utf8", env });
  expect(capture.status, `capture must own the fixture leader — got ${capture.stdout}${capture.stderr}`).toBe(0);
  for (let i = 0; i < 100 && !existsSync(pidFile); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { root, pid, childPid: Number(readFileSync(pidFile, "utf8")) };
}

async function awaitGone(pid: number): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    if (!existsSync(`/proc/${pid}`)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

test("adopt-signal STOPS a leaderless group whose every member carries the launch marker (#1013)", { timeout: IDENTITY_ARM_TIMEOUT_MS }, async () => {
  const { root, pid, childPid } = await markedFakeLeader({ marker: PLANTED_MARKER, stripChildMarker: false });
  try {
    // Kill ONLY the leader: the exact state that made `stack stop` refuse and every teardown end in a
    // hand-run `kill -TERM -<pgid>`.
    process.kill(pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, GROUP_EXIT_GRACE_MS));
    expect(existsSync(`/proc/${pid}`), "the fixture leader must really be gone before the verdict is taken").toBe(false);
    expect(existsSync(`/proc/${childPid}`), "…and its child must still be holding the group").toBe(true);

    // The STANDING RULE first: the ordinary signal door still refuses, and still signals nothing.
    const refused = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "signal", "SIGTERM"], { cwd: root, encoding: "utf8" });
    expect(refused.status, "a dead leader must NOT authorize the ordinary signal door").toBe(1);
    expect(refused.stdout).toMatch(MANUAL_CLEANUP_INT_RE);
    expect(existsSync(`/proc/${childPid}`), "…and nothing may have been signalled by it").toBe(true);

    // …then the stricter door, which has evidence the first one does not.
    const adopted = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "adopt-signal", "SIGKILL"], { cwd: root, encoding: "utf8" });
    expect(adopted.status, `a fully-marked group must adopt — said ${adopted.stdout}${adopted.stderr}`).toBe(0);
    expect(adopted.stdout).toContain("verdict=adopted");
    expect(await awaitGone(childPid), "the adopted group must actually die").toBe(true);
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});

test("adopt-signal REFUSES a group holding ONE unmarked member, and signals nothing (#1013 planted control)", {
  timeout: IDENTITY_ARM_TIMEOUT_MS,
}, async () => {
  // The reused-pgid / unrelated-joiner case: the leader was ours, but something in its group was not.
  const { root, pid, childPid } = await markedFakeLeader({ marker: PLANTED_MARKER, stripChildMarker: true });
  try {
    process.kill(pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, GROUP_EXIT_GRACE_MS));

    const refused = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "adopt-signal", "SIGKILL"], { cwd: root, encoding: "utf8" });
    expect(refused.status, "one unmarked member must refuse the whole group").toBe(1);
    expect(refused.stdout).toContain(String(childPid));
    expect(refused.stdout).toMatch(MANUAL_CLEANUP_INT_RE);
    expect(existsSync(`/proc/${childPid}`), "a refused group must be left completely untouched").toBe(true);
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});

test("adopt-signal REFUSES a pre-#1013 record that carries no marker at all (#1013 planted control)", { timeout: IDENTITY_ARM_TIMEOUT_MS }, async () => {
  // Every pidfile written before the marker existed lands here. The old refusal is the fallback.
  const { root, pid, childPid } = await markedFakeLeader({ marker: null, stripChildMarker: false });
  try {
    process.kill(pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, GROUP_EXIT_GRACE_MS));

    const refused = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "adopt-signal", "SIGKILL"], { cwd: root, encoding: "utf8" });
    expect(refused.status).toBe(1);
    expect(refused.stdout).toContain("no launch marker");
    expect(existsSync(`/proc/${childPid}`), "an unmarkable group must be left untouched").toBe(true);
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});

test("describe names the EVIDENCE behind the verdict, not just the state (#1013 receipt 1)", { timeout: IDENTITY_ARM_TIMEOUT_MS }, async () => {
  // `status` used to print a pidfile group number, and a group id from a DIFFERENT era read exactly like
  // the live one. Every basis below is a different answer to "how do you know".
  const { root, pid, childPid } = await markedFakeLeader({ marker: PLANTED_MARKER, stripChildMarker: false });
  try {
    const live = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "describe"], { cwd: root, encoding: "utf8" });
    expect(live.status).toBe(0);
    expect(live.stdout).toContain("basis=leader-identity");
    expect(live.stdout).toContain("witnessed");

    process.kill(pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, GROUP_EXIT_GRACE_MS));
    const adoptable = spawnSync(process.execPath, [DEV_IDENTITY_ENTRY, "describe"], { cwd: root, encoding: "utf8" });
    expect(adoptable.status, "an adoptable group is not a problem state").toBe(0);
    expect(adoptable.stdout).toContain("basis=adoptable");
    expect(adoptable.stdout).toContain(String(childPid));
    // …and describing is non-destructive: it reads /proc and signals nothing.
    expect(existsSync(`/proc/${childPid}`)).toBe(true);
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});
