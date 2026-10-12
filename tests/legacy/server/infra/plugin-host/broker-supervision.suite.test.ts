// @orb-waive-file no-test-fabrication([): baselined when the gate widened to value casts; burn-down item 906.

// The broker owns no listening endpoint; losing its inherited supervisor channel terminates it and its Workers.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { formatPluginBrokerArguments } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { pidAlive } from "@orb/tooling/floor/artifacts/run-retention";
import { afterEach } from "vitest";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const STUB_SUPERVISOR = `
const { spawn } = require("node:child_process");
const [entry, launch] = process.argv.slice(1);
const broker = spawn(process.execPath, [entry, ...JSON.parse(launch)], { stdio: ["ignore", "inherit", "inherit", "ipc"], env: { NODE_ENV: "test" } });
broker.on("message", (message) => {
  if (message.kind === "ready") {
    broker.send({ kind: "frame", generation: message.generation, frame: JSON.stringify({ kind: "command", id: "control", operation: "create", runtimeId: "runtime-supervised", authorityId: "authority-supervised", value: { mainJs: "'control';", grants: [], chat: null } }) });
  } else if (message.kind === "frame" && JSON.parse(message.frame).kind === "bridge") {
    const bridge = JSON.parse(message.frame);
    const values = { "seam.nowEpochMs": 0, "seam.nextRandom": 0.5, "seam.mintId": "id-supervised" };
    broker.send({ kind: "frame", generation: message.generation, frame: JSON.stringify({ kind: "bridge-result", id: bridge.id, ok: true, value: values[bridge.operation] }) });
  } else if (message.kind === "frame" && JSON.parse(message.frame).id === "control") {
    process.send({ brokerPid: broker.pid, response: JSON.parse(message.frame) });
  }
});
setInterval(() => undefined, 60_000);
`;
let supervisor: ChildProcess | undefined;
let brokerPid: number | undefined;
let directory: string | undefined;
afterEach(() => {
  supervisor?.kill("SIGKILL");
  if (brokerPid !== undefined) {
    try {
      process.kill(brokerPid, "SIGKILL");
    } catch {
      /* The subject is already gone. */
    }
  }
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("a broker with a live Worker exits when its inherited watchdog channel disappears", { timeout: 30_000 }, async () => {
  directory = mkdtempSync(join(tmpdir(), "orb-broker-supervision-"));
  // The watchdog's own launch arguments, handed to the stub so it starts the broker the way production does.
  const launch = formatPluginBrokerArguments({ directory, workerMaximum: 1, generation: "generation-supervised", nodeEnvironment: "test" });
  supervisor = spawn(process.execPath, ["-e", STUB_SUPERVISOR, BROKER_ENTRY, JSON.stringify(launch)], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const [message] = (await once(supervisor, "message")) as [
    { readonly brokerPid: number; readonly response: { readonly ok: boolean; readonly value: { readonly ok: boolean } } },
  ];
  brokerPid = message.brokerPid;
  expect(message.response).toMatchObject({ ok: true, value: { ok: true } });
  expect(pidAlive(brokerPid)).toBe(true);
  supervisor.kill("SIGKILL");
  await once(supervisor, "exit");
  while (pidAlive(brokerPid)) {
    await sleep(20);
  }
  expect(pidAlive(brokerPid)).toBe(false);
});
