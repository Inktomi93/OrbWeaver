// verb: previewEmbedSpaceChange — the read the pane asks before an embedder change. It must say "rebuild" exactly
// when the change moves the caller to a new embedding generation, count what that rebuild covers, and write
// nothing.

import { characterEmbeddings, characters, embedGenerations, userCredentials } from "@orb/db";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { CharacterEmbeddingId, CharacterHandle, CharacterId, EmbedGenerationId, UserConnectionId, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeResolvedSecret } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { ConnectionHarness } from "../_support.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

interface Fixture {
  readonly h: ConnectionHarness;
  readonly owner: Awaited<ReturnType<typeof seedOwner>>;
  readonly bound: UserConnectionId;
  readonly other: UserConnectionId;
}

/** Two curated local embedders on the owner's endpoint; the first is bound for text embedding. */
async function twoEmbedders(db: Awaited<ReturnType<typeof freshDb>>): Promise<Fixture> {
  const h = await makeHarness(db);
  const owner = await seedOwner(db);
  const create = async (model: string): Promise<UserConnectionId> =>
    (await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model, allowBackground: true })).id;
  const bound = await create("nomic-embed-text");
  const other = await create("embeddinggemma");
  await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: bound });
  return { h, owner, bound, other };
}

/** `count` stored card vectors for the owner. */
async function storeCardVectors(db: Awaited<ReturnType<typeof freshDb>>, fixture: Fixture, count: number): Promise<void> {
  const generationId = castId<EmbedGenerationId>("embed_generation_preview");
  await db.insert(embedGenerations).values({
    id: generationId,
    ownerId: fixture.owner.userId,
    task: "embed",
    via: "embed",
    connectionId: fixture.bound,
    connectionRef: fixture.bound,
    fingerprint: "preview",
    space: "nomic-embed-text",
    createdAt: 0,
  });
  for (let i = 0; i < count; i += 1) {
    const characterId = castId<CharacterId>(`character_preview_${i}`);
    await db.insert(characters).values({
      id: characterId,
      handle: castId<CharacterHandle>(`preview-${i}`),
      ownerId: fixture.owner.userId,
      name: `Preview ${i}`,
      contentHash: `card_preview_${i}`,
      createdAt: 0,
    });
    await db.insert(characterEmbeddings).values({
      id: castId<CharacterEmbeddingId>(`character_embedding_preview_${i}`),
      characterId,
      embedding: new Float32Array(768),
      contentHash: `preview_${i}`,
      model: "nomic-embed-text",
      generationId,
      dim: 768,
      createdAt: 0,
    });
  }
}

describe("previewEmbedSpaceChange", () => {
  test("binding a different embedder over a stored index says rebuild, with the counts it covers", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    await storeCardVectors(db, fixture, 3);
    const preview = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "bind", task: "embed", connectionId: fixture.other },
    });
    expect(preview).toEqual({ reindex: true, stored: { cards: 3, memory: 0, documents: 0, images: 0 }, embedCalls: 3 });
  });

  test("re-picking the bound embedder, or patching a field outside its identity, rebuilds nothing", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    await storeCardVectors(db, fixture, 2);
    const same = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "bind", task: "embed", connectionId: fixture.bound },
    });
    const relabel = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "update", connectionId: fixture.bound, patch: { label: "Renamed embedder" } },
    });
    expect(same.reindex).toBe(false);
    expect(relabel.reindex).toBe(false);
    expect(relabel.embedCalls).toBe(0);
  });

  test("changing the bound row's model says rebuild; changing an unbound row's model does not", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    await storeCardVectors(db, fixture, 1);
    const boundRow = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "update", connectionId: fixture.bound, patch: { model: "mxbai-embed-large" } },
    });
    const unboundRow = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "update", connectionId: fixture.other, patch: { model: "mxbai-embed-large" } },
    });
    expect(boundRow).toMatchObject({ reindex: true, embedCalls: 1 });
    expect(unboundRow.reindex).toBe(false);
  });

  // "Use this connection for everything it can serve" rebinds the vector roles too, so it previews like a bind.
  test("using another embedder for everything over a stored index says rebuild; the bound one rebuilds nothing", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    await storeCardVectors(db, fixture, 2);
    const other = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "everywhere", connectionId: fixture.other },
    });
    const same = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "everywhere", connectionId: fixture.bound },
    });
    expect(other).toEqual({ reindex: true, stored: { cards: 2, memory: 0, documents: 0, images: 0 }, embedCalls: 2 });
    expect(same.reindex).toBe(false);
  });

  // An unbound role resolves to nothing, so no generation moves and nothing is deleted: the stored index stays.
  test("clearing the text embedder over a stored index rebuilds nothing", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    await storeCardVectors(db, fixture, 2);
    const preview = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "bind", task: "embed", connectionId: null },
    });
    expect(preview).toEqual({ reindex: false, stored: { cards: 0, memory: 0, documents: 0, images: 0 }, embedCalls: 0 });
  });

  test("a change with nothing stored still says rebuild, at zero cost, and the read writes nothing", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    const changesBefore = fixture.h.embedSpaceChanges.length;
    const preview = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "bind", task: "embed", connectionId: fixture.other },
    });
    expect(preview).toEqual({ reindex: true, stored: { cards: 0, memory: 0, documents: 0, images: 0 }, embedCalls: 0 });
    expect(fixture.h.embedSpaceChanges).toHaveLength(changesBefore);
    const bindings = await fixture.h.svc.listBindings({ principal: fixture.owner.principal });
    expect(bindings.find((view) => view.task === "embed")?.binding?.connectionId).toBe(fixture.bound);
  });

  // A row that cannot resolve today (its key is revoked) still moves the generation once the key comes back, and
  // that resolve deletes the old index. Only a real unbind may skip the warning.
  test("binding, or using for everything, a row whose key is revoked still says rebuild", async () => {
    const db = await freshDb();
    const credentialId = castId<UserCredentialId>("user_credential_preview_revoked");
    const h = await makeHarness(db, {
      resolveCredential: ({ credentialId: id, providerId }) =>
        id === null ? Promise.resolve(makeResolvedSecret()) : Promise.reject(new DomainNoCredentialError(providerId)),
    });
    const owner = await seedOwner(db);
    await db.insert(userCredentials).values({ id: credentialId, ownerId: owner.userId, provider: BYO_PROVIDER, ciphertext: "x", iv: "x", tag: "x" });
    const create = async (model: string, credential: UserCredentialId | null): Promise<UserConnectionId> =>
      (
        await h.svc.create({
          principal: owner.principal,
          providerId: BYO_PROVIDER,
          credentialId: credential,
          baseUrl: BYO_BASE_URL,
          model,
          allowBackground: true,
        })
      ).id;
    const bound = await create("nomic-embed-text", null);
    const revoked = await create("embeddinggemma", credentialId);
    await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: bound });
    await storeCardVectors(db, { h, owner, bound, other: revoked }, 2);

    const bind = await h.svc.previewEmbedSpaceChange({ principal: owner.principal, change: { kind: "bind", task: "embed", connectionId: revoked } });
    const everywhere = await h.svc.previewEmbedSpaceChange({ principal: owner.principal, change: { kind: "everywhere", connectionId: revoked } });

    expect(bind).toMatchObject({ reindex: true, stored: { cards: 2 } });
    expect(everywhere).toMatchObject({ reindex: true, stored: { cards: 2 } });
  });
});
