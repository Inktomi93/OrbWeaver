import type { LogLevel } from "@orb/contracts/settings";
import { LOG_LEVELS } from "@orb/contracts/settings";
import type { NodeEnvironment } from "#primitives/node-environment";
import { NODE_ENVIRONMENTS } from "#primitives/node-environment";
import type { PluginBrokerArguments, PluginBrokerWatchdogArguments } from "./contract/process-protocol.ts";

const ARGUMENT_COUNT = 5;
const NODE_ENVIRONMENT_INDEX = 3;
const LOG_LEVEL_INDEX = 4;
function requiredArgument(arguments_: readonly string[], index: number, label: string): string {
  const value = arguments_[index];
  if (value === undefined || value.length === 0) {
    throw new Error(`plugin broker: ${label} is required`);
  }
  return value;
}
function positiveSafeInteger(arguments_: readonly string[], index: number, label: string): number {
  const raw = requiredArgument(arguments_, index, label);
  if (!(/^[1-9]\d*$/u.test(raw) && Number.isSafeInteger(Number(raw)))) {
    throw new Error(`plugin broker: ${label} must be a safe positive integer`);
  }
  return Number(raw);
}
function nodeEnvironment(arguments_: readonly string[], index: number): NodeEnvironment {
  const value = requiredArgument(arguments_, index, "node environment");
  const environment = NODE_ENVIRONMENTS.find((candidate) => candidate === value);
  if (environment === undefined) {
    throw new Error("plugin broker: node environment is invalid");
  }
  return environment;
}
function logLevel(arguments_: readonly string[], index: number): LogLevel {
  const value = requiredArgument(arguments_, index, "log level");
  const level = LOG_LEVELS.find((candidate) => candidate === value);
  if (level === undefined) {
    throw new Error("plugin broker: log level is invalid");
  }
  return level;
}
function requireArgumentCount(arguments_: readonly string[]): void {
  if (arguments_.length !== ARGUMENT_COUNT) {
    throw new Error(`plugin broker: expected ${ARGUMENT_COUNT} launch arguments`);
  }
}
/** Parse the app's watchdog launch without inheriting app environment or authority. */
export function parsePluginBrokerWatchdogArguments(arguments_: readonly string[]): PluginBrokerWatchdogArguments {
  requireArgumentCount(arguments_);
  return {
    directory: requiredArgument(arguments_, 0, "private directory"),
    workerMaximum: positiveSafeInteger(arguments_, 1, "worker maximum"),
    memoryLimitBytes: positiveSafeInteger(arguments_, 2, "memory limit"),
    nodeEnvironment: nodeEnvironment(arguments_, NODE_ENVIRONMENT_INDEX),
    logLevel: logLevel(arguments_, LOG_LEVEL_INDEX),
  };
}
/** The watchdog's broker launch arguments, in the order {@link parsePluginBrokerArguments} reads them. */
export function formatPluginBrokerArguments(args: PluginBrokerArguments): string[] {
  return [args.directory, String(args.workerMaximum), args.generation, args.nodeEnvironment, args.logLevel];
}
/** Parse the watchdog's broker launch, including its new transport generation. */
export function parsePluginBrokerArguments(arguments_: readonly string[]): PluginBrokerArguments {
  requireArgumentCount(arguments_);
  return {
    directory: requiredArgument(arguments_, 0, "private directory"),
    workerMaximum: positiveSafeInteger(arguments_, 1, "worker maximum"),
    generation: requiredArgument(arguments_, 2, "broker generation"),
    nodeEnvironment: nodeEnvironment(arguments_, NODE_ENVIRONMENT_INDEX),
    logLevel: logLevel(arguments_, LOG_LEVEL_INDEX),
  };
}
