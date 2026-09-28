import {
  PLUGIN_BROKER_DEFAULT_WORKER_MAX,
  PLUGIN_BROKER_WORKER_MAX_ENV,
  resolvePluginBrokerWorkerMaximum,
} from "../../../../packages/server/src/infra/plugin-host/worker-capacity.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("the physical Worker ceiling has a finite default and accepts only positive overrides", () => {
  expect(resolvePluginBrokerWorkerMaximum({})).toBe(PLUGIN_BROKER_DEFAULT_WORKER_MAX);
  expect(() => resolvePluginBrokerWorkerMaximum({ [PLUGIN_BROKER_WORKER_MAX_ENV]: "0" })).toThrow(/positive integer/u);
  expect(resolvePluginBrokerWorkerMaximum({ [PLUGIN_BROKER_WORKER_MAX_ENV]: "12" })).toBe(12);
});

test("the default does not depend on enabled logical count", () => {
  expect(resolvePluginBrokerWorkerMaximum({})).toBe(PLUGIN_BROKER_DEFAULT_WORKER_MAX);
});
