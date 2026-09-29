// infra/plugin-host/process-argv — closed argv boundary for the app-owned watchdog and broker children.

import type { NodeEnvironment } from "../../kit/node-environment.ts";
import { NODE_ENVIRONMENTS } from "../../kit/node-environment.ts";
import type { PluginBrokerArguments, PluginBrokerWatchdogArguments } from "./contract/process-protocol.ts";

const WATCHDOG_ARGUMENT_COUNT = 5;
const BROKER_ARGUMENT_COUNT = 4;
const SOCKET_PATH_INDEX = 0;
const TOKEN_PATH_INDEX = 1;
const WORKER_MAXIMUM_INDEX = 2;
const WATCHDOG_MEMORY_LIMIT_INDEX = 3;
const WATCHDOG_NODE_ENVIRONMENT_INDEX = 4;
const BROKER_NODE_ENVIRONMENT_INDEX = 3;

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

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return NODE_ENVIRONMENTS.some((environment) => environment === value);
}

function nodeEnvironment(arguments_: readonly string[], index: number): NodeEnvironment {
  const value = requiredArgument(arguments_, index, "node environment");
  if (!isNodeEnvironment(value)) {
    throw new Error("plugin broker: node environment is invalid");
  }
  return value;
}

function requireArgumentCount(arguments_: readonly string[], count: number): void {
  if (arguments_.length !== count) {
    throw new Error(`plugin broker: expected ${count} launch arguments`);
  }
}

export function parsePluginBrokerWatchdogArguments(arguments_: readonly string[]): PluginBrokerWatchdogArguments {
  requireArgumentCount(arguments_, WATCHDOG_ARGUMENT_COUNT);
  return {
    socketPath: requiredArgument(arguments_, SOCKET_PATH_INDEX, "socket path"),
    tokenPath: requiredArgument(arguments_, TOKEN_PATH_INDEX, "token path"),
    workerMaximum: positiveSafeInteger(arguments_, WORKER_MAXIMUM_INDEX, "worker maximum"),
    memoryLimitBytes: positiveSafeInteger(arguments_, WATCHDOG_MEMORY_LIMIT_INDEX, "memory limit"),
    nodeEnvironment: nodeEnvironment(arguments_, WATCHDOG_NODE_ENVIRONMENT_INDEX),
  };
}

export function parsePluginBrokerArguments(arguments_: readonly string[]): PluginBrokerArguments {
  requireArgumentCount(arguments_, BROKER_ARGUMENT_COUNT);
  return {
    socketPath: requiredArgument(arguments_, SOCKET_PATH_INDEX, "socket path"),
    tokenPath: requiredArgument(arguments_, TOKEN_PATH_INDEX, "token path"),
    workerMaximum: positiveSafeInteger(arguments_, WORKER_MAXIMUM_INDEX, "worker maximum"),
    nodeEnvironment: nodeEnvironment(arguments_, BROKER_NODE_ENVIRONMENT_INDEX),
  };
}
