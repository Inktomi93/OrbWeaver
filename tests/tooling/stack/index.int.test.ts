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
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { probeServedTransform } from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const STACK_SH = fileURLToPath(new URL("../../../tooling/src/stack/stack.sh", import.meta.url));
const DEV_IDENTITY_ENTRY = fileURLToPath(new URL("../../../tooling/src/stack/ops/dev-identity-entry.ts", import.meta.url));

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
