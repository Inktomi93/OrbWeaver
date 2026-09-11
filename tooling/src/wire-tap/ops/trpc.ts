// The trpc op — the uncookied dev tRPC harvest, promoted from the orchestrator's curl recipes: fire
// one procedure against the dev server DIRECTLY on :8788 (owner-fallback identity — no cookie, no
// CSRF) and print the result JSON. The house router runs WITHOUT a data transformer, so input is RAW
// JSON: queries ride `?input=<url-encoded json>`, mutations POST the JSON body verbatim.
//
//   wire-tap trpc character.list
//   wire-tap trpc chat.startChat --input '{"characterIds":["…"]}' --mutate
import process from "node:process";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { DEV_PORTS } from "../../_shared/ports.ts";
import { UsageError } from "../../_shared/run-tool.ts";

refuseDirectInvocation(import.meta.url, "pnpm sse-tap (node tooling/src/wire-tap/cli.ts <verb>)");

interface TrpcArgs {
  procedure: string;
  input: string | null;
  mutate: boolean;
}

const FLAG_HANDLERS: Record<string, (args: TrpcArgs, rest: string[]) => void> = {
  "--input": (a, rest) => {
    a.input = rest.shift() ?? null;
  },
  "--mutate": (a) => {
    a.mutate = true;
  },
};

function parseTrpcArgs(argv: readonly string[]): TrpcArgs {
  const args: TrpcArgs = { procedure: "", input: null, mutate: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler !== undefined) {
      handler(args, rest);
    } else if (tok.startsWith("-")) {
      throw new UsageError(`unknown flag ${tok} — usage: wire-tap trpc <procedure> [--input <json>] [--mutate]`);
    } else if (args.procedure === "") {
      args.procedure = tok;
    } else {
      throw new UsageError(`expected one procedure, got ${JSON.stringify(tok)} after ${args.procedure}`);
    }
  }
  if (args.procedure === "") {
    throw new UsageError("usage: wire-tap trpc <procedure> [--input <json>] [--mutate]");
  }
  if (args.input !== null) {
    try {
      JSON.parse(args.input);
    } catch (e) {
      throw new UsageError(`--input is not valid JSON: ${args.input}`, { cause: e });
    }
  }
  return args;
}

function baseUrl(): string {
  // biome-ignore lint/style/noProcessEnv: PORT mirrors the server's listen port — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
  const port = process.env["PORT"] ?? String(DEV_PORTS.server);
  // biome-ignore lint/style/noProcessEnv: WIRE_TAP_BASE points the harvest at a non-local server when needed — ambient tooling env, not app config.
  return process.env["WIRE_TAP_BASE"] ?? `http://127.0.0.1:${port}`;
}

export async function trpcOp(argv: readonly string[]): Promise<number> {
  const args = parseTrpcArgs(argv);
  const base = `${baseUrl()}/api/trpc/${args.procedure}`;
  const url = args.mutate || args.input === null ? base : `${base}?input=${encodeURIComponent(args.input)}`;

  const res = await fetch(url, {
    method: args.mutate ? "POST" : "GET",
    ...(args.mutate
      ? {
          headers: { "content-type": "application/json" },
          body: args.input ?? "{}",
        }
      : {}),
  });
  const text = await res.text();
  let pretty = text;
  // @orb-waive caught-failure-ownership(catch): a non-JSON response body just prints the raw text as-is (the comment states this directly) — the response body itself is never lost, only the pretty-print step is skipped. Ends if the raw text stops being printed on this path.
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    /* non-JSON response — print verbatim */
  }
  print(pretty);
  return printVerdict("wire-tap", {
    verdict: res.ok ? EXIT.clean : EXIT.violations,
    denominators: { responses: { value: 1, refuseWhen: "zero" } },
    pairs: [
      ["op", "trpc"],
      ["procedure", args.procedure],
      ["method", args.mutate ? "POST" : "GET"],
      ["status", res.status],
    ],
  });
}
