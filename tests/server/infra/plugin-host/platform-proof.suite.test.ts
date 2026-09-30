import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pluginBrokerExecArgv } from "../../../../packages/server/src/infra/plugin-host/process-permission.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { runPluginBrokerPlatformProof } from "./_platform-proof.ts";

const PROOF_TIMEOUT_MS = 600_000;
const MAX_WINDOWS_DEADLINE_FRACTION = 0.7;

test("the app-owned broker process tree contains pressure and recovers across this platform", { timeout: PROOF_TIMEOUT_MS }, async () => {
  const result = await Promise.allSettled([runPluginBrokerPlatformProof()]);
  // biome-ignore lint/style/noProcessEnv: the workflow supplies this proof's receipt destination through the runner environment.
  const output = process.env["PLUGIN_BROKER_PROOF_RECEIPT"];
  const settled = result[0];
  if (settled === undefined) {
    throw new Error("plugin platform proof: proof result was absent");
  }
  if (settled.status !== "fulfilled") {
    if (output !== undefined) {
      await writeFile(
        resolve(output),
        `${JSON.stringify({ schemaVersion: 1, platform: process.platform, error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) }, null, 2)}\n`,
        "utf8",
      );
    }
    throw settled.reason;
  }
  const receipt = settled.value;
  if (output !== undefined) {
    await writeFile(resolve(output), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }
  expect(receipt).toMatchObject({
    schemaVersion: 1,
    platform: process.platform,
    endpointKind: "inherited-ipc",
    logicalPlugins: 100,
    configuredWorkerMaximum: 2,
    peakPhysicalWorkersAfterChurn: 2,
    pressureFailureName: "PluginHostUnavailable",
    recoveryValue: "recovered",
    brokerNodeOptions: null,
  });
  expect(receipt.brokerExecArgv).toEqual(pluginBrokerExecArgv());
  const deadlineFraction = process.platform === "win32" ? MAX_WINDOWS_DEADLINE_FRACTION : 1;
  expect(receipt.longestChildWaitMs).toBeLessThanOrEqual(receipt.childTimeoutMs * deadlineFraction);
  expect(receipt.elapsedMs).toBeLessThanOrEqual(PROOF_TIMEOUT_MS * deadlineFraction);
  expect(receipt.watchdogObservedRssBytes).toBeGreaterThan(receipt.watchdogLimitBytes);
  expect(receipt.appBaselineRssBytes).toBeGreaterThan(0);
  expect(receipt.appRssBytesAfterChurn).toBeGreaterThan(0);
  expect(receipt.coldReloads).toBeGreaterThanOrEqual(98);
  expect(receipt.appDeathCleanupMs).toBeLessThan(10_000);
});
