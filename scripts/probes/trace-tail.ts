#!/usr/bin/env tsx
/**
 * pnpm trace:tail [--token=…]
 *
 * Polls `/api/_debug/traces` every N seconds and prints each NEW trace as a colored
 * waterfall. Exits on Ctrl-C.
 *
 * AUTH (two-tier gate, foundation/observability/debug/routes.ts): an admin session
 * short-circuits first, then the x-debug-token fallback. Single-user dev needs no token;
 * this tool sends the header only when one is provided (--token=… or env DEBUG_TOKEN).
 *
 * Connection: hits the server DIRECTLY on PORT (default 8788), not through the vite dev
 * proxy.
 *
 * FLAG(wiring): the trace ring only fills once entry/ mounts the foundation
 * `observability` middleware + calls `initTracing()` (specced in core/Tier-2-Foundation.md
 * §boot-ordering, unwired as of 2026-07-04 — see the T6 report). Until then this tails an
 * always-empty ring; the tool itself is forward-correct.
 */
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import type { RequestTrace } from "./trace-render.ts";
import { renderTrace } from "./trace-render.ts";

// biome-ignore lint/style/noProcessEnv: PORT mirrors the server's own listen port so the tail hits the right box — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
const PORT = process.env["PORT"] ?? "8788";
// biome-ignore lint/style/noProcessEnv: TRACE_TAIL_HOST points the tail at a non-local server when needed — ambient tooling env, not app config.
const HOST = process.env["TRACE_TAIL_HOST"] ?? `http://127.0.0.1:${PORT}`;
const TOKEN_ARG = process.argv.find((a) => a.startsWith("--token="));
// biome-ignore lint/style/noProcessEnv: DEBUG_TOKEN is the ambient dev debug token the operator already exported for curl loops (optional here — single-user dev needs none). Harness plumbing, not app config.
const TOKEN_ENV = process.env["DEBUG_TOKEN"];
const TOKEN = TOKEN_ARG === undefined ? TOKEN_ENV : TOKEN_ARG.slice("--token=".length);
const DEFAULT_INTERVAL_MS = 2000;
// biome-ignore lint/style/noProcessEnv: TRACE_TAIL_INTERVAL_MS tunes the poll cadence — ambient tooling env, not app config.
const INTERVAL_MS = Number(process.env["TRACE_TAIL_INTERVAL_MS"] ?? DEFAULT_INTERVAL_MS);
const LIST_LIMIT = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

/** Send the token header only when we actually hold a token (headerless is valid in dev). */
function authHeaders(): Record<string, string> {
  return TOKEN === undefined || TOKEN === "" ? {} : { "x-debug-token": TOKEN };
}

type TraceSummary = {
  readonly requestId: string;
  readonly startedAt: number;
};

const seen = new Set<string>();
let firstPoll = true;

function explainStatus(status: number): string {
  if (status === HTTP_UNAUTHORIZED) {
    return "401 — token mismatch; pass --token=… or export DEBUG_TOKEN (an admin session cookie also passes)";
  }
  if (status === HTTP_NOT_FOUND) {
    return "404 — debug API disabled: server has no DEBUG_TOKEN set AND no admin session reached it";
  }
  return `HTTP ${status}`;
}

async function poll(): Promise<void> {
  let listRes: Response;
  try {
    listRes = await fetch(`${HOST}/api/_debug/traces?limit=${LIST_LIMIT}`, {
      headers: authHeaders(),
    });
  } catch (err) {
    // Print but don't exit — the loop tolerates "server isn't up yet" / transient errors.
    process.stderr.write(`trace-tail: fetch failed (${errorMessage(err)})\n`);
    return;
  }
  if (!listRes.ok) {
    process.stderr.write(`trace-tail: ${explainStatus(listRes.status)} from /api/_debug/traces\n`);
    return;
  }
  const { traces } = (await listRes.json()) as { traces: TraceSummary[] };
  if (firstPoll) {
    for (const t of traces) {
      seen.add(t.requestId);
    }
    firstPoll = false;
    process.stderr.write(`trace-tail: tailing ${HOST} (seeded ${traces.length} existing)\n`);
    return;
  }
  // Render oldest-of-the-new first so output reads chronologically.
  const fresh = traces.filter((t) => !seen.has(t.requestId)).reverse();
  for (const summary of fresh) {
    seen.add(summary.requestId);
    // biome-ignore lint/performance/noAwaitInLoops: details print in chronological order BY DESIGN — a parallel fetch would interleave waterfalls.
    const detailRes = await fetch(`${HOST}/api/_debug/traces/${summary.requestId}`, {
      headers: authHeaders(),
    });
    if (!detailRes.ok) {
      continue;
    }
    const trace = (await detailRes.json()) as RequestTrace;
    process.stdout.write(`${renderTrace(trace)}\n\n`);
  }
}

process.on("SIGINT", () => {
  process.stderr.write("\ntrace-tail: bye\n");
  process.exit(0);
});

await poll();
setInterval(() => {
  void poll();
}, INTERVAL_MS);
