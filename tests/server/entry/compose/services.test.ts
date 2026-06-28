// entry/compose/services — the composition-root keystone. Integration-lite: build the whole graph over a
// fresh in-memory db + a frozen clock + a vLLM-disabled provider registry, and assert it constructs without
// throwing and yields every transport `Services` key plus the boot handles. This proves the injection graph
// wires (the 15 services + the boot-global RoleClients bundle resolve offline against the vLLM floor).

import { tmpdir } from "node:os";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createServices } from "@orb/server/entry/compose";
import { env } from "@orb/server/foundation/env";
import { expect, test } from "vitest";
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
