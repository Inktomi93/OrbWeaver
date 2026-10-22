import { spawn } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { freeLoopbackPort } from "@orb/testkit/node/free-port.ts";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { onTestFinished } from "vitest";

// A post-handler event-loop receipt observes delivery without replacing the product's signal handler.
const SIGNAL_OBSERVER = `let received = 0;
process.on("SIGTERM", () => {
  const signal = ++received;
  setImmediate(() => process.send?.({ signal }));
});`;

test("concurrent shutdown signals join the held native HTTP drain", { tags: "slow" }, async ({ importStagingDir }) => {
  const port = await freeLoopbackPort();
  const child = spawn(
    process.execPath,
    [
      `--import=data:text/javascript,${encodeURIComponent(SIGNAL_OBSERVER)}`,
      fileURLToPath(new URL("../../../packages/server/src/entry/index.ts", import.meta.url)),
    ],
    {
      env: {
        ["PATH"]: processEnvValue("PATH"),
        ["HOME"]: processEnvValue("HOME"),
        ["ORB_ENV_NO_FILE"]: "1",
        ["DATA_DIR"]: importStagingDir,
        ["PORT"]: String(port),
        ["AUTH_MODE"]: "single-user",
        ["LOCAL_LIGHT_PREFETCH"]: "off",
        ["CORPUS_AUTOINDEX"]: "false",
        ["EGRESS_FIREWALL"]: "false",
        ["LOG_LEVEL"]: "info",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let output = "";
  const listening = Promise.withResolvers<void>();
  const receipts = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const exited = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const processClosed = once(child, "close");
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes('"msg":"boot: listening — healthz live"')) {
      listening.resolve();
    }
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  child.on("message", (message: unknown) => {
    if (typeof message === "object" && message !== null && "signal" in message && typeof message.signal === "number") {
      receipts[message.signal - 1]?.resolve();
    }
  });
  await using resources = new AsyncDisposableStack();
  resources.defer(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    await exited;
    await processClosed;
  });
  onTestFinished(() => resources.disposeAsync());
  expect(await Promise.race([listening.promise.then(() => "listening"), exited.then(() => "exited")]), output).toBe("listening");
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
    child.kill("SIGTERM");
    expect(await Promise.race([receipt.promise.then(() => "held"), exited.then(() => "exited")]), `SIGTERM ${String(index + 1)}:\n${output}`).toBe("held");
    expect(output, `SIGTERM ${String(index + 1)} must retain the active request`).not.toContain('"msg":"shutdown: http drained"');
  }
  expect(socketErrors).toEqual([]);
  expect(output).toContain('"msg":"shutdown: draining"');
  expect(output).not.toContain('"msg":"shutdown: complete"');
  socket.destroy();
  await closed;
  const exit = await exited;
  await processClosed;
  expect(exit, output).toEqual({ code: 0, signal: null });
  expect(output).toContain('"msg":"shutdown: complete"');
});
