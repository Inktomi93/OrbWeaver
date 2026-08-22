// The captures op — a reader for the wire-capture recorder (foundation/observability/debug/
// wire-capture.ts): the FINAL provider request body each chat backend actually sent (`captures`) and
// what each turn actually returned (`--outcomes`). Requires the recorder ON (`WIRE_CAPTURE=on` on the
// dev stack); an empty read with capture off is about the RECORDER, not the traffic — the report says
// so instead of printing a bare zero.
//
// ZERO HYGIENE (#409) — ALREADY GUARDED, and deliberately NOT an EXIT.toolError: printRows() below
// names the recorder as the likely cause of an empty read, which is the whole rule here. The exit stays
// clean because this op cannot tell "recorder off" (apparatus absent) from "recorder on, no traffic
// yet" (a real, quiet answer): `/api/_debug/wire/captures` returns `{count, captures}` and publishes
// NO enabled flag (foundation/observability/debug/routes.ts:322 — "Returns [] when capture is off").
// Making the distinction exit 2 requires that endpoint to report its own state; that is server
// territory, filed rather than guessed at from this side.
//
// AUTH: the same two-tier debug gate as the trace endpoints (admin session, else x-debug-token; bare
// single-user dev needs neither). Hits the server DIRECTLY on PORT (default 8788), not the vite proxy.
import process from "node:process";
import type { WireCapture, WireOutcome } from "@orb/server/foundation/observability";
import { print, printResult } from "../../_shared/artifacts.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { UsageError } from "../../_shared/run-tool.ts";

const DEFAULT_LIMIT = 20;
const BODY_KEY_CAP = 12;

interface CapturesArgs {
  outcomes: boolean;
  json: boolean;
  chatId: string | null;
  backend: string | null;
  limit: number;
}

// One handler per flag (Record dispatch, the house parser style) — an unknown flag is a hard misuse.
const FLAG_HANDLERS: Record<string, (args: CapturesArgs, rest: string[]) => void> = {
  "--outcomes": (a) => {
    a.outcomes = true;
  },
  "--json": (a) => {
    a.json = true;
  },
  "--chat": (a, rest) => {
    a.chatId = rest.shift() ?? null;
  },
  "--backend": (a, rest) => {
    a.backend = rest.shift() ?? null;
  },
  "--limit": (a, rest) => {
    a.limit = Number(rest.shift() ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT;
  },
};

function parseCapturesArgs(argv: readonly string[]): CapturesArgs {
  const args: CapturesArgs = { outcomes: false, json: false, chatId: null, backend: null, limit: DEFAULT_LIMIT };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler === undefined) {
      throw new UsageError(`unknown flag ${tok} — usage: wire-tap captures [--outcomes] [--chat <id>] [--backend <b>] [--limit <n>] [--json]`);
    }
    handler(args, rest);
  }
  return args;
}

function baseUrl(): string {
  // biome-ignore lint/style/noProcessEnv: PORT mirrors the server's listen port — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
  const port = process.env["PORT"] ?? "8788";
  // biome-ignore lint/style/noProcessEnv: WIRE_TAP_BASE points the reader at a non-local server when needed — ambient tooling env, not app config.
  return process.env["WIRE_TAP_BASE"] ?? `http://127.0.0.1:${port}`;
}

function authHeaders(): Record<string, string> {
  // biome-ignore lint/style/noProcessEnv: DEBUG_TOKEN is the ambient dev debug token (optional — single-user dev needs none). Harness plumbing, not app config.
  const token = process.env["DEBUG_TOKEN"];
  return token === undefined || token === "" ? {} : { "x-debug-token": token };
}

function printCapture(row: WireCapture): void {
  const at = new Date(row.at).toISOString();
  const keys = Object.keys(row.body);
  const shown = keys.slice(0, BODY_KEY_CAP).join(",");
  const more = keys.length > BODY_KEY_CAP ? `,…+${keys.length - BODY_KEY_CAP}` : "";
  print(`${at}  ${row.backend}/${row.api}  model=${row.model}  chat=${row.chatId ?? "-"}  body{${shown}${more}}`);
}

function printOutcome(row: WireOutcome): void {
  const at = new Date(row.at).toISOString();
  print(`${at}  chat=${row.chatId}  ${row.disposition}  finish=${row.finishReason ?? "-"}  stop=${row.stopReason ?? "-"}  model=${row.model ?? "-"}`);
}

export async function capturesOp(argv: readonly string[]): Promise<number> {
  const args = parseCapturesArgs(argv);
  const kind = args.outcomes ? "outcomes" : "captures";
  const query = new URLSearchParams();
  if (args.chatId !== null) {
    query.set("chatId", args.chatId);
  }
  if (!args.outcomes && args.backend !== null) {
    query.set("backend", args.backend);
  }
  query.set("limit", String(args.limit));
  const url = `${baseUrl()}/api/_debug/wire/${kind}?${query.toString()}`;

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    process.stderr.write(
      `wire-tap: HTTP ${res.status} from ${url} — 401 = token mismatch (pass DEBUG_TOKEN / use an admin session), 404 = debug API disabled\n`,
    );
    return EXIT.toolError;
  }
  const payload = (await res.json()) as { count: number; captures?: WireCapture[]; outcomes?: WireOutcome[] };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return EXIT.clean;
  }
  const rows = args.outcomes ? (payload.outcomes ?? []) : (payload.captures ?? []);
  printRows(args.outcomes, kind, rows);
  printResult("wire-tap", [
    ["op", kind],
    ["rows", rows.length],
    ["url", url],
  ]);
  return EXIT.clean;
}

function printRows(outcomes: boolean, kind: string, rows: readonly (WireCapture | WireOutcome)[]): void {
  if (rows.length === 0) {
    print(
      `no ${kind} — the ring is EMPTY. Capture is off by default: start the stack with WIRE_CAPTURE=on (an empty read here is about the recorder, not the traffic).`,
    );
    return;
  }
  for (const row of rows) {
    if (outcomes) {
      printOutcome(row as WireOutcome);
    } else {
      printCapture(row as WireCapture);
    }
  }
}
