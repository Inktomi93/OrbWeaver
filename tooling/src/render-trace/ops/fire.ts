// The fire op: boot an EPHEMERAL server on a free port with a temp DB, fire one or more HTTP
// requests, dump the resulting traces as ASCII waterfalls, tear everything down. Zero ceremony — no
// .env editing, no port-fighting with the dev stack, no surviving DB files.
//
//   pnpm trace:fire                                  # the smallest happy path
//   pnpm trace:fire /healthz /api/_debug/info        # multiple paths
//   pnpm trace:fire 'POST /api/trpc/chat.startChat'  # method-prefixed (default GET)
//
// For tRPC subscriptions / streaming you still want a real stack + trace:tail; this is the "did my one
// verb behave" inspector. This op sets ORB_ENV_NO_FILE, so the identity contract below is declared
// explicitly and the operator's `.env` never leaks into the throwaway DB.
//
// P3 truth-repairs at the move (receipts): the pre-move header's FLAG(wiring) — "observability
// middleware unwired as of 2026-07-04" — is DEAD: `initTracing()` runs at entry/lifecycle.ts:169, so
// the UNWIRED arm below is a live-regression tripwire now, not a known gap. And the child spawns
// `node` directly (node 26 runs .ts source; the tsx launcher was shed 2026-08-03 — spawning tsx here
// was launcher rot).
//
// PROCESS MODEL: the child rides _shared/proc's spawnNicedChild (detached, own process group) and every
// exit path — including runTool's crash arm — SIGKILLs the group via the `process.on("exit")` belt.
// No process.exit here: signal handlers resolve the op's promise and the runner owns exits.
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { errorMessage } from "@orb/kit/error-message";
import type { RequestTrace } from "@orb/server/foundation/observability";
import { budget } from "@orb/tooling/_shared/load-budget";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { instrumentError, printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { spawnNicedChild } from "../../_shared/proc.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import { fireEvidenceGap } from "../lib/evidence.ts";
import { renderTrace } from "../lib/render.ts";

refuseDirectInvocation(import.meta.url, "pnpm trace:render | pnpm trace:tail | pnpm trace:fire");

// Cold compile of the server graph is bounded generously; a warm host is far under it.
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const READY_TIMEOUT_MS_BASE = 120_000;
const READY_TIMEOUT_MS = budget(READY_TIMEOUT_MS_BASE);
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

interface FireRequest {
  readonly method: string;
  readonly path: string;
}

function parseRequest(arg: string): FireRequest {
  // `GET /path` / `POST /path` / bare `/path` (defaults to GET). fire takes NO flags: a `--token` used to
  // be fired AS A REQUEST PATH and reported as a 404 finding, which reads exactly like a real failure.
  if (arg.startsWith("-")) {
    throw new UsageError(`trace:fire takes request paths, not flags — got ${JSON.stringify(arg)} (usage: pnpm trace:fire ["GET /api/…" …])`);
  }
  const space = arg.indexOf(" ");
  if (space < 0) {
    return { method: "GET", path: arg };
  }
  return { method: arg.slice(0, space).toUpperCase(), path: arg.slice(space + 1) };
}

async function waitForReady(baseUrl: string, deadlineMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    // @orb-waive caught-failure-ownership(catch): a connection-refused/fetch failure during boot polling is expected while the server isn't listening yet — the loop retries until deadlineMs, then throws its own timeout error below. Ends if this stops eventually throwing on deadline.
    try {
      // Orb's liveness route is /healthz (entry/http/healthz.ts) — NOT neo's /api/healthz.
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) {
        return;
      }
    } catch {
      // not listening yet — keep waiting
    }
    await sleep(POLL_MS);
  }
  throw new Error(`trace:fire — server didn't come up within ${deadlineMs}ms`);
}

function serverEnv(port: number, dbPath: string, debugToken: string): NodeJS.ProcessEnv {
  return {
    // biome-ignore lint/style/noProcessEnv: the child server inherits this probe's ambient env as the base; the pins below override the keys that matter — harness plumbing, not app config.
    ...process.env,
    PORT: String(port),
    DEBUG_TOKEN: debugToken,
    DATABASE_URL: `file:${dbPath}`,
    // Skip the operator's `.env` ENTIRELY and declare the identity contract explicitly (mirrors
    // tests/e2e/support/modes.ts's HARNESS_OWNER_HANDLE) — an env-file OWNER_HANDLES once seeded the
    // throwaway DB with the operator's owner identity, so identity/role-shaped routes answered per-box.
    ORB_ENV_NO_FILE: "1",
    OWNER_HANDLES: "owner",
    // single-user: the probe debugs server behaviour, not auth flows — no IdP ceremony.
    AUTH_MODE: "single-user",
    // No embedder spin-up for a one-shot probe (same pin as vitest.config.ts).
    CORPUS_AUTOINDEX: "false",
    LOG_LEVEL: "warn",
  };
}

interface FiredBatch {
  readonly requestIds: string[];
  readonly fired: number;
  readonly failures: number;
  readonly missingRid: number;
}

async function fireRequests(baseUrl: string, requests: readonly FireRequest[]): Promise<FiredBatch> {
  const requestIds: string[] = [];
  let fired = 0;
  let failures = 0;
  let missingRid = 0;
  for (const req of requests) {
    const url = `${baseUrl}${req.path}`;
    try {
      const res = await fetch(url, { method: req.method });
      fired += 1;
      const rid = res.headers.get("x-request-id");
      process.stderr.write(`trace:fire — ${req.method} ${req.path} → ${res.status} (rid=${rid ?? "?"})\n`);
      if (rid === null) {
        missingRid += 1;
      } else {
        requestIds.push(rid);
      }
    } catch (err) {
      failures += 1;
      process.stderr.write(`trace:fire — ${req.method} ${req.path} failed: ${errorMessage(err)}\n`);
    }
  }
  return { requestIds, fired, failures, missingRid };
}

/** #1507: the misses are COUNTED and handed back, not just written to stderr. A run that rendered one of
 *  three traces used to print `traces=1` and exit clean — the two silent misses were the interesting half. */
async function renderTraces(
  baseUrl: string,
  requestIds: readonly string[],
  debugToken: string,
): Promise<{ readonly rendered: number; readonly detailFailed: number }> {
  let rendered = 0;
  let detailFailed = 0;
  for (const rid of requestIds) {
    const detailRes = await fetch(`${baseUrl}/api/_debug/traces/${rid}`, {
      headers: { "x-debug-token": debugToken },
    });
    if (!detailRes.ok) {
      process.stderr.write(`trace:fire — no trace recorded for rid=${rid} (HTTP ${detailRes.status})\n`);
      detailFailed += 1;
      continue;
    }
    const trace = (await detailRes.json()) as RequestTrace;
    print(renderTrace(trace));
    print("");
    rendered += 1;
  }
  return { rendered, detailFailed };
}

export async function fireOp(argv: readonly string[]): Promise<number> {
  const requests = (argv.length === 0 ? ["/api/trpc/health"] : [...argv]).map(parseRequest);

  const port = await freePort();
  const tempDir = mkdtempSync(join(tmpdir(), "orb-probe-"));
  const dbPath = join(tempDir, "probe.db");
  const debugToken = randomBytes(TOKEN_BYTES).toString("hex");

  process.stderr.write(`trace:fire — booting server on :${port} (db=${dbPath})\n`);

  // Forward server output to OUR stderr so a boot failure is visible while the rendered
  // waterfalls on stdout stay parseable for callers.
  const child = spawnNicedChild("node", ["packages/server/src/entry/index.ts"], {
    cwd: REPO_ROOT,
    env: serverEnv(port, dbPath, debugToken),
    onOutput: (buf) => process.stderr.write(buf),
  });

  const teardown = (): void => {
    child.killGroup("SIGTERM");
    // @orb-waive caught-failure-ownership(catch): best-effort teardown of a scratch tempDir on process exit — force:true already tolerates a missing path, and there is no caller left to hand a failure to at this point. Ends if this tempDir starts holding anything a later step depends on existing/not-existing.
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  };
  // The synchronous belt: ANY exit path (including runTool's crash arm) SIGKILLs the group.
  process.on("exit", () => child.killGroup("SIGKILL"));
  // A signal mid-run resolves the op instead of hard-exiting — the runner owns exits.
  const signalled = new Promise<number>((resolve) => {
    process.on("SIGINT", () => resolve(EXIT_SIGINT));
    process.on("SIGTERM", () => resolve(EXIT_SIGTERM));
  });

  const run = async (): Promise<number> => {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForReady(baseUrl, READY_TIMEOUT_MS);
    const batch = await fireRequests(baseUrl, requests);
    // The processor seals a trace when the ROOT span ends (after the response is written) —
    // a brief settle guarantees it's in the ring before we pull it.
    await sleep(SETTLE_MS);
    const { rendered, detailFailed } = await renderTraces(baseUrl, batch.requestIds, debugToken);
    // The unwired-tracing tell: requests landed but NONE carried an X-Request-Id → the observability
    // middleware is not mounted. `initTracing()` is wired (entry/lifecycle.ts:169), so this arm firing
    // today means a LIVE REGRESSION at entry — reported loudly, and (#409) EXIT.toolError: the prior
    // ruling here was "still exit 0, a missing capability is a skip". That ruling survives; its INPUT
    // changed — the same comment records the middleware as WIRED, which makes this a tripwire, and a
    // tripwire that exits 0 is not a tripwire. lib/evidence.ts carries the fork in full.
    const gap = fireEvidenceGap({ fired: batch.fired, missingRid: batch.missingRid, rendered, detailFailed });
    const unwired = batch.fired > 0 && batch.missingRid === batch.fired;
    if (unwired) {
      process.stderr.write(
        "trace:fire — no response carried X-Request-Id: the foundation observability middleware is NOT mounted at entry/ (regression tripwire; initTracing is expected wired at entry/lifecycle.ts)\n",
      );
    }
    let verdict: number = batch.failures > 0 ? EXIT.violations : EXIT.clean;
    if (gap !== null) {
      verdict = EXIT.toolError;
    }
    const code = printVerdict("probe-fire", {
      verdict,
      denominators: { requests: { value: batch.fired, refuseWhen: "zero" } },
      pairs: [
        ["requests", batch.fired],
        ["failures", batch.failures],
        ["traces", unwired ? "UNWIRED" : rendered],
        // The misses ride the RESULT line beside the hits (#1507): a partial recording is only readable
        // if the denominator is printed too.
        ["trace-misses", detailFailed],
      ],
    });
    if (gap !== null) {
      instrumentError(gap);
    }
    return code;
  };

  try {
    return await Promise.race([run(), signalled]);
  } finally {
    teardown();
  }
}
