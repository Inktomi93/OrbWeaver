// A plugin broker whose watchdog dies serves no further work: the app connection it already holds gets no
// response, a new connection is refused, and the orphan exits. A stub parent stands in for the watchdog so
// the test can kill the supervisor without the app-side teardown that would otherwise close the socket first.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Socket } from "node:net";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import {
  PLUGIN_BROKER_PROTOCOL_VERSION,
  parseBrokerParentMessage,
  parseMessageLine,
  serializeMessage,
} from "../../../../packages/server/src/infra/plugin-host/process-protocol.ts";
import { expect, test } from "../../../support/fixtures.ts";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const POLL_MS = 20;
// The stub is the broker's IPC parent, exactly as the watchdog is, and reports the broker pid once it spawns.
const STUB_SUPERVISOR = `
const { spawn } = require("node:child_process");
const [entry, ...args] = process.argv.slice(1);
const broker = spawn(process.execPath, [entry, ...args], { stdio: ["ignore", "inherit", "inherit", "ipc"], env: { NODE_ENV: "test" } });
broker.on("message", () => undefined);
broker.once("spawn", () => process.send({ brokerPid: broker.pid }));
setInterval(() => undefined, 60_000);
`;

interface BrokerFixture {
  readonly directory: string;
  readonly socketPath: string;
  readonly token: string;
  readonly supervisor: ChildProcess;
  readonly brokerPid: number;
}

let fixture: BrokerFixture | undefined;

afterEach(() => {
  if (fixture === undefined) {
    return;
  }
  fixture.supervisor.kill("SIGKILL");
  try {
    process.kill(fixture.brokerPid, "SIGKILL");
  } catch {
    // Already gone: the case under test.
  }
  rmSync(fixture.directory, { recursive: true, force: true });
  fixture = undefined;
});

async function startSupervisedBroker(): Promise<BrokerFixture> {
  const directory = mkdtempSync(join(tmpdir(), "orb-broker-supervision-"));
  const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\orb-broker-supervision-${randomUUID()}` : join(directory, "broker.sock");
  const tokenPath = join(directory, "token");
  const token = randomBytes(32).toString("base64url");
  writeFileSync(tokenPath, token, { mode: 0o600, flag: "wx" });
  const supervisor = spawn(process.execPath, ["-e", STUB_SUPERVISOR, BROKER_ENTRY, socketPath, tokenPath, "1", "test"], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const [message] = (await once(supervisor, "message")) as [{ readonly brokerPid: number }];
  return { directory, socketPath, token, supervisor, brokerPid: message.brokerPid };
}

interface Connection {
  readonly socket: Socket;
  readonly messages: unknown[];
  readonly closed: Promise<void>;
}

function open(socketPath: string): Connection {
  const socket = connect(socketPath);
  const messages: unknown[] = [];
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("error", () => undefined);
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      messages.push(parseBrokerParentMessage(parseMessageLine(buffer.slice(0, newline))));
      buffer = buffer.slice(newline + 1);
    }
  });
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  return { socket, messages, closed };
}

async function authenticate(socketPath: string, token: string): Promise<Connection | null> {
  const connection = open(socketPath);
  connection.socket.write(serializeMessage({ kind: "authenticate", version: PLUGIN_BROKER_PROTOCOL_VERSION, token }));
  const authenticated = new Promise<boolean>((resolve) => {
    connection.socket.on("data", () => {
      if (connection.messages.some((message) => (message as { readonly kind?: string } | null)?.kind === "authenticated")) {
        resolve(true);
      }
    });
  });
  return (await Promise.race([authenticated, connection.closed.then(() => false)])) ? connection : null;
}

async function authenticateWhenListening(socketPath: string, token: string): Promise<Connection> {
  for (;;) {
    const connection = await authenticate(socketPath, token);
    if (connection !== null) {
      return connection;
    }
    await sleep(POLL_MS);
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("a broker whose watchdog dies answers no further command, refuses a new connection and exits", { timeout: 30_000 }, async () => {
  fixture = await startSupervisedBroker();
  const app = await authenticateWhenListening(fixture.socketPath, fixture.token);

  fixture.supervisor.kill("SIGKILL");
  await once(fixture.supervisor, "exit");

  const commandId = randomUUID();
  app.socket.write(serializeMessage({ kind: "command", id: commandId, operation: "dispose", runtimeId: randomUUID(), authorityId: randomUUID(), value: null }));
  const answered = new Promise<"answered">((resolve) => {
    app.socket.on("data", () => {
      if (app.messages.some((message) => (message as { readonly id?: string } | null)?.id === commandId)) {
        resolve("answered");
      }
    });
  });
  expect(await Promise.race([answered, app.closed.then(() => "closed" as const)])).toBe("closed");

  expect(await authenticate(fixture.socketPath, fixture.token)).toBeNull();

  while (isAlive(fixture.brokerPid)) {
    await sleep(POLL_MS);
  }
});
