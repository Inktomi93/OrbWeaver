// The tail op: poll `/api/_debug/traces` every N seconds and print each NEW trace as a waterfall.
// Resolves (exit 0) on Ctrl-C — the SIGINT handler clears the interval so the loop drains naturally
// (no process.exit: the runner owns exits).
//
// AUTH (two-tier gate, foundation/observability/debug/routes.ts): an owner session short-circuits
// first, then the x-debug-token fallback. Single-user dev needs no token; the header rides only when
// one is provided (--token=… or env DEBUG_TOKEN). Connection: hits the server DIRECTLY on PORT
// (default 8788), not through the vite dev proxy.
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import type { RequestTrace } from "@orb/server/foundation/observability";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { DEV_PORTS } from "../../_shared/ports.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import { renderTrace } from "../lib/render.ts";

refuseDirectInvocation(import.meta.url, "pnpm trace:render | pnpm trace:tail | pnpm trace:fire");

// biome-ignore lint/style/noProcessEnv: PORT mirrors the server's own listen port so the tail hits the right box — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
const PORT = process.env["PORT"] ?? String(DEV_PORTS.server);
// biome-ignore lint/style/noProcessEnv: TRACE_TAIL_HOST points the tail at a non-local server when needed — ambient tooling env, not app config.
const HOST = process.env["TRACE_TAIL_HOST"] ?? `http://127.0.0.1:${PORT}`;
const DEFAULT_INTERVAL_MS = 2000;
const LIST_LIMIT = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
// biome-ignore lint/style/noProcessEnv: TRACE_TAIL_INTERVAL_MS tunes the poll cadence — ambient tooling env, not app config.
const INTERVAL_MS = Number(process.env["TRACE_TAIL_INTERVAL_MS"] ?? DEFAULT_INTERVAL_MS);

/** Send the token header only when we actually hold a token (headerless is valid in dev). */
function authHeaders(token: string | undefined): Record<string, string> {
  return token === undefined || token === "" ? {} : { "x-debug-token": token };
}

interface TraceSummary {
  readonly requestId: string;
  readonly startedAt: number;
}

const seen = new Set<string>();
let firstPoll = true;

function explainStatus(status: number): string {
  if (status === HTTP_UNAUTHORIZED) {
    return "401 — token mismatch; pass --token=… or export DEBUG_TOKEN (an owner session cookie also passes)";
  }
  if (status === HTTP_NOT_FOUND) {
    return "404 — debug API disabled: server has no DEBUG_TOKEN set AND no owner session reached it";
  }
  return `HTTP ${status}`;
}

async function poll(token: string | undefined): Promise<void> {
  let listRes: Response;
  try {
    listRes = await fetch(`${HOST}/api/_debug/traces?limit=${LIST_LIMIT}`, {
      headers: authHeaders(token),
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
    const detailRes = await fetch(`${HOST}/api/_debug/traces/${summary.requestId}`, {
      headers: authHeaders(token),
    });
    if (!detailRes.ok) {
      continue;
    }
    const trace = (await detailRes.json()) as RequestTrace;
    process.stdout.write(`${renderTrace(trace)}\n\n`);
  }
}

export function tailOp(argv: readonly string[]): Promise<number> {
  // `--token=` is the whole grammar; anything else used to be silently dropped, so `--token foo`
  // (space, not `=`) tailed UNAUTHENTICATED and printed the 401 as if it were the server's answer.
  const unknown = argv.find((a) => !a.startsWith("--token="));
  if (unknown !== undefined) {
    throw new UsageError(`trace:tail does not recognize ${JSON.stringify(unknown)} — usage: pnpm trace:tail [--token=<t>]`);
  }
  const tokenArg = argv.find((a) => a.startsWith("--token="));
  // biome-ignore lint/style/noProcessEnv: DEBUG_TOKEN is the ambient dev debug token the operator already exported for curl loops (optional — single-user dev needs none). Harness plumbing, not app config.
  const tokenEnv = process.env["DEBUG_TOKEN"];
  const token = tokenArg === undefined ? tokenEnv : tokenArg.slice("--token=".length);
  return new Promise<number>((resolve) => {
    const runPoll = (): void => {
      poll(token).catch((err: unknown) => {
        process.stderr.write(`trace-tail: poll failed (${errorMessage(err)})\n`);
      });
    };
    const timer = setInterval(() => {
      runPoll();
    }, INTERVAL_MS);
    process.on("SIGINT", () => {
      process.stderr.write("\ntrace-tail: bye\n");
      clearInterval(timer);
      resolve(EXIT.clean);
    });
    runPoll();
  });
}
