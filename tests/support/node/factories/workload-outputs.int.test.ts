// @subject tests/support/node/factories/workload.ts
import "../composed-real.ts";
import { setTimeout as physicalDelay } from "node:timers/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { MS_PER_SECOND } from "@orb/kit/time";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { seedCorpusConnections } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedWorkload } from "./workload.ts";

test("native cancellation outputs distinguish queued, running and terminal work without granting a stranger its identity", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The workload preserves an admitted ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let holding = false;
  let heldCalls = 0;
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (holding && heldCalls === 0 && new URL(request.url).pathname === "/v1/embeddings") {
      heldCalls += 1;
      reached.resolve();
      await released.promise;
    }
    return await physical.execute(request);
  };
  await using root = await createServerHarness({ providerFetch });
  const principal = await root.principalFor((await root.actor()).id);
  const foreign = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, principal);
  await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({
      handle: "cancellation-output",
      name: "Cancellation witness",
      description: "The admitted tenant preserves the orbital ledger.",
    }),
  });
  await root.settleBackground();
  const service = root.services.workloads;
  const future = await seedWorkload(root.db, service.start, {
    caller: principal,
    ownerId: principal.userId,
    mode: "singular",
    input: { kind: "reconcile-stats", params: {} },
    scheduledAt: root.clock.now() + CADENCE_INTERVAL_MS.daily,
  });
  expect(await service.get({ caller: principal, id: future.id })).toMatchObject({
    id: future.id,
    ownerId: principal.userId,
    status: "queued",
    scheduledAt: future.scheduledAt,
  });
  expect(await service.cancel({ caller: principal, id: future.id })).toEqual({ status: "cancelled" });
  const cancelled = await service.get({ caller: principal, id: future.id });
  expect(cancelled).toMatchObject({ id: future.id, status: "cancelled", ownerId: principal.userId });
  expect(await service.cancel({ caller: principal, id: future.id })).toEqual({ status: null });
  expect(await service.get({ caller: principal, id: future.id })).toEqual(cancelled);
  expect(await service.estimateRetryModelCalls({ caller: principal, id: future.id })).toEqual({ calls: null });
  holding = true;
  const active = await seedWorkload(root.db, service.start, {
    caller: principal,
    ownerId: principal.userId,
    mode: "singular",
    input: { kind: "index", params: { source: "text", force: true } },
  });
  const deadline = new AbortController();
  try {
    root.timers.advance(MS_PER_SECOND * 5);
    await Promise.race([
      reached.promise,
      physicalDelay(5000, undefined, { ref: false, signal: deadline.signal }).then(() => {
        throw new Error("native worker did not reach the physical provider gate");
      }),
    ]);
    expect(await service.get({ caller: principal, id: active.id })).toMatchObject({
      id: active.id,
      status: "running",
      ownerId: principal.userId,
      funderUserId: principal.userId,
    });
    await expect(service.get({ caller: foreign, id: active.id })).rejects.toThrow();
    await expect(service.cancel({ caller: foreign, id: active.id })).rejects.toThrow();
    expect(await service.cancel({ caller: principal, id: active.id })).toEqual({ status: "cancelling" });
    expect(await service.get({ caller: principal, id: active.id })).toMatchObject({ id: active.id, status: "cancelling", ownerId: principal.userId });
  } finally {
    deadline.abort();
    released.resolve();
    await root.settleBackground();
  }
  expect(heldCalls).toBe(1);
  expect(await service.get({ caller: principal, id: active.id })).toMatchObject({ id: active.id, status: "cancelled", funderUserId: principal.userId });
  expect(await service.cancel({ caller: principal, id: active.id })).toEqual({ status: null });
});
