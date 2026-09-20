// The captures op — a reader for the wire-capture recorder (foundation/observability/debug/
// wire-capture.ts): the FINAL provider request body each chat backend actually sent (`captures`) and
// what each turn actually returned (`--outcomes`). Requires the recorder ON (`WIRE_CAPTURE=on` on the
// dev stack); an empty read with capture off is about the RECORDER, not the traffic — the report says
// so instead of printing a bare zero.
//
// ZERO HYGIENE (#409, closed by #412) — the distinction is now KEYED, not caveated. Both wire probes
// publish `enabled`: the recorder's own state, per arm (`captures` = compose's request-sink decision,
// `outcomes` = the env self-gate — the gating asymmetry is real and the server reports it per route).
// So:
//   • `enabled: false` ⇒ APPARATUS ABSENT. The ring is never written; a zero here says nothing about the
//     traffic. EXIT.toolError (2) — "the run is NOT a verdict", the house contract.
//   • `enabled: true`, zero rows ⇒ an HONEST empty. EXIT.clean (0) with the count, and the caveat drops
//     (the recorder is on, so silence really is silence).
//   • the field ABSENT ⇒ the server predates #412 and CANNOT be asked. Same class as off: exit 2, because
//     the op still cannot render a verdict — it just cannot say which way.
//
// AUTH: the same two-tier debug gate as the trace endpoints (admin session, else x-debug-token; bare
// single-user dev needs neither). Hits the server DIRECTLY on PORT (default 8788), not the vite proxy.
import process from "node:process";
import type { WireCapture, WireOutcome } from "@orb/server/foundation/observability";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { DEV_PORTS } from "../../_shared/ports.ts";
import { UsageError } from "../../_shared/run-tool.ts";

refuseDirectInvocation(import.meta.url, "pnpm sse-tap (node tooling/src/wire-tap/cli.ts <verb>)");

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
  const port = process.env["PORT"] ?? String(DEV_PORTS.server);
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
  print(`${at}  ${row.providerId}/${row.api}  model=${row.model}  chat=${row.chatId ?? "-"}  body{${shown}${more}}`);
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
  const payload = (await res.json()) as { enabled?: boolean; count: number; captures?: WireCapture[]; outcomes?: WireOutcome[] };
  // The recorder-state key (#412) is read BEFORE the --json short-circuit so a machine-readable run carries
  // the same verdict a human one does — the payload still prints in full, the exit is what differs.
  const recorder = payload.enabled;
  const rows = args.outcomes ? (payload.outcomes ?? []) : (payload.captures ?? []);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return recorderExit(recorder, kind, url);
  }
  printRows(args.outcomes, kind, rows);
  const verdict = recorderExit(recorder, kind, url);
  return printVerdict("wire-tap", {
    verdict,
    denominators: {
      rows: {
        value: rows.length,
        refuseWhen: "zero",
        ...(rows.length === 0 && recorder === true ? { honestEmpty: "enabled recorder ring contained no rows" } : {}),
      },
    },
    pairs: [
      ["op", kind],
      ["recorder", describeRecorder(recorder)],
      ["rows", rows.length],
      ["url", url],
    ],
  });
}

/** The three recorder states as one word for the result line — `unreported` is the pre-#412 server, and is
 *  deliberately NOT folded into "off": they exit the same, but they are different facts. */
function describeRecorder(recorder: boolean | undefined): string {
  if (recorder === undefined) {
    return "unreported";
  }
  return recorder ? "on" : "off";
}

/** The exit half of the #412 rule (see the header). A read taken with the recorder OFF — or against a server
 *  that will not say — is APPARATUS ABSENCE, so it exits 2 whatever the row count was. */
function recorderExit(recorder: boolean | undefined, kind: string, url: string): number {
  if (recorder === true) {
    return EXIT.clean;
  }
  process.stderr.write(
    recorder === false
      ? `wire-tap: the wire-capture recorder is OFF — this ${kind} read is about the RECORDER, not the traffic (the ring is never written). Start the stack with WIRE_CAPTURE=on and re-run.\n`
      : `wire-tap: ${url} published no \`enabled\` field — this server predates the recorder-state probe (#412), so an empty ${kind} read cannot be told apart from an off recorder.\n`,
  );
  return EXIT.toolError;
}

function printRows(outcomes: boolean, kind: string, rows: readonly (WireCapture | WireOutcome)[]): void {
  if (rows.length === 0) {
    print(`no ${kind} — the ring is EMPTY (see the recorder state on the result line below).`);
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
