import { parsePluginBrokerArguments, parsePluginBrokerWatchdogArguments } from "../../../../packages/server/src/infra/plugin-host/process-argv.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("the child-process argv boundary accepts only complete positive launch configuration", () => {
  expect(parsePluginBrokerWatchdogArguments(["socket", "token", "4", "1073741824", "production"])).toEqual({
    socketPath: "socket",
    tokenPath: "token",
    workerMaximum: 4,
    memoryLimitBytes: 1_073_741_824,
    nodeEnvironment: "production",
  });
  expect(parsePluginBrokerArguments(["socket", "token", "4", "test"])).toEqual({
    socketPath: "socket",
    tokenPath: "token",
    workerMaximum: 4,
    nodeEnvironment: "test",
  });

  expect(() => parsePluginBrokerWatchdogArguments(["socket", "token", "0", "1073741824", "production"])).toThrow(/positive integer/u);
  expect(() => parsePluginBrokerWatchdogArguments(["socket", "token", "4", "1e9", "production"])).toThrow(/positive integer/u);
  expect(() => parsePluginBrokerArguments(["socket", "token", "4", "staging"])).toThrow(/node environment/u);
});
