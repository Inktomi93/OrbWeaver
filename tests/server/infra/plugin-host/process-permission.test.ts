// A real plugin broker, started with the flags the watchdog gives it, cannot read the data dir, the `.env` file or
// another process's environment, from its main thread or a Worker, and cannot spawn, yet reads its code and token
// and serves its socket. A preloaded probe makes the attempts from inside the broker process.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { pluginBrokerExecArgv } from "../../../../packages/server/src/infra/plugin-host/process-permission.ts";
import { PLUGIN_BROKER_PROTOCOL_VERSION, parseMessageLine, serializeMessage } from "../../../../packages/server/src/infra/plugin-host/process-protocol.ts";
import { expect, test } from "../../../support/fixtures.ts";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const PROBE = fileURLToPath(new URL("./_broker-permission-probe.ts", import.meta.url));
const WORKSPACE_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const DENIED = "ERR_ACCESS_DENIED";
const PRIVATE_FILE_MODE = 0o600;

interface ProbeReport {
  readonly kind: "permission-probe";
  readonly reads: Readonly<Record<string, string>>;
  readonly workerReads: Readonly<Record<string, string>>;
  readonly spawn: string;
}

let broker: ChildProcess | undefined;
let directory: string | undefined;

afterEach(async () => {
  if (broker !== undefined && broker.exitCode === null) {
    broker.kill("SIGKILL");
    await once(broker, "exit");
  }
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true });
  }
  broker = undefined;
  directory = undefined;
});

function isProbeReport(message: unknown): message is ProbeReport {
  return typeof message === "object" && message !== null && Reflect.get(message, "kind") === "permission-probe";
}

async function authenticates(socketPath: string, token: string): Promise<boolean> {
  for (;;) {
    const socket = connect(socketPath);
    // The broker binds its socket after the probe reports, so the first attempts may find nothing listening.
    const opened = await new Promise<boolean>((resolve) => {
      socket.once("connect", () => resolve(true));
      socket.once("error", () => resolve(false));
    });
    if (!opened) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    socket.setEncoding("utf8");
    socket.write(serializeMessage({ kind: "authenticate", version: PLUGIN_BROKER_PROTOCOL_VERSION, token }));
    const [line] = (await once(socket, "data")) as [string];
    socket.destroy();
    return Reflect.get(parseMessageLine(line.split("\n")[0] ?? "") as object, "kind") === "authenticated";
  }
}

test("a broker under its permission flags is denied the data dir, .env and process environments, and still serves", { timeout: 30_000 }, async () => {
  directory = mkdtempSync(join(tmpdir(), "orb-broker-permission-"));
  const brokerDirectory = join(directory, "broker");
  mkdirSync(brokerDirectory, { mode: 0o700 });
  const socketPath = join(brokerDirectory, "broker.sock");
  const tokenPath = join(brokerDirectory, "token");
  const token = randomBytes(32).toString("base64url");
  writeFileSync(tokenPath, token, { mode: PRIVATE_FILE_MODE, flag: "wx" });
  const dataKey = join(directory, "data", "secrets", "credentials_key");
  mkdirSync(join(directory, "data", "secrets"), { recursive: true });
  writeFileSync(dataKey, randomBytes(32).toString("hex"), { mode: PRIVATE_FILE_MODE });

  const denied = [
    dataKey,
    join(WORKSPACE_ROOT, "data", "secrets", "credentials_key"),
    // The root manifest exists in every checkout, so a Worker that could read the workspace root gets bytes here.
    join(WORKSPACE_ROOT, "package.json"),
    join(WORKSPACE_ROOT, ".env"),
    ...(process.platform === "linux" ? [`/proc/${process.pid}/environ`] : []),
  ];
  const allowed = [tokenPath, join(WORKSPACE_ROOT, "packages", "server", "package.json")];
  // A preload is not granted the way the entry point is, so the probe file alone is added to the reads.
  const probeArgv = [`--allow-fs-read=${PROBE}`, `--import=${PROBE}`];
  broker = spawn(process.execPath, [...pluginBrokerExecArgv(brokerDirectory), ...probeArgv, BROKER_ENTRY, socketPath, tokenPath, "1", "test"], {
    // The watchdog starts the broker in its private directory; process-runtime.test.ts pins that on the live broker.
    cwd: brokerDirectory,
    // biome-ignore lint/style/useNamingConvention: environment variable names are fixed upper-case keys.
    env: { NODE_ENV: "test", ORB_BROKER_PROBE_READS: JSON.stringify([...denied, ...allowed]) },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const report = await new Promise<ProbeReport>((resolve, reject) => {
    broker?.on("message", (message: unknown) => {
      if (isProbeReport(message)) {
        resolve(message);
      }
    });
    broker?.once("exit", (code) => reject(new Error(`test: broker exited before its probe reported (${String(code)})`)));
  });

  for (const reads of [report.reads, report.workerReads]) {
    expect(Object.fromEntries(denied.map((path) => [path, reads[path]]))).toEqual(Object.fromEntries(denied.map((path) => [path, DENIED])));
    expect(Object.fromEntries(allowed.map((path) => [path, reads[path]]))).toEqual(Object.fromEntries(allowed.map((path) => [path, "allowed"])));
  }
  expect(report.spawn).toBe(DENIED);
  expect(await authenticates(socketPath, token)).toBe(true);
});
