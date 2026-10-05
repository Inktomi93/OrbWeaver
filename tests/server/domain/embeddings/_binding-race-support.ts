import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { characterEmbeddings, embedGenerationTargets } from "@orb/db";
import type { EmbeddingsContext } from "@orb/server/domain/embeddings";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { freshDb } from "../../../support/db.ts";
import { expect } from "../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../connection/_support.ts";
import { makeStoreHarness, seedCharacter } from "./_support.ts";

/** A real binding probe is held while an independent target-changing reader runs, then refused. */
export async function assertRefusedBindingRace(reader: "store" | "sweep" | "empty-sweep"): Promise<number> {
  const db = await freshDb();
  const probing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<Response>();
  let candidateProbes = 0;
  const h = await makeHarness(db, {
    intercept: (url, init) => {
      if (!url.endsWith("/embeddings")) {
        return null;
      }
      const request = JSON.parse(String(init?.body)) as { model: string; input: string | string[] };
      if (request.model === "candidate" && candidateProbes++ === 0) {
        probing.resolve();
        return release.promise;
      }
      const inputs = typeof request.input === "string" ? [request.input] : request.input;
      return Promise.resolve(Response.json({ data: inputs.map((_input, index) => ({ index, embedding: [1, 2, 3] })) }));
    },
  });
  const owner = await seedOwner(db);
  const create = (model: string): ReturnType<typeof h.svc.create> =>
    h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model,
      declared: { kind: "embedding", embedding: { dims: 3, input: ["text"] } },
      allowBackground: true,
    });
  const old = await create("original");
  const candidate = await create("candidate");
  await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: old.id });
  const characterId = await seedCharacter(db, owner.userId);
  const fixture = makeStoreHarness(db, { characterIds: reader === "empty-sweep" ? [] : [characterId], cardTexts: new Map([[characterId, "A keeper"]]) });
  const ctx: EmbeddingsContext = {
    ...fixture.ctx,
    withStableEmbeddingBinding: (ownerId, read) => h.svc.withStableEmbeddingBinding(ownerId, read),
    resolveEmbeddingConnection: async (_ownerId, task, connectionId) => {
      const { resolved } = await h.runtime.resolve({ principal: owner.principal, task, ...(connectionId === undefined ? {} : { connectionId }) });
      return {
        ...resolved,
        api: resolved.api ?? "none",
        embed: (input, opts) => h.runtime.executor.embed({ connection: { ...resolved, task: "embed" }, input, signal: opts?.signal }),
        imageEmbed: (input, opts) => h.runtime.executor.imageEmbed({ connection: { ...resolved, task: "imageEmbed" }, input, signal: opts?.signal }),
      };
    },
    onTargetGenerationMoved: () => {
      throw new Error("a refused binding must never purge or enqueue a rebuild");
    },
  };
  const embeddings = createEmbeddingsService(ctx);
  const wireEmbeddings = h.useEmbeddings;
  wireEmbeddings(embeddings);
  const params = { kind: "card", lens: "card-text", ownerId: owner.userId, characterId, content: "A keeper", model: "original" } as const;
  await embeddings.store(params);
  const before = await db.select().from(characterEmbeddings);
  const target = await db.select().from(embedGenerationTargets);
  const binding = h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: candidate.id }).catch((error: unknown) => error);
  await probing.promise;
  const queued = Promise.withResolvers<void>();
  const racing = createEmbeddingsService({
    ...ctx,
    withStableEmbeddingBinding: (ownerId, read) => {
      queued.resolve();
      return h.svc.withStableEmbeddingBinding(ownerId, read);
    },
  });
  const work = (
    reader === "store"
      ? racing.store(params).then(() => undefined)
      : racing.embedCorpus({ ownerId: owner.userId, force: false, signal: new AbortController().signal }).then(() => undefined)
  ).catch((error: unknown) => error);
  try {
    await Promise.race([queued.promise, work]);
    expect(await db.select().from(characterEmbeddings)).toEqual(before);
    expect(await db.select().from(embedGenerationTargets)).toEqual(target);
  } finally {
    release.resolve(Response.json({ error: { message: "host failed" } }, { status: 400 }));
    await binding;
    await work;
  }
  expect(await binding).toMatchObject({ code: CONNECTION_OP_CODES.embedUnreachable });
  expect(await db.select().from(characterEmbeddings)).toEqual(before);
  expect(await db.select().from(embedGenerationTargets)).toEqual(target);
  expect((await h.svc.getBoundConnection({ principal: owner.principal, task: "embed" }))?.model).toBe("original");
  return candidateProbes;
}
