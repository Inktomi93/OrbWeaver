import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

test("an assembled stable-binding read holds the real vector binding write until its snapshot settles", async ({ db }) => {
  const h = await makeHarness(db);
  const owner = await seedOwner(db);
  const create = (model: string): ReturnType<typeof h.svc.create> =>
    h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model,
      declared: { kind: "embedding", embedding: { dims: 2, input: ["text"] } },
      allowBackground: true,
    });
  const old = await create("old-encoder");
  const next = await create("next-encoder");
  await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: old.id });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const reading = h.svc.withStableEmbeddingBinding(owner.userId, async () => {
    entered.resolve();
    await release.promise;
    return h.svc.getBoundConnection({ principal: owner.principal, task: "embed" });
  });
  await entered.promise;
  const writing = h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: next.id });
  try {
    expect((await h.svc.getBoundConnection({ principal: owner.principal, task: "embed" }))?.model).toBe(old.model);
  } finally {
    release.resolve();
  }
  expect((await reading)?.model).toBe(old.model);
  await writing;
  expect((await h.svc.getBoundConnection({ principal: owner.principal, task: "embed" }))?.model).toBe(next.model);
});
