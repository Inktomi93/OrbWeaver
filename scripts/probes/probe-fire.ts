#!/usr/bin/env tsx
/**
 * pnpm trace:fire [<path>=/api/trpc/health ...]
 *
 * One-shot inspector: boot an EPHEMERAL server on a free port with a temp DB, fire one
 * or more HTTP requests, dump the resulting traces as ASCII waterfalls, tear everything
 * down. Zero ceremony — no .env editing, no port-fighting with the dev stack, no
 * surviving DB files.
 *
 *   pnpm trace:fire                                # the smallest happy path
 *   pnpm trace:fire /healthz /api/_debug/info      # multiple paths
 *   pnpm trace:fire 'POST /api/trpc/chat.startChat'  # method-prefixed (default GET)
 *
 * For tRPC subscriptions / streaming you still want a real stack + trace-tail; this is
 * the "did my one verb behave" inspector. Shell env wins over any .env (foundation/env
 * loads dotenv WITHOUT override), so the PORT/DATABASE_URL/DEBUG_TOKEN pins below hold.
 *
 * FLAG(wiring): trace capture requires the foundation `observability` middleware (which
 * also echoes X-Request-Id) + `initTracing()` to be wired at entry/ — specced in
 * core/Tier-2-Foundation.md §boot-ordering, unwired as of 2026-07-04 (T6 report). Until
 * then responses carry no X-Request-Id and the ring stays empty: this probe reports
 * `traces=UNWIRED` (exit 0 — a missing capability is a skip, not a failure), and starts
 * working the day the mount lands, unchanged.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { REPO_ROOT } from "./_kit/artifacts.ts";
import { print, printResult } from "./_kit/result.ts";
import type { RequestTrace } from "./trace-render.ts";
import { renderTrace } from "./trace-render.ts";

// Cold tsx compile of the server graph measured ~55s in-container (stack.sh's note) —
// bound generously; a warm host is far under it.
const READY_TIMEOUT_MS = 120_000;
const POLL_MS = 200;
const SETTLE_MS = 100;
const TOKEN_BYTES = 16;
const EXIT_SIGINT = 130;
const EXIT_SIGTERM = 143;

/** Find a free TCP port by binding ephemeral and reading what the OS chose. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr !== null && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("free-port: could not read bound address"));
      }
    });
  });
}

type FireRequest = {
  readonly method: string;
  readonly path: string;
};

function parseRequest(arg: string): FireRequest {
  // `GET /path` / `POST /path` / bare `/path` (defaults to GET).
  const space = arg.indexOf(" ");
  if (space < 0) {
    return { method: "GET", path: arg };
  }
  return { method: arg.slice(0, space).toUpperCase(), path: arg.slice(space + 1) };
}

async function waitForReady(baseUrl: string, deadlineMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      // Orb's liveness route is /healthz (entry/http/healthz.ts) — NOT neo's /api/healthz.
      // biome-ignore lint/performance/noAwaitInLoops: a readiness poll IS a sequential wait loop.
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) {
        return;
      }
    } catch {
      // not listening yet — keep waiting
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`probe-fire: server didn't come up within ${deadlineMs}ms`);
}

function serverEnv(port: number, dbPath: string, debugToken: string): NodeJS.ProcessEnv {
  return {
    // biome-ignore lint/style/noProcessEnv: the child server inherits this probe's ambient env as the base; the pins below override the keys that matter — harness plumbing, not app config.
    ...process.env,
    PORT: String(port),
    DEBUG_TOKEN: debugToken,
    DATABASE_URL: `file:${dbPath}`,
    // single-user: the probe debugs server behaviour, not auth flows — no IdP ceremony.
    AUTH_MODE: "single-user",
    // Container-safe (and normalizes the pre-rebuild container's invalid `1` spelling —
    // the env floor is a strict z.enum(["true","false"], a stray value is boot-fatal).
    VLLM_DISABLED: "true",
    // No embedder spin-up for a one-shot probe (same pin as vitest.config.ts).
    CORPUS_AUTOINDEX: "false",
    LOG_LEVEL: "warn",
  };
}

async function main(): Promise<void> {
  const argPaths = process.argv.slice(2);
  const requests = (argPaths.length === 0 ? ["/api/trpc/health"] : argPaths).map(parseRequest);

  const port = await freePort();
  const tempDir = mkdtempSync(join(tmpdir(), "orb-probe-"));
  const dbPath = join(tempDir, "probe.db");
  const debugToken = randomBytes(TOKEN_BYTES).toString("hex");

  process.stderr.write(`probe-fire: booting server on :${port} (db=${dbPath})\n`);

  const child = spawn("pnpm", ["exec", "tsx", "packages/server/src/entry/index.ts"], {
    cwd: REPO_ROOT,
    // detached:true → own process group → process.kill(-pid) reaps the WHOLE tree (pnpm
    // spawns tsx spawns node); without it a SIGKILL to `pnpm` orphans the actual server.
    detached: true,
    env: serverEnv(port, dbPath, debugToken),
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Forward server output to OUR stderr so a boot failure is visible while the rendered
  // waterfalls on stdout stay parseable for callers.
  child.stdout?.on("data", (buf: Buffer) => process.stderr.write(buf));
  child.stderr?.on("data", (buf: Buffer) => process.stderr.write(buf));

  const killGroup = (signal: NodeJS.Signals): void => {
    if (typeof child.pid !== "number") {
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* group already gone */
    }
  };

  const cleanup = (code = 0): void => {
    killGroup("SIGTERM");
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
    process.exit(code);
  };
  process.on("SIGINT", () => cleanup(EXIT_SIGINT));
  process.on("SIGTERM", () => cleanup(EXIT_SIGTERM));
  // The synchronous belt: any exit path (including an uncaught throw) SIGKILLs the group.
  process.on("exit", () => killGroup("SIGKILL"));
  process.on("uncaughtException", (err) => {
    process.stderr.write(`probe-fire: uncaught — ${err.message}\n`);
    cleanup(1);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForReady(baseUrl, READY_TIMEOUT_MS);
  } catch (err) {
    process.stderr.write(`${errorMessage(err)}\n`);
    cleanup(1);
    return;
  }

  // Fire each request, capturing X-Request-Id (the trace's requestId) when present.
  const requestIds: string[] = [];
  let fired = 0;
  let failures = 0;
  let missingRid = 0;
  for (const req of requests) {
    const url = `${baseUrl}${req.path}`;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: requests fire sequentially BY DESIGN — parallel fire would interleave traces and defeat the one-verb inspector.
      const res = await fetch(url, { method: req.method });
      fired += 1;
      const rid = res.headers.get("x-request-id");
      process.stderr.write(
        `probe-fire: ${req.method} ${req.path} → ${res.status} (rid=${rid ?? "?"})\n`,
      );
      if (rid === null) {
        missingRid += 1;
      } else {
        requestIds.push(rid);
      }
    } catch (err) {
      failures += 1;
      process.stderr.write(`probe-fire: ${req.method} ${req.path} failed — ${errorMessage(err)}\n`);
    }
  }

  // The processor seals a trace when the ROOT span ends (after the response is written) —
  // a brief settle guarantees it's in the ring before we pull it.
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  let rendered = 0;
  for (const rid of requestIds) {
    // biome-ignore lint/performance/noAwaitInLoops: waterfalls print in fire order BY DESIGN.
    const detailRes = await fetch(`${baseUrl}/api/_debug/traces/${rid}`, {
      headers: { "x-debug-token": debugToken },
    });
    if (!detailRes.ok) {
      process.stderr.write(
        `probe-fire: no trace recorded for rid=${rid} (HTTP ${detailRes.status})\n`,
      );
      continue;
    }
    const trace = (await detailRes.json()) as RequestTrace;
    print(renderTrace(trace));
    print("");
    rendered += 1;
  }

  // The unwired-tracing tell (see the header FLAG): requests landed but NONE carried an
  // X-Request-Id → the observability middleware isn't mounted. Report, don't fail.
  const unwired = fired > 0 && missingRid === fired;
  if (unwired) {
    process.stderr.write(
      "probe-fire: no response carried X-Request-Id — the foundation observability middleware is not mounted at entry/ (trace capture UNWIRED; see core/Tier-2-Foundation.md §boot-ordering)\n",
    );
  }
  printResult("probe-fire", [
    ["requests", fired],
    ["failures", failures],
    ["traces", unwired ? "UNWIRED" : rendered],
  ]);
  cleanup(failures > 0 ? 1 : 0);
}

await main();
