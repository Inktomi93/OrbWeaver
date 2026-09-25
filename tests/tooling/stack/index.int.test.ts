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
//     drops the pidfile, then boots DEV
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
import { probeServedTransform } from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const STACK_SH = fileURLToPath(new URL("../../../tooling/src/stack/stack.sh", import.meta.url));
const DEV_IDENTITY_ENTRY = fileURLToPath(new URL("../../../tooling/src/stack/ops/dev-identity-entry.ts", import.meta.url));
/** The refusal every unclearable identity must still carry (hoisted: no per-call regex literals). */
const MANUAL_CLEANUP_INT_RE = /manual cleanup|relaunch/u;
/** EXPLICIT, on every arm that spawns a `dev-identity-entry.ts` child. Measured on this box 2026-09-02:
 *  ONE such child costs 2.4-4.2s (node transpiles the entry's TS graph per spawn), so vitest's 5s default
 *  is inside the noise — and a blown budget reports a TIMEOUT, which reads exactly like an assertion red
 *  while the assertion never ran (#1040's lesson, one tier down). Two arms that predate #1162 flaked this
 *  way under lane load; the pre-#1162 sources timed the SAME, so the budget is the defect, not the code. */
const IDENTITY_ARM_TIMEOUT_MS = scaledBudget(60_000);

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

// ── a TERM must END dev.sh, never leak an orphan server ─────────────────────────────────────────────
//
// `run_leader` TERMs dev.sh when the healthz gate times out and then returns, taking the process group
// with it, so a signalled dev.sh must exit and reap its server, or the watched server outlives the leader
// that gave up on it. `on_signal` cleans up and exits 143, so a command added after the `wait` never runs
// on a signal. This drives the REAL script inside a fake repo root (dev.sh derives $REPO from its own
// location) whose server entry writes its pid and never exits, lands the TERM while dev.sh is inside
// `wait "$SERVER_PID"`, and asserts the exit code and that the node child is gone.
const DEV_SH = fileURLToPath(new URL("../../../tooling/src/stack/dev.sh", import.meta.url));
const DEV_SIGNAL_ARM_TIMEOUT_MS = scaledBudget(60_000);
/** Generous vs the ~instant exit a signalled dev.sh makes, so a loaded box does not change the verdict. */
const DEV_SIGNAL_EXIT_GRACE_MS = scaledBudget(12_000);
const DEV_SERVER_BOOT_GRACE_MS = scaledBudget(15_000);
const DEV_POLL_MS = 100;
// `node --watch-path` exits on ENOENT before it runs the entry, so the fake root carries every watch root
// dev.sh names, read from the script itself so a new root cannot silently stop the server booting.
const DEV_WATCH_PATH_RE = /--watch-path="\$REPO\/([^"]+)"/gu;

function fakeDevTree(): { readonly root: string; readonly pidFile: string } {
  const root = mkdtempSync(path.join(tmpdir(), "orb-dev-signal-"));
  const devSh = readFileSync(DEV_SH, "utf8");
  const watchRoots = [...devSh.matchAll(DEV_WATCH_PATH_RE)].map((match) => match[1] ?? "");
  expect(watchRoots, "dev.sh must still name its watch roots, or this fixture reads the wrong script").toContain("packages/server/src");
  for (const watchRoot of watchRoots) {
    mkdirSync(path.join(root, watchRoot), { recursive: true });
  }
  mkdirSync(path.join(root, "tooling", "src", "stack"), { recursive: true });
  mkdirSync(path.join(root, "tooling", "src", "dev", "lib"), { recursive: true });
  mkdirSync(path.join(root, "packages", "server", "src", "entry"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", ".bin"), { recursive: true });
  writeFileSync(path.join(root, "tooling", "src", "stack", "dev.sh"), devSh);
  writeFileSync(path.join(root, "tooling", "src", "dev", "lib", "pino-pretty.json"), "{}\n");
  const pidFile = path.join(root, "server.pid");
  // The watched server: publish the pid, then hang. Its survival after the TERM is the orphan's signature.
  writeFileSync(
    path.join(root, "packages", "server", "src", "entry", "index.ts"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => undefined, 60_000);\n`,
  );
  writeFileSync(path.join(root, "node_modules", ".bin", "pino-pretty"), "#!/usr/bin/env bash\ncat\n", { mode: 0o755 });
  return { root, pidFile };
}

/** Poll `predicate` up to `ceilingMs` of sleeps — counted in polls, never read off a wall clock. */
async function waitFor(predicate: () => boolean, ceilingMs: number): Promise<boolean> {
  const polls = Math.ceil(ceilingMs / DEV_POLL_MS);
  for (let i = 0; i < polls; i += 1) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, DEV_POLL_MS));
  }
  return predicate();
}

test("a TERM while dev.sh waits on the server EXITS it with 143 and reaps the server — no orphan", { timeout: DEV_SIGNAL_ARM_TIMEOUT_MS }, async () => {
  const { root, pidFile } = fakeDevTree();
  const child = spawn("bash", [path.join(root, "tooling", "src", "stack", "dev.sh")], { cwd: root, detached: true, stdio: "ignore" });
  await once(child, "spawn");
  const pid = child.pid;
  if (pid === undefined || pid <= 1) {
    throw new Error("dev.sh signal fixture: the disposable dev.sh did not receive a safe pid");
  }
  try {
    // Land the signal only once the script is INSIDE `wait "$SERVER_PID"` — the server has published its pid.
    expect(await waitFor(() => existsSync(pidFile), DEV_SERVER_BOOT_GRACE_MS), "the fake server must boot before the signal, or the test proves nothing").toBe(
      true,
    );
    const serverPid = Number(readFileSync(pidFile, "utf8"));
    expect(existsSync(`/proc/${serverPid}`)).toBe(true);
    process.kill(pid, "SIGTERM");
    const exited = await Promise.race([
      once(child, "exit").then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DEV_SIGNAL_EXIT_GRACE_MS)),
    ]);
    expect(exited, "dev.sh must act on TERM immediately").toBe(true);
    // 143 = 128 + SIGTERM, the shell's own convention. "It exited" is too weak a claim: a script that fell
    // out of its own logic and exited 0 would satisfy it, which is the very shape the orphan comes from.
    expect(child.exitCode, "a signalled dev.sh must exit 143 (128 + SIGTERM), not merely stop").toBe(143);
    // The reap: the watched server dies with the script instead of outliving it.
    expect(await waitFor(() => !existsSync(`/proc/${serverPid}`), DEV_SIGNAL_EXIT_GRACE_MS), "the watched server must not outlive a signalled dev.sh").toBe(
      true,
    );
  } finally {
    killGroup(pid);
    rmSync(root, { recursive: true, force: true });
  }
});

// ── #1013: a leaderless group is ADOPTED by its launch marker, or it is refused ──────────────────────
//
// Four receipts in one session (2026-09-01) came from one premise: ownership was written once at spawn and
// never reconciled against the LIVING tree, so any leader death made the pidfile lie in both directions —
// `engines stop` refusing to signal engines it owned, and `stack start` refusing cleanup while its
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
