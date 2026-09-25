// The sse op — the curl-replacement for the tRPC SSE channel. Since SSE-1 a tab holds ONE socket:
// this ATTACHES the chat ROOM for <chatId> and then opens `stream.connect`, printing every frame that
// room delivers. Resolves on Ctrl-C or when the socket closes.
//
// NOTE the withhold-not-throw gate (transport/trpc/stream/sources/chat.ts): a chatId you are not a
// member of (or that doesn't exist yet) yields an OPEN, SILENT stream — silence can mean "not a
// member", not only "no events". `connection open` + no error proves connect/auth/attach.
//
// PREREQUISITES (single-user dev stack — `pnpm stack up`): no cookie needed (the owner fallback
// resolves identity on :8788 directly) and a real chat row to hear events from. Cookie modes: export
// SSE_TAP_COOKIE to a `Cookie:` header value from devtools. Connection: hits the server DIRECTLY on
// PORT (default 8788), NOT the vite proxy on 5173 — deliberate, so "vite proxy ate my SSE" shows as
// "sse-tap works, browser doesn't".
//
// NODE EVENTSOURCE (P3 truth-repair, measured on node v26.5.0): `httpSubscriptionLink` constructs
// `new (opts.EventSource ?? globalThis.EventSource)(url)` at subscribe time, and the global is STILL
// flag-gated (`--experimental-eventsource`; bare node 26.5 has none). The pre-move self-re-exec died
// at the move — the `pnpm sse-tap` script now carries the flag at the front door, and this guard
// fail-louds when the op is reached without it.
import process from "node:process";
import type { ChatId, SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AppRouter } from "@orb/server/transport/trpc";
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { DEV_PORTS } from "../../_shared/ports.ts";
import { UsageError } from "../../_shared/run-tool.ts";

refuseDirectInvocation(import.meta.url, "pnpm sse-tap (node tooling/src/wire-tap/cli.ts <verb>)");

const TS_START = 11;
const TS_END = 23;

interface SseEnv {
  readonly trpcUrl: string;
  readonly cookie: string;
}

function readEnv(): SseEnv {
  // biome-ignore lint/style/noProcessEnv: PORT mirrors the server's listen port so the tap hits the right box — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
  const port = process.env["PORT"] ?? String(DEV_PORTS.server);
  // biome-ignore lint/style/noProcessEnv: SSE_TAP_BASE points the tap at a non-local server when needed — ambient tooling env, not app config.
  const base = process.env["SSE_TAP_BASE"] ?? `http://127.0.0.1:${port}`;
  // biome-ignore lint/style/noProcessEnv: SSE_TAP_COOKIE carries a browser session for cookie-mode deploys (single-user needs none) — harness plumbing, not app config.
  const cookie = process.env["SSE_TAP_COOKIE"] ?? "";
  return { trpcUrl: `${base}/api/trpc`, cookie };
}

function buildClient(env: SseEnv): ReturnType<typeof createTRPCClient<AppRouter>> {
  // The Cookie rides in via eventSourceOptions.fetch (the header-injection seam for undici's
  // EventSource) and via the batch link's own `headers` for the ATTACH mutation. The split mirrors the
  // app's client: the socket on the subscription link, `stream.attach` on the ordinary batched link.
  return createTRPCClient<AppRouter>({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({
          url: env.trpcUrl,
          ...(env.cookie === ""
            ? {}
            : {
                eventSourceOptions: {
                  fetch: (u: string | URL | Request, init?: RequestInit): Promise<Response> =>
                    // biome-ignore lint/style/useNamingConvention: `Cookie` is the HTTP header's own spelling, not an identifier.
                    fetch(u, { ...init, headers: { ...(init?.headers ?? {}), Cookie: env.cookie } }),
                },
              }),
        }),
        false: httpBatchLink({
          url: env.trpcUrl,
          // A cookie principal's mutation needs the CSRF header (transport/trpc/trpc.ts); the fallback
          // owner needs neither and ignores both.
          // biome-ignore lint/style/useNamingConvention: `Cookie` is the HTTP header's own spelling, not an identifier.
          headers: () => (env.cookie === "" ? {} : { Cookie: env.cookie, "x-orb-csrf": "1" }),
        }),
      }),
    ],
  });
}

/** The tap's closing census (#409). An empty population is reported, never implied: a bare
 *  "connection closed" after zero frames looks identical to a successful tap of a busy room, and the
 *  withhold-not-throw gate means silence can also mean "you are not a member of this chat". */
function reportFrames(frames: number, verdict: number): number {
  if (frames === 0) {
    print("· NO frames delivered — silence here can mean you are NOT A MEMBER of that chat (the withhold-not-throw gate), not only that the room was quiet");
  }
  return printVerdict("wire-tap", {
    verdict,
    denominators: { frames: { value: frames, refuseWhen: "zero", ...(frames === 0 ? { honestEmpty: "healthy SSE connection delivered no frames" } : {}) } },
    pairs: [
      ["op", "sse"],
      ["frames", frames],
    ],
  });
}

export async function sseOp(argv: readonly string[]): Promise<number> {
  if (typeof globalThis.EventSource === "undefined") {
    throw new UsageError(
      "no EventSource global — run via `pnpm sse-tap` (the script carries --experimental-eventsource; bare node 26 does not expose the global)",
    );
  }
  const chatIdArg = argv[0];
  if (chatIdArg === undefined || chatIdArg === "" || argv.length > 1) {
    // The trailing tokens used to be dropped, so a second id tapped only the FIRST room while the
    // operator read the transcript as covering both (#971).
    throw new UsageError("usage: pnpm sse-tap <chatId>");
  }
  const env = readEnv();
  const client = buildClient(env);

  process.stdout.write(`tapping ${env.trpcUrl}  chatId=${chatIdArg}\n`);
  process.stdout.write("press Ctrl-C to exit\n\n");

  const socketId = castId<SocketId>(globalThis.crypto.randomUUID());
  const chatId = castId<ChatId>(chatIdArg);
  // ZERO HYGIENE (#409): the frame POPULATION this tap observed. A silent room is a legitimate outcome
  // here — unlike a budget probe, a tap has no apparatus-absence signal to key on (the withhold-not-
  // throw gate above means a non-member gets an OPEN, SILENT stream) — so an empty population stays a
  // CLEAN exit. What it must never do is end with a bare "connection closed" that reads as a receipt
  // for events: the count and the withhold caveat are printed instead.
  let frames = 0;

  // Attach FIRST: the cell is created by whichever of attach/connect arrives first, so an
  // attach-then-connect tap re-hydrates the room the instant the socket goes live (spec §5.1).
  await client.stream.attach.mutate({ socketId, ref: { channel: "chat", chatId } });

  return new Promise<number>((resolve) => {
    const sub = client.stream.connect.subscribe(
      { socketId },
      {
        onStarted: () => process.stdout.write("· connection open\n"),
        onData: (envelope) => {
          frames += 1;
          const ts = new Date().toISOString().slice(TS_START, TS_END);
          const { data } = envelope;
          // Narrow on the `__subscriptionError` sentinel before touching the frame, which only
          // real frames carry (see withSubscriptionErrors, transport/trpc/subscriptions.ts).
          if ("__subscriptionError" in data) {
            process.stdout.write(`${ts}  ord=${envelope.id}  ! socket-error  code=${data.code}  ${data.message}\n`);
            return;
          }
          if (data.channel === "control") {
            process.stdout.write(`${ts}  ord=${envelope.id}  · ${data.type}  ${JSON.stringify(data)}\n`);
            return;
          }
          // The durable cursor rides the FRAME (§3.3 — the envelope id is a per-socket ordinal).
          const seq = "seq" in data ? data.seq : "-";
          process.stdout.write(`${ts}  seq=${seq}  ${data.event.type}  ${JSON.stringify(data.event)}\n`);
        },
        onError: (err) => {
          process.stderr.write(`! error: ${err.message}\n`);
          resolve(reportFrames(frames, EXIT.violations));
        },
        onComplete: () => {
          process.stdout.write("· connection closed\n");
          resolve(reportFrames(frames, EXIT.clean));
        },
      },
    );
    process.on("SIGINT", () => {
      sub.unsubscribe();
      process.stdout.write("\n· interrupted\n");
      resolve(reportFrames(frames, EXIT.clean));
    });
  });
}
