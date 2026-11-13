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
// THE CONNECT IS A JSON POST, as the app's `PostEventSource` sends it. Node's EventSource opens a GET and
// takes no request headers, and the mount refuses a GET without the CSRF header, so the tap reads the
// event stream off a plain `fetch` instead.
import process from "node:process";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { isSubscriptionErrorFrame } from "@orb/contracts/rpc";
import type { ChatId, SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AppRouter } from "@orb/server/transport/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { z } from "zod";
import { print } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { DEV_PORTS } from "../../floor/host/ports.ts";
import { processEnvValue } from "../../floor/process/process-env.ts";
import { printVerdict } from "../../floor/verdict/evidence.ts";
import { PORT_ENV } from "../../stack/index.ts";

refuseDirectInvocation(import.meta.url, "pnpm sse-tap (node tooling/src/wire-tap/cli.ts <verb>)");

const TS_START = 11;
const TS_END = 23;
const EVENT_SEPARATOR = "\n\n";
// tRPC's SSE producer names these events; every unnamed one is a frame.
const CONNECTED_EVENT = "connected";
const RETURN_EVENT = "return";
const ERROR_EVENT = "serialized-error";
const PING_EVENT = "ping";
const frameSchema = z.looseObject({
  channel: z.string(),
  type: z.string().optional(),
  seq: z.number().nullable().optional(),
  event: z.looseObject({ type: z.string() }).optional(),
});

interface SseEnv {
  readonly trpcUrl: string;
  readonly cookie: string;
}

interface SseEvent {
  readonly event: string | null;
  readonly id: string | null;
  readonly data: string;
}

function readEnv(): SseEnv {
  const port = processEnvValue(PORT_ENV) ?? String(DEV_PORTS.server);
  const base = processEnvValue("SSE_TAP_BASE") ?? `http://127.0.0.1:${port}`;
  const cookie = processEnvValue("SSE_TAP_COOKIE") ?? "";
  return { trpcUrl: `${base}/api/trpc`, cookie };
}

/** The headers both the attach and the connect carry: the CSRF header always, the operator's cookie when set. */
function requestHeaders(env: SseEnv): Record<string, string> {
  // biome-ignore lint/style/useNamingConvention: `Cookie` is the HTTP header's own spelling, not an identifier.
  return { [CSRF_HEADER]: "1", ...(env.cookie === "" ? {} : { Cookie: env.cookie }) };
}

function buildClient(env: SseEnv): ReturnType<typeof createTRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: env.trpcUrl, headers: () => requestHeaders(env) })] });
}

function parseEvent(block: string): SseEvent {
  let event: string | null = null;
  let id: string | null = null;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /u, "");
    if (field === "event") {
      event = value;
    } else if (field === "id") {
      id = value;
    } else if (field === "data") {
      data.push(value);
    }
  }
  return { event, id, data: data.join("\n") };
}

function printFrame(event: SseEvent): void {
  const ts = new Date().toISOString().slice(TS_START, TS_END);
  const raw: unknown = JSON.parse(event.data);
  // Narrow on the `__subscriptionError` sentinel before touching the frame, which only
  // real frames carry (see withSubscriptionErrors, transport/trpc/subscriptions.ts).
  if (isSubscriptionErrorFrame(raw)) {
    process.stdout.write(`${ts}  ord=${event.id ?? "-"}  ! socket-error  code=${raw.code}  ${raw.message}\n`);
    return;
  }
  const frame = frameSchema.parse(raw);
  if (frame.channel === "control") {
    process.stdout.write(`${ts}  ord=${event.id ?? "-"}  · ${frame.type ?? "-"}  ${event.data}\n`);
    return;
  }
  // The durable cursor rides the FRAME (§3.3 — the event id is a per-socket ordinal).
  process.stdout.write(`${ts}  seq=${frame.seq ?? "-"}  ${frame.event?.type ?? "-"}  ${JSON.stringify(frame.event)}\n`);
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

/** How a stream ended: its own `return` event, or a socket error carrying the server's detail. */
type StreamEnd = { readonly ended: "complete" } | { readonly ended: "error"; readonly detail: string };

// One event's effect: `null` keeps reading.
function dispatchEvent(event: SseEvent, onFrame: (event: SseEvent) => void): StreamEnd | null {
  if (event.event === RETURN_EVENT) {
    return { ended: "complete" };
  }
  if (event.event === ERROR_EVENT) {
    return { ended: "error", detail: event.data };
  }
  if (event.event === CONNECTED_EVENT) {
    process.stdout.write("· connection open\n");
  } else if (event.event !== PING_EVENT && event.data !== "") {
    onFrame(event);
  }
  return null;
}

/** Read the stream to its end. */
async function readStream(body: ReadableStream<Uint8Array>, onFrame: (event: SseEvent) => void): Promise<StreamEnd> {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of body) {
    buffered += decoder.decode(chunk, { stream: true }).replaceAll("\r\n", "\n");
    let end = buffered.indexOf(EVENT_SEPARATOR);
    while (end !== -1) {
      const outcome = dispatchEvent(parseEvent(buffered.slice(0, end)), onFrame);
      if (outcome !== null) {
        return outcome;
      }
      buffered = buffered.slice(end + EVENT_SEPARATOR.length);
      end = buffered.indexOf(EVENT_SEPARATOR);
    }
  }
  return { ended: "complete" };
}

export async function sseOp(argv: readonly string[]): Promise<number> {
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

  // Ctrl-C is the only abort source, so an aborted signal in the catch below means the operator stopped the tap.
  const connection = new AbortController();
  process.on("SIGINT", () => {
    connection.abort();
  });
  try {
    const response = await fetch(`${env.trpcUrl}/stream.connect`, {
      method: "POST",
      headers: { ...requestHeaders(env), "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ socketId }),
      signal: connection.signal,
    });
    if (!response.ok || response.body === null) {
      process.stderr.write(`! error: connect answered HTTP ${response.status}\n`);
      return reportFrames(frames, EXIT.violations);
    }
    const end = await readStream(response.body, (event) => {
      frames += 1;
      printFrame(event);
    });
    if (end.ended === "error") {
      process.stderr.write(`! error: ${end.detail}\n`);
      return reportFrames(frames, EXIT.violations);
    }
    process.stdout.write("· connection closed\n");
    return reportFrames(frames, EXIT.clean);
  } catch (error) {
    if (!connection.signal.aborted) {
      throw error;
    }
    process.stdout.write("\n· interrupted\n");
    return reportFrames(frames, EXIT.clean);
  }
}
