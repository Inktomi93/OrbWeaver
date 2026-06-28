// entry/compose/services — the composition-root keystone. Integration-lite: build the whole graph over a
// fresh in-memory db + a frozen clock + a vLLM-disabled provider registry, and assert it constructs without
// throwing and yields every transport `Services` key plus the boot handles. This proves the injection graph
// wires (the 15 services + the boot-global RoleClients bundle resolve offline against the vLLM floor).

import { tmpdir } from "node:os";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { expect, test } from "vitest";
import { writeAppOverride } from "../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { createFrozenClock } from "../../../support/clock";
import { freshDb } from "../../../support/db";

const SERVICE_KEYS = [
  "admin",
  "buddy",
  "character",
  "connection",
  "credentials",
  "discovery",
  "notifications",
  "persona",
  "preset",
  "search",
  "settings",
  "stats",
  "tag",
  "workloads",
  "worldInfo",
] as const;

test("createServices builds the full graph: all 15 Services keys + the boot handles", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: true,
  });

  for (const key of SERVICE_KEYS) {
    expect(result.services[key], `services.${key}`).toBeDefined();
  }
  expect(Object.keys(result.services)).toHaveLength(SERVICE_KEYS.length);

  // Boot handles the lifecycle/seam consume.
  expect(result.sessions).toBeDefined();
  expect(result.embeddings).toBeDefined();
  expect(result.indexer).toBeDefined();
  expect(result.assets).toBeDefined();
  expect(result.exportService).toBeDefined();
  expect(result.eventBus).toBeDefined();
  expect(result.runnerEnv).toBeDefined();
  expect(result.roleClients).toBeDefined();
  expect(result.bindRoleClients).toBeInstanceOf(Function);
  expect(result.effectiveConfig).toBeDefined();
  expect(result.secretBox).toBeDefined();
  // vLLM disabled → no engine handle for the lifecycle to supervise.
  expect(result.vllmEngine).toBeNull();
});

test("the boot-global RoleClients bundle resolves the derive roles to the vLLM floor model", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    vllmDisabled: true,
  });

  // Empty settings → roleDefaults default to the local vLLM source, so embed resolves to the env embed model.
  expect(result.roleClients.embedModel).toBe(env.VLLM_EMBED_MODEL);
  expect(result.roleClients.summarizerModel).toBe(env.VLLM_GEN_MODEL);
});

test("the backend registry sources the resolved vLLM concurrency from AppSettings (PD-14)", async () => {
  const db = await freshDb();
  const clock = createFrozenClock();
  // An admin AppSettings override the boot reload resolves into the effective-config the registry reads.
  // embed:2 is distinct from the backend's DEFAULT_EMBED_CONCURRENCY (4): observing exactly 2 in-flight embed
  // requests proves the RESOLVED override (not the deps default) reached the constructed vLLM backend.
  await writeAppOverride(
    db,
    { vllmConcurrency: { embed: 2, summarize: 3 }, schemaVersion: 2 },
    clock.now(),
  );

  // A recording fake engine client: track the peak simultaneous in-flight embed requests. The setTimeout(0)
  // yield lets every started worker increment before any resolves, so the peak == the worker count, which the
  // embed surface caps at min(concurrency, chunks). With chunkSize 1 + 6 inputs the cap is the concurrency.
  let active = 0;
  let peak = 0;
  const vllmClient: VllmEngineClient = {
    enginePost: async <T>(_engine: unknown, _path: string, body: unknown): Promise<T> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      const { input } = body as { input: string[] };
      return {
        data: input.map((_text, i) => ({ index: i, embedding: [1, 2, 3, 4] })),
        model: "fake",
      } as T;
    },
    engineStream: () => Promise.reject(new Error("embed must not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };

  const result = await createServices({
    db,
    now: clock.now,
    ownerId: castId<UserId>("u_owner"),
    secretBoxKey: null,
    casDir: tmpdir(),
    variantDir: tmpdir(),
    sessionSecret: "test-session-secret-at-least-32-chars",
    // vLLM enabled (so the backend is registered) with a fake loopback client + a unit chunk size.
    vllmDisabled: false,
    providerSeams: { vllmClient, vllmChunkSize: 1, vllmEmbedDim: 4 },
  });

  // embed routes to the vLLM floor (empty user settings); 6 inputs @ chunkSize 1 → 6 chunks. The peak
  // in-flight is min(resolved embed concurrency = 2, 6) === 2 — the override, NOT the default 4.
  await result.roleClients.embed(["a", "b", "c", "d", "e", "f"]);
  expect(peak).toBe(2);
});
