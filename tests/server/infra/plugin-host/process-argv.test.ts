import { parsePluginBrokerArguments, parsePluginBrokerWatchdogArguments } from "../../../../packages/server/src/infra/plugin-host/process-argv.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("broker and watchdog accept only their closed inherited-channel launch arguments", () => {
  expect(parsePluginBrokerWatchdogArguments(["private", "4", "1073741824", "production"])).toEqual({
    directory: "private",
    workerMaximum: 4,
    memoryLimitBytes: 1_073_741_824,
    nodeEnvironment: "production",
  });
  expect(parsePluginBrokerArguments(["private", "4", "generation-private", "test"])).toEqual({
    directory: "private",
    workerMaximum: 4,
    generation: "generation-private",
    nodeEnvironment: "test",
  });
  expect(() => parsePluginBrokerWatchdogArguments(["private", "0", "1073741824", "production"])).toThrow(/positive integer/u);
  expect(() => parsePluginBrokerWatchdogArguments(["private", "4", "1e9", "production"])).toThrow(/positive integer/u);
  expect(() => parsePluginBrokerArguments(["private", "4", "generation-private", "staging"])).toThrow(/node environment/u);
  expect(() => parsePluginBrokerArguments(["private", "4", "", "test"])).toThrow(/generation/u);
  expect(() => parsePluginBrokerArguments(["private", "4", "generation-private", "test", "extra"])).toThrow(/expected/u);
});
