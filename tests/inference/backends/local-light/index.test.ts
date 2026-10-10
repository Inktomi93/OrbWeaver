// The local-light composition root does not own detached-work failure handling. Every prefetch walk enters
// through the injected supervisor; server composition supplies the traced/logged owner while package tests
// can supply a deterministic observer without reaching process-global tracing state.

import { EMBEDDING_FLOOR, LOCAL_TEXT_ENCODING, modelIdSchema } from "@orb/contracts/inference";
import { createLocalLightBackend } from "../../../../packages/inference/src/backends/local-light/index.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeModelCache, fakeResolved } from "../../_support.ts";

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

  expect(() => local.prefetch.start([{ slot: "embed", modelId: modelIdSchema.parse("local/test") }])).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();

  expect(supervised).toEqual(["local-light.prefetch.walk"]);
  expect(warnings).toEqual([]);
});

test("concurrent text requests batch together and keep their original result order", async () => {
  const cache = fakeModelCache();
  const local = createLocalLightBackend({
    now: () => 0,
    log: recordingLog([]),
    superviseDetached: () => undefined,
    config: { cache },
  });
  const connection = fakeResolved({
    task: "embed",
    providerId: "local-light",
    model: "jinaai/jina-clip-v2",
    capability: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: 1024, localTextEncoding: LOCAL_TEXT_ENCODING } },
  });
  const embed = local.backend.embed;
  if (embed === undefined) {
    throw new Error("missing embed backend");
  }
  const results = await Promise.all(["short", "tiny", "words"].map((input) => embed({ connection, input })));
  expect(results).toHaveLength(3);
  expect(results.every((result) => result.vectors.length === 1)).toBe(true);
  expect(cache.calls).toEqual([{ method: "embedTexts", repo: connection.model, count: 3 }]);
});
