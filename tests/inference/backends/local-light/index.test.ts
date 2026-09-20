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

test("detached work warning-owns a synchronous span failure", async () => {
  const warnings: { fields: Readonly<Record<string, unknown>>; message: string }[] = [];
  const failure = new Error("tracer unavailable");
  const local = createLocalLightBackend({
    now: () => 1_700_000_000_000,
    log: recordingLog(warnings),
    span: () => {
      throw failure;
    },
    config: { cache: fakeModelCache() },
  });

  expect(() => local.prefetch.start([{ slot: "embed", modelId: "local/test" }])).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();

  expect(warnings).toEqual([
    {
      fields: { err: failure, name: "local-light.prefetch.walk" },
      message: "local-light: detached work failed",
    },
  ]);
});
