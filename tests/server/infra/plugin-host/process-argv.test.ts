// @subject packages/server/src/infra/plugin-host/process-argv.ts
// The broker and watchdog launch is a strict five-argument vector: any other shape throws before it is used.
import { LOG_LEVELS } from "@orb/contracts/settings";
import { formatPluginBrokerArguments, parsePluginBrokerArguments, parsePluginBrokerWatchdogArguments } from "@orb/server/infra/plugin-host/process-argv";
import { expect, test } from "@orb/testkit/node";

const VALID = ["/run/orb/plugins", "4", "generation-1", "production", "info"] as const;
const WATCHDOG_VALID = ["/run/orb/plugins", "4", "268435456", "production", "info"] as const;

test("a valid broker vector parses and formatting the result gives the same vector back", () => {
  const parsed = parsePluginBrokerArguments([...VALID]);

  expect(parsed).toEqual({ directory: "/run/orb/plugins", workerMaximum: 4, generation: "generation-1", nodeEnvironment: "production", logLevel: "info" });
  expect(formatPluginBrokerArguments(parsed)).toEqual([...VALID]);
});

test("every LOG_LEVELS member is accepted at the log level position", () => {
  for (const level of LOG_LEVELS) {
    expect(parsePluginBrokerArguments([...VALID.slice(0, 4), level]).logLevel).toBe(level);
  }
});

test("a valid watchdog vector parses", () => {
  expect(parsePluginBrokerWatchdogArguments([...WATCHDOG_VALID])).toEqual({
    directory: "/run/orb/plugins",
    workerMaximum: 4,
    memoryLimitBytes: 268_435_456,
    nodeEnvironment: "production",
    logLevel: "info",
  });
});

test.each([
  ["four arguments", VALID.slice(0, 4)],
  ["six arguments", [...VALID, "extra"]],
  ["an empty vector", []],
])("%s are refused by both parsers", (_label, vector) => {
  expect(() => parsePluginBrokerArguments(vector)).toThrow("expected 5 launch arguments");
  expect(() => parsePluginBrokerWatchdogArguments(vector)).toThrow("expected 5 launch arguments");
});

test.each(["verbose", "INFO", "constructor", ""])("log level %j is refused by both parsers", (level) => {
  expect(() => parsePluginBrokerArguments([...VALID.slice(0, 4), level])).toThrow(/log level/u);
  expect(() => parsePluginBrokerWatchdogArguments([...WATCHDOG_VALID.slice(0, 4), level])).toThrow(/log level/u);
});

test("swapped node environment and log level positions are refused", () => {
  const swapped = [VALID[0], VALID[1], VALID[2], VALID[4], VALID[3]];

  expect(() => parsePluginBrokerArguments(swapped)).toThrow("node environment is invalid");
});
