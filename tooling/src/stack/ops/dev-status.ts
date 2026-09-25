// `stack status` and `stack logs`: the record's verdict, the ports, the two answers, the served-module
// probe, the pins the launch used and the auth mode the server really resolved.
import { readFileSync } from "node:fs";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { httpOk } from "../../_shared/http-probe.ts";
import { budget } from "../../_shared/load-budget.ts";
import { listeningPids } from "../../_shared/platform.ts";
import type { DevPinKey, LeaderRead, LeaderState, PinSource, ServedVerdict, StackContext } from "../contract/types.ts";
import { DEV_PIN_KEYS } from "../contract/types.ts";
import { authConfigUrl, healthzUrl, PRINTABLE_PINS, printablePins } from "../lib/stack-plan.ts";
import { groupName, readVerdict, result } from "./dev-down.ts";
import { probeServedTransform } from "./served-probe.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack status");

const DEFAULT_LOG_LINES = 40;
const LINE_BREAK_RE = /\r?\n/u;
const PROBE_TIMEOUT_BASE_MS = 2000;
const LOG_TARGETS = ["server", "client", "both"] as const;
type LogTarget = (typeof LOG_TARGETS)[number];

function isLogTarget(value: string): value is LogTarget {
  return (LOG_TARGETS as readonly string[]).includes(value);
}

function leaderLine(read: LeaderRead, state: LeaderState): string {
  if (read.kind !== "record") {
    return `${state} (${read.kind === "absent" ? "no record" : `malformed record ${read.path}`})`;
  }
  const record = read.record;
  return `${state} — pgid ${groupName(record)} · leader pid ${String(record.pid)} · children ${record.children.map(String).join(", ") || "none"} · started ${record.startedAt}`;
}

/** The pins: printable values shown, secrets by source only. */
function pinLine(values: Readonly<Partial<Record<DevPinKey, string>>>, sources: Readonly<Record<DevPinKey, PinSource>>, note: string): string {
  const parts = DEV_PIN_KEYS.map((key) => {
    const shown = PRINTABLE_PINS.includes(key) ? (values[key] ?? "?") : "<redacted>";
    return `${key}=${shown}(${sources[key]})`;
  });
  return `env pins      : ${parts.join(" ")}  ${note}`;
}

function pinsLine(ctx: StackContext, read: LeaderRead, state: LeaderState): string {
  if (read.kind === "record" && state !== "departed") {
    return pinLine(read.record.pins.values, read.record.pins.sources, "(as launched)");
  }
  return pinLine(printablePins(ctx.pins), ctx.pins.sources, "(what a launch from this shell would use)");
}

/** The auth mode the server resolved after `.env`: the one honest answer to "what is running". */
async function effectiveAuthMode(serverPort: number): Promise<string | null> {
  // @orb-waive caught-failure-ownership(catch): a server that does not answer the config probe reports "?" in one status line and decides nothing; the healthz line beside it already says the server is unreachable. Ends if this value drives a verdict.
  try {
    const res = await fetch(authConfigUrl(serverPort), { signal: AbortSignal.timeout(budget(PROBE_TIMEOUT_BASE_MS)) });
    const body = (await res.json()) as { mode?: unknown };
    return typeof body.mode === "string" ? body.mode : null;
  } catch {
    return null;
  }
}

function servedExit(verdict: ServedVerdict): ExitCode {
  if (verdict.state === "fresh") {
    return EXIT.clean;
  }
  return verdict.state === "stale" ? EXIT.violations : EXIT.toolError;
}

async function servedVerdict(ctx: StackContext, vitePid: number | null): Promise<ServedVerdict> {
  if (vitePid === null) {
    return { state: "unverifiable", file: null, message: "vite is not bound — freshness NOT measured" };
  }
  return await probeServedTransform(undefined, ctx.ports.vite);
}

/** Degraded is `up` with a lie in it: the ports answer but vite serves code that is not on disk. It is
 *  the one state that exits non-zero. */
function stackState(healthy: boolean, serverPid: number | null, vitePid: number | null, served: ServedVerdict): string {
  if (healthy && vitePid !== null) {
    return served.state === "fresh" ? "up" : "degraded";
  }
  return serverPid !== null || vitePid !== null ? "partial" : "down";
}

export async function doDevStatus(ctx: StackContext): Promise<ExitCode> {
  const { read, state } = readVerdict(ctx);
  const bound = listeningPids();
  const serverPid = bound.get(ctx.ports.server) ?? null;
  const vitePid = bound.get(ctx.ports.vite) ?? null;
  const healthy = await httpOk(healthzUrl(ctx.ports.server));
  const health = healthy ? "ok" : "unreachable";
  const served = await servedVerdict(ctx, vitePid);
  print(`leader        : ${leaderLine(read, state)}`);
  print(`server :${String(ctx.ports.server)}  : pid ${serverPid === null ? "not bound" : String(serverPid)} · healthz ${health}`);
  print(`vite   :${String(ctx.ports.vite)}  : pid ${vitePid === null ? "not bound" : String(vitePid)}`);
  print(`served module : ${served.state} · ${served.file ?? "none"}`);
  print(`              : ${served.message}`);
  print(pinsLine(ctx, read, state));
  print(
    `effective     : AUTH_MODE=${(await effectiveAuthMode(ctx.ports.server)) ?? "?"}  (server /api/auth/config — resolved after .env; the truth if it differs above)`,
  );
  print(`logs          : ${ctx.logs.stack} · ${ctx.logs.server} · ${ctx.logs.client}`);
  const verdict = stackState(healthy, serverPid, vitePid, served);
  result(
    `status=${verdict} server-pid=${String(serverPid ?? 0)} healthz=${health} vite-pid=${String(vitePid ?? 0)} served=${served.state} pidfile=${read.kind === "record" ? groupName(read.record) : "none"}`,
  );
  return verdict === "degraded" ? servedExit(served) : EXIT.clean;
}

function tail(path: string, lines: number): string {
  // @orb-waive caught-failure-ownership(catch): an unreadable optional log renders the explicit no-log sentinel to the operator. Ends if log content becomes a control verdict.
  try {
    return readFileSync(path, "utf8").split(LINE_BREAK_RE).slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}

/** `logs [server|client] [n]`: one file, or all three with headers. */
export function doDevLogs(ctx: StackContext, rest: readonly string[]): ExitCode {
  const [target = "both", count = String(DEFAULT_LOG_LINES)] = rest;
  const lines = Number(count);
  if (!(isLogTarget(target) && Number.isInteger(lines) && lines > 0)) {
    print("usage: pnpm stack logs [server|client] [n]");
    return EXIT.misuse;
  }
  const files: readonly (readonly [string, string])[] =
    target === "both"
      ? [
          ["leader", ctx.logs.stack],
          ["server", ctx.logs.server],
          ["client", ctx.logs.client],
        ]
      : [[target, target === "server" ? ctx.logs.server : ctx.logs.client]];
  for (const [label, path] of files) {
    if (target === "both") {
      print(`── ${label} (${path}) ──`);
    }
    print(tail(path, lines));
  }
  return EXIT.clean;
}
