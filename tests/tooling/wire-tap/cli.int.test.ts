// @instrument-proof: a loopback fixture server emitting two scripted tRPC-SSE frames (the
// sdk-hook-wire-probe capture-server idiom — no dev-stack dependency) must be reported FRAME-FOR-FRAME
// by the real tap: attach POST answered, both planted payloads printed, clean exit on the `return`
// event. Silence-on-connect cannot read as proof of events, so the assertions name the planted frames.
// The wire grammar below is @trpc/server's own sseStreamConsumer contract (connected/ping/return named
// events + default `message` events whose SSE id is the envelope ordinal), read from the installed
// v11.18 source at the move.
import type { Server } from "node:http";
import { createServer } from "node:http";
import { expect, test } from "../../support/tool-fixtures.ts";

const CLI_TIMEOUT_MS = 30_000;
// Bare node 26.5 has NO EventSource global (measured at the move — the reason `pnpm sse-tap` carries
// the flag); the child gets it via NODE_OPTIONS, exactly like the front-door script.
// biome-ignore lint/style/useNamingConvention: NODE_OPTIONS is node's own env-var spelling, not an identifier.
const NODE_FLAG_ENV = { NODE_OPTIONS: "--experimental-eventsource" };

/** The same wire, with the frames removed: a stream that opens and closes having delivered NOTHING —
 *  which the op's own header says can mean "not a member", not only "no events" (#409). */
const SILENT_SSE_BODY = ["event: connected", "data: {}", "", "event: return", "data: {}", "", ""].join("\n");

const SSE_BODY = [
  "event: connected",
  "data: {}",
  "",
  "id: 1",
  'data: {"channel":"chat","seq":7,"event":{"type":"planted-frame-one"}}',
  "",
  "id: 2",
  'data: {"channel":"chat","seq":8,"event":{"type":"planted-frame-two"}}',
  "",
  "event: return",
  "data: {}",
  "",
  "",
].join("\n");

/** The loopback stand-in for the dev stack: answers the attach POST with a batched tRPC result and the
 *  connect GET with the scripted SSE stream. */
function fixtureServer(body: string = SSE_BODY): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = req.url ?? "";
      if (req.method === "POST" && url.includes("stream.attach")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('[{"result":{"data":{"ok":true}}}]');
        return;
      }
      if (url.includes("stream.connect")) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === "object" && addr !== null ? addr.port : 0 });
    });
  });
}

test("the tap reports the planted frames frame-for-frame and exits clean on `return`", async ({ runCli }) => {
  const { server, port } = await fixtureServer();
  try {
    const res = await runCli("wire-tap", ["sse", "chat-proof-1"], {
      timeoutMs: CLI_TIMEOUT_MS,
      // biome-ignore lint/style/useNamingConvention: SSE_TAP_BASE is the tap's own env-var spelling.
      env: { ...NODE_FLAG_ENV, SSE_TAP_BASE: `http://127.0.0.1:${port}` },
    });
    expect(res.stdout).toContain("connection open");
    expect(res.stdout).toContain("seq=7  planted-frame-one");
    expect(res.stdout).toContain("seq=8  planted-frame-two");
    expect(res.stdout).toContain("connection closed");
    // The denominator (#409): the clean exit is only a receipt if frames were actually delivered.
    expect(res.stdout).toContain("frames=2");
    expect(res).toExitWith(0);
  } finally {
    server.close();
  }
});

test("a stream that delivered NO frames reports an empty population, never a bare clean exit", async ({ runCli }) => {
  // ZERO HYGIENE (#409): a silent tap is a LEGITIMATE outcome (a quiet-but-healthy room), so it is not
  // a tool error — but the run must say the frame population was empty, and repeat the withhold caveat
  // the op's header carries: silence can mean "not a member", not only "no events".
  const { server, port } = await fixtureServer(SILENT_SSE_BODY);
  try {
    const res = await runCli("wire-tap", ["sse", "chat-proof-silent"], {
      timeoutMs: CLI_TIMEOUT_MS,
      // biome-ignore lint/style/useNamingConvention: SSE_TAP_BASE is the tap's own env-var spelling.
      env: { ...NODE_FLAG_ENV, SSE_TAP_BASE: `http://127.0.0.1:${port}` },
    });
    expect(res.stdout).toContain("frames=0");
    expect(res.stdout).toContain("NO frames");
    expect(res).toExitWith(0);
  } finally {
    server.close();
  }
});

test("without the EventSource flag the guard fail-louds as misuse, never a bare crash", async ({ runCli }) => {
  const res = await runCli("wire-tap", ["sse", "chat-proof-2"]);
  expect(res.stderr).toContain("EventSource");
  expect(res).toExitWith(3);
});

test("a missing chatId is CLI misuse", async ({ runCli }) => {
  const res = await runCli("wire-tap", ["sse"], { env: NODE_FLAG_ENV });
  expect(res).toExitWith(3);
});

test("an unknown subcommand is CLI misuse", async ({ runCli }) => {
  const res = await runCli("wire-tap", ["tcpdump"]);
  expect(res).toExitWith(3);
});
