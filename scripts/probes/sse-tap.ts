#!/usr/bin/env tsx
/**
 * pnpm sse-tap <chatId>
 *
 * The curl-replacement for the tRPC SSE channel. Since SSE-1 a tab holds ONE socket:
 * this ATTACHES the chat ROOM for <chatId> and then opens `stream.connect`, printing
 * every frame that room delivers. Exits on Ctrl-C OR when the socket closes.
 *
 * NOTE the withhold-not-throw gate (transport/trpc/stream/sources/chat.ts): a chatId you are
 * not a member of (or that doesn't exist yet) yields an OPEN, SILENT stream — silence
 * can mean "not a member", not only "no events". `connection open` + no error proves
 * connect/auth/attach.
 *
 * PREREQUISITES (single-user dev stack — `pnpm stack start`):
 *   • No cookie needed: the owner fallback resolves identity on :8788 directly.
 *   • A real chat row to hear events from. Seed one through the real verbs, e.g.:
 *       curl -s 'http://127.0.0.1:8788/api/trpc/character.list' | jq   # → a characterId
 *       curl -s -X POST http://127.0.0.1:8788/api/trpc/chat.startChat \
 *         -H 'content-type: application/json' -d '{"characterIds":["<charId>"]}'
 *     then `pnpm sse-tap <chatId>` and drive events (chat.send, title edits, …).
 *   • Cookie modes: export SSE_TAP_COOKIE to a `Cookie:` header value from devtools.
 *
 * Connection: hits the server DIRECTLY on PORT (default 8788), NOT the vite proxy on
 * 5173 — deliberate, so "vite proxy ate my SSE" shows as "sse-tap works, browser doesn't".
 *
 * NODE EVENTSOURCE: `httpSubscriptionLink` constructs `new (opts.EventSource ??
 * globalThis.EventSource)(url)` at subscribe time — on this Node (24.x) the global only
 * exists behind `--experimental-eventsource` (without it, subscribe() throws). This
 * self-re-execs ONCE under the flag before constructing the client, replaying tsx's own
 * loader `execArgv` so the re-exec still runs through tsx.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import type { ChatId, SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AppRouter } from "@orb/server/transport/trpc";
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";

if (typeof globalThis.EventSource === "undefined") {
  const result = spawnSync(process.execPath, [...process.execArgv, "--experimental-eventsource", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

// biome-ignore lint/style/noProcessEnv: PORT mirrors the server's listen port so the tap hits the right box — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
const PORT = process.env["PORT"] ?? "8788";
// biome-ignore lint/style/noProcessEnv: SSE_TAP_BASE points the tap at a non-local server when needed — ambient tooling env, not app config.
const BASE = process.env["SSE_TAP_BASE"] ?? `http://127.0.0.1:${PORT}`;
const TRPC_URL = `${BASE}/api/trpc`;
// biome-ignore lint/style/noProcessEnv: SSE_TAP_COOKIE carries a browser session for cookie-mode deploys (single-user needs none) — harness plumbing, not app config.
const COOKIE = process.env["SSE_TAP_COOKIE"] ?? "";

const EXIT_USAGE = 2;
const TS_START = 11;
const TS_END = 23;

const chatIdArg = process.argv[2];
if (chatIdArg === undefined || chatIdArg === "") {
  process.stderr.write("usage: pnpm sse-tap <chatId>\n");
  process.exit(EXIT_USAGE);
}

// The Cookie rides in via eventSourceOptions.fetch (the header-injection seam for undici's EventSource) and
// via the batch link's own `headers` for the ATTACH mutation. The split mirrors the app's client: the socket
// on the subscription link, `stream.attach` on the ordinary batched HTTP link.
const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: TRPC_URL,
        ...(COOKIE === ""
          ? {}
          : {
              eventSourceOptions: {
                fetch: (u: string | URL | Request, init?: RequestInit): Promise<Response> =>
                  fetch(u, { ...init, headers: { ...(init?.headers ?? {}), Cookie: COOKIE } }),
              },
            }),
      }),
      false: httpBatchLink({
        url: TRPC_URL,
        // A cookie principal's mutation needs the CSRF header (transport/trpc/trpc.ts); the fallback owner
        // needs neither and ignores both.
        headers: () => (COOKIE === "" ? {} : { Cookie: COOKIE, "x-orb-csrf": "1" }),
      }),
    }),
  ],
});

process.stdout.write(`tapping ${TRPC_URL}  chatId=${chatIdArg}\n`);
process.stdout.write("press Ctrl-C to exit\n\n");

const socketId = castId<SocketId>(globalThis.crypto.randomUUID());
const chatId = castId<ChatId>(chatIdArg);

// Attach FIRST: the cell is created by whichever of attach/connect arrives first, so an attach-then-connect
// tap re-hydrates the room the instant the socket goes live (spec §5.1).
await client.stream.attach.mutate({ socketId, ref: { channel: "chat", chatId } });

const sub = client.stream.connect.subscribe(
  { socketId },
  {
    onStarted: () => process.stdout.write("· connection open\n"),
    onData: (envelope) => {
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
      process.exit(1);
    },
    onComplete: () => {
      process.stdout.write("· connection closed\n");
      process.exit(0);
    },
  },
);

process.on("SIGINT", () => {
  sub.unsubscribe();
  process.stdout.write("\n· interrupted\n");
  process.exit(0);
});
