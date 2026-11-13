// The real server entry booted as a child process: signal-driven shutdown, and the boot's own egress firewall install.
// A preload observer reports from inside the process over IPC and replaces no product code.
// @subject packages/server/src/entry/lifecycle.ts

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { ENV_NO_FILE_KEY } from "@orb/kit/env-file";
import { SHUTDOWN_MESSAGES } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node";
import { servePhysicalPeer } from "@orb/testkit/node/composed";
import { freeLoopbackPort } from "@orb/testkit/node/helpers";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { onTestFinished } from "vitest";
import { z } from "zod";
import type { BOOT_DISCLAIMER_TOPICS } from "#server/entry/boot/disclaimer.ts";
import { SSRF_BLOCKED } from "#server/infra/network/contract/egress.ts";

const SERVER_ENTRY = fileURLToPath(new URL("../../../packages/server/src/entry/index.ts", import.meta.url));
const LISTENING = '"msg":"boot: listening — healthz live"';

/** A message as the server's JSON log line spells it. */
const logged = (message: string): string => `"msg":${JSON.stringify(message)}`;

// A post-handler event-loop receipt observes delivery without replacing the product's signal handler.
const SIGNAL_OBSERVER = `let received = 0;
process.on("SIGTERM", () => {
  const signal = ++received;
  setImmediate(() => process.send?.({ signal }));
});`;

// A bare platform fetch from inside the booted process, run only when the test asks, so it starts after boot.
const FETCH_OBSERVER = `process.on("message", (message) => {
  if (typeof message?.fetch !== "string") return;
  const url = message.fetch;
  fetch(url).then(
    async (response) => {
      await response.arrayBuffer();
      process.send?.({ url, status: response.status });
    },
    (error) => process.send?.({ url, refusal: String(error?.cause?.message ?? error) }),
  );
});`;

const fetchReplySchema = z.object({ url: z.string(), status: z.number().optional(), refusal: z.string().optional() });

interface Exit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface ServerChild {
  readonly child: ChildProcess;
  readonly output: () => string;
  readonly listening: Promise<void>;
  readonly exited: Promise<Exit>;
  readonly closed: Promise<unknown>;
  /** Kill the process if it still runs, then wait for it and its stdio to close. */
  readonly stop: () => Promise<void>;
}

/** Boot the real server entry with `observer` preloaded and `env` laid over the shared boot posture. */
function spawnServer(observer: string, dataDir: string, port: number, env: Readonly<Record<string, string>> = {}): ServerChild {
  const child = spawn(process.execPath, [`--import=data:text/javascript,${encodeURIComponent(observer)}`, SERVER_ENTRY], {
    env: {
      ["PATH"]: processEnvValue("PATH"),
      ["HOME"]: processEnvValue("HOME"),
      [ENV_NO_FILE_KEY]: "1",
      ["DATA_DIR"]: dataDir,
      ["PORT"]: String(port),
      [AUTH_MODE_KEY]: "single-user",
      ["LOCAL_LIGHT_PREFETCH"]: "off",
      ["CORPUS_AUTOINDEX"]: "false",
      ["EGRESS_FIREWALL"]: "false",
      ["LOG_LEVEL"]: "info",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  const listening = Promise.withResolvers<void>();
  const exited = new Promise<Exit>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const closed = once(child, "close");
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes(LISTENING)) {
      listening.resolve();
    }
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  return {
    child,
    output: () => output,
    listening: listening.promise,
    exited,
    closed,
    stop: async (): Promise<void> => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      await exited;
      await closed;
    },
  };
}

test("concurrent shutdown signals join the held native HTTP drain", { tags: "slow" }, async ({ importStagingDir }) => {
  const port = await freeLoopbackPort();
  const server = spawnServer(SIGNAL_OBSERVER, importStagingDir, port);
  const receipts = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  server.child.on("message", (message: unknown) => {
    if (typeof message === "object" && message !== null && "signal" in message && typeof message.signal === "number") {
      receipts[message.signal - 1]?.resolve();
    }
  });
  await using resources = new AsyncDisposableStack();
  resources.defer(server.stop);
  onTestFinished(() => resources.disposeAsync());
  expect(await Promise.race([server.listening.then(() => "listening"), server.exited.then(() => "exited")]), server.output()).toBe("listening");
  const socket = connect({ host: "127.0.0.1", port });
  const socketErrors: Error[] = [];
  socket.on("error", (error) => socketErrors.push(error));
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  const accepted = Promise.withResolvers<void>();
  let response = "";
  socket.on("data", (chunk: Buffer) => {
    response += chunk.toString();
    if (response.includes("HTTP/1.1 100 Continue\r\n\r\n")) {
      accepted.resolve();
    }
  });
  resources.defer(async () => {
    socket.destroy();
    await closed;
  });
  await once(socket, "connect");
  await new Promise<void>((resolve, reject) => {
    socket.write(
      `POST /api/trpc/character.create HTTP/1.1\r\nHost: localhost\r\n${CSRF_HEADER}: 1\r\nContent-Type: application/json\r\nContent-Length: 128\r\nExpect: 100-continue\r\n\r\n{`,
      (error) => (error ? reject(error) : resolve()),
    );
  });
  expect(await Promise.race([accepted.promise.then(() => "accepted"), closed.then(() => "closed")]), response).toBe("accepted");
  for (const [index, receipt] of receipts.entries()) {
    server.child.kill("SIGTERM");
    expect(
      await Promise.race([receipt.promise.then(() => "held"), server.exited.then(() => "exited")]),
      `SIGTERM ${String(index + 1)}:\n${server.output()}`,
    ).toBe("held");
    expect(server.output(), `SIGTERM ${String(index + 1)} must retain the active request`).not.toContain(logged(SHUTDOWN_MESSAGES.httpDrained));
  }
  expect(socketErrors).toEqual([]);
  expect(server.output()).toContain(logged(SHUTDOWN_MESSAGES.draining));
  expect(server.output()).not.toContain(logged(SHUTDOWN_MESSAGES.complete));
  socket.destroy();
  await closed;
  const exit = await server.exited;
  await server.closed;
  expect(exit, server.output()).toEqual({ code: 0, signal: null });
  // The stage breadcrumbs `down` reads off the log: each one a real shutdown emits after the request is released.
  for (const stage of [SHUTDOWN_MESSAGES.httpDrained, SHUTDOWN_MESSAGES.closingServices, SHUTDOWN_MESSAGES.dbHousekeeping, SHUTDOWN_MESSAGES.complete]) {
    expect(server.output()).toContain(logged(stage));
  }
});

// An allowlist entry whose port no parser can read admits nothing; boot names it beside the entry that still applies. A
// pasted URL's credentials never reach the log, in the warning or anywhere else.
const UNREADABLE_ALLOWLIST_ENTRY = "proxy.lan:not-a-port";
const ALLOWLIST_SECRET = "hunter2-secret";
const CREDENTIALED_ALLOWLIST_ENTRY = `http://orb:${ALLOWLIST_SECRET}@proxy.lan:not-a-port`;
const EXPOSURE_TOPIC = "exposure" satisfies (typeof BOOT_DISCLAIMER_TOPICS)[number];
const allowlistWarningSchema = z.object({
  bootDisclaimer: z.literal(true),
  topic: z.literal(EXPOSURE_TOPIC),
  entry: z.string(),
  position: z.number(),
});

/** The boot disclaimer's allowlist warnings, as their structured fields on the server's JSON log lines. */
function allowlistWarnings(output: string): readonly { readonly entry: string; readonly position: number }[] {
  return output
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .flatMap((line) => {
      const parsed = allowlistWarningSchema.safeParse(JSON.parse(line));
      return parsed.success ? [{ entry: parsed.data.entry, position: parsed.data.position }] : [];
    });
}

test("the booted server's egress firewall refuses a bare fetch to an unlisted loopback peer and still reaches an allowlisted one", {
  tags: "slow",
}, async ({ importStagingDir }) => {
  const received: string[] = [];
  await using refused = await servePhysicalPeer((request) => {
    received.push(`refused ${new URL(request.url).pathname}`);
    return Promise.resolve(new Response("ok"));
  });
  await using admitted = await servePhysicalPeer((request) => {
    received.push(`admitted ${new URL(request.url).pathname}`);
    return Promise.resolve(new Response("ok"));
  });
  const server = spawnServer(FETCH_OBSERVER, importStagingDir, await freeLoopbackPort(), {
    ["EGRESS_FIREWALL"]: "true",
    ["EGRESS_ALLOWLIST"]: `${new URL(admitted.origin).host}, ${UNREADABLE_ALLOWLIST_ENTRY}, ${CREDENTIALED_ALLOWLIST_ENTRY}`,
  });
  await using resources = new AsyncDisposableStack();
  resources.defer(server.stop);
  expect(await Promise.race([server.listening.then(() => "listening"), server.exited.then(() => "exited")]), server.output()).toBe("listening");
  // Boot names each dead entry once, by its structured fields, and never the admitted host.
  expect(allowlistWarnings(server.output())).toEqual([
    { entry: UNREADABLE_ALLOWLIST_ENTRY, position: 2 },
    { entry: "http://proxy.lan:not-a-port", position: 3 },
  ]);
  expect(server.output()).not.toContain(ALLOWLIST_SECRET);

  const fetchInside = async (url: string): Promise<z.infer<typeof fetchReplySchema>> => {
    const reply = Promise.withResolvers<z.infer<typeof fetchReplySchema>>();
    const onMessage = (message: unknown): void => {
      const parsed = fetchReplySchema.safeParse(message);
      if (parsed.success && parsed.data.url === url) {
        reply.resolve(parsed.data);
      }
    };
    server.child.on("message", onMessage);
    try {
      server.child.send({ fetch: url });
      return await Promise.race([
        reply.promise,
        server.exited.then((exit) => Promise.reject(new Error(`the server exited (${JSON.stringify(exit)}) before answering ${url}:\n${server.output()}`))),
      ]);
    } finally {
      server.child.off("message", onMessage);
    }
  };

  const refusedUrl = `${refused.origin}/boot`;
  expect(await fetchInside(refusedUrl)).toEqual({ url: refusedUrl, refusal: expect.stringContaining(SSRF_BLOCKED) });
  // Positive control in the same process: the dispatcher boot installed still dials the allowlisted peer.
  const admittedUrl = `${admitted.origin}/boot`;
  expect(await fetchInside(admittedUrl)).toEqual({ url: admittedUrl, status: 200 });
  expect(received).toEqual(["admitted /boot"]);
});
