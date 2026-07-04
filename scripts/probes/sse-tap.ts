#!/usr/bin/env tsx
/**
 * pnpm sse-tap <chatId>
 *
 * The curl-replacement for the tRPC SSE channel. Subscribes to `chat.streamMessages`
 * via a real tRPC client and pretty-prints every ChatBusEvent envelope. Exits on
 * Ctrl-C OR when the subscription closes.
 *
 * WHY: bisects "is the UI broken or is the backend not emitting" without a browser.
 * Events here but not in the client → client bug. Silence here → chat verb / bus bug.
 * NOTE the withhold-not-throw gate (transport/trpc/routers/chat.ts): a chatId you are
 * not a member of (or that doesn't exist yet) yields an OPEN, SILENT stream — silence
 * can mean "not a member", not only "no events". `connection open` + no error proves
 * connect/auth/subscribe.
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
 * globalThis.EventSource)(url)` at subscribe time — on this Node (24.x, undici's
 * EventSource) the global only exists behind `--experimental-eventsource` (live-verified:
 * without it, subscribe() throws "opts.EventSource is not a constructor"). Rather than a new
 * dependency (an EventSource polyfill) or asking every caller to remember the flag, this
 * self-re-execs ONCE under the flag before constructing the client — replaying tsx's own
 * loader `execArgv` so the re-exec still runs through tsx, not bare node.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AppRouter } from "@orb/server/transport/trpc";
import { createTRPCClient, httpSubscriptionLink } from "@trpc/client";

if (typeof globalThis.EventSource === "undefined") {
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, "--experimental-eventsource", ...process.argv.slice(1)],
    { stdio: "inherit" },
  );
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

// tRPC v11 SSE (httpSubscriptionLink → Node's global EventSource). The Cookie rides in
// via eventSourceOptions.fetch — the sanctioned header-injection seam for undici's
// EventSource. Only a subscription flows through this client, so one link suffices.
const client = createTRPCClient<AppRouter>({
  links: [
    httpSubscriptionLink({
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
  ],
});

process.stdout.write(`tapping ${TRPC_URL}  chatId=${chatIdArg}\n`);
process.stdout.write("press Ctrl-C to exit\n\n");

// `streamMessages` yields tracked envelopes — onData receives `{id, data}` where `id`
// is the durable per-chat seq (the SSE resume cursor) and `data` is the ChatBusEvent.
const sub = client.chat.streamMessages.subscribe(
  { chatId: castId<ChatId>(chatIdArg) },
  {
    onStarted: () => process.stdout.write("· connection open\n"),
    onData: (envelope) => {
      const ts = new Date().toISOString().slice(TS_START, TS_END);
      const { data } = envelope;
      // withSubscriptionErrors (transport/trpc/subscriptions.ts) mixes a typed terminal
      // `SubscriptionErrorFrame` into the same tracked stream as the real ChatBusEvent
      // union (the withhold-not-throw doctrine this probe's header documents) — narrow on
      // the `__subscriptionError` sentinel before touching `.type`, which only the real
      // events carry.
      if ("__subscriptionError" in data) {
        process.stdout.write(
          `${ts}  seq=${envelope.id}  ! subscription-error  code=${data.code}  ${data.message}\n`,
        );
        return;
      }
      process.stdout.write(`${ts}  seq=${envelope.id}  ${data.type}  ${JSON.stringify(data)}\n`);
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
