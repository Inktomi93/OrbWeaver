import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pluginBrokerExecArgv } from "../../../../packages/server/src/infra/plugin-host/process-permission.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { runPluginBrokerPlatformProof } from "./_platform-proof.ts";

// The broker's one write grant names its private directory, which the proof cannot know in advance.
const BROKER_WRITE_GRANT = "--allow-fs-write=";

test("the app-owned broker process tree contains pressure and recovers across this platform", { timeout: 300_000 }, async () => {
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
  expect(receipt).toMatchObject({
    schemaVersion: 1,
    platform: process.platform,
    logicalPlugins: 100,
    configuredWorkerMaximum: 2,
    peakPhysicalWorkersAfterChurn: 2,
    pressureFailureName: "PluginHostUnavailable",
    recoveryValue: "recovered",
    brokerNodeOptions: null,
  });
  const brokerDirectory = receipt.brokerExecArgv.find((flag) => flag.startsWith(BROKER_WRITE_GRANT))?.slice(BROKER_WRITE_GRANT.length) ?? "";
  expect(receipt.brokerExecArgv).toEqual(pluginBrokerExecArgv(brokerDirectory));
  expect(receipt.watchdogObservedRssBytes).toBeGreaterThan(receipt.watchdogLimitBytes);
  expect(receipt.appBaselineRssBytes).toBeGreaterThan(0);
  expect(receipt.appRssBytesAfterChurn).toBeGreaterThan(0);
  expect(receipt.coldReloads).toBeGreaterThanOrEqual(98);
  expect(receipt.appDeathCleanupMs).toBeLessThan(10_000);

  if (output !== undefined) {
    await writeFile(resolve(output), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }
});
