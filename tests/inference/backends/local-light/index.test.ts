// The local-light composition root's detached-work owner. A span implementation can throw before returning
// its Promise (the production tracer resolves a process-global tracer first); that synchronous failure must
// reach the same warning owner as an asynchronous detached rejection, never escape prefetch.start().

import { createLocalLightBackend } from "../../../../packages/inference/src/backends/local-light/index.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeModelCache } from "../../_support.ts";

function recordingLog(warnings: { fields: Readonly<Record<string, unknown>>; message: string }[]): InferenceLog {
  const noop: InferenceLog["info"] = (): void => undefined;
  return {
    debug: noop,
    info: noop,
    error: noop,
    warn: (fields, message): void => {
      warnings.push({ fields, message });
    },
  };
}

test("detached prefetch enters through the injected supervisor", async () => {
  const warnings: { fields: Readonly<Record<string, unknown>>; message: string }[] = [];
  const supervised: string[] = [];
  const local = createLocalLightBackend({
    now: () => 1_700_000_000_000,
    log: recordingLog(warnings),
    superviseDetached: (name, _attrs, operation): void => {
      supervised.push(name);
      Promise.resolve()
        .then(operation)
        .catch(() => undefined);
    },
    config: { cache: fakeModelCache() },
  });

  expect(() => local.prefetch.start([{ slot: "embed", modelId: "local/test" }])).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();

  expect(supervised).toEqual(["local-light.prefetch.walk"]);
  expect(warnings).toEqual([]);
});
