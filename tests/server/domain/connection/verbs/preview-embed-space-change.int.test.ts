// verb: previewEmbedSpaceChange — the read the pane asks before an embedder change. It must say "rebuild" exactly
// when the change moves the caller to a new embedding generation, count what that rebuild covers, and write
// nothing.

import type { ProviderId } from "@orb/contracts/inference";
import { characterEmbeddings, characters, embedGenerations, userCredentials } from "@orb/db";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { CharacterEmbeddingId, CharacterHandle, CharacterId, EmbedGenerationId, UserConnectionId, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeResolvedSecret } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { ConnectionHarness, HarnessOptions } from "../_support.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

interface Fixture {
  readonly h: ConnectionHarness;
  readonly owner: Awaited<ReturnType<typeof seedOwner>>;
  readonly bound: UserConnectionId;
  readonly other: UserConnectionId;
}

/** Two curated local embedders on the owner's endpoint; the first is bound for text embedding. */
async function twoEmbedders(db: Awaited<ReturnType<typeof freshDb>>, options?: HarnessOptions): Promise<Fixture> {
  const h = await makeHarness(db, options);
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

const OPENROUTER_CREDENTIAL = castId<UserCredentialId>("user_credential_preview_or");
/** An embedder only OpenRouter's catalog describes: no curated row and no declared Purpose. */
const OPENROUTER_EMBEDDER = "baai/bge-base-en-v1.5";
const OPENROUTER_EMBEDDER_ROUTES = [
  {
    match: "/models?output_modalities=embeddings",
    json: { data: [{ id: OPENROUTER_EMBEDDER, name: "BGE base", architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["embeddings"] } }] },
  },
  { match: "/models", json: { data: [] } },
];

/** The bound local embedder with stored vectors, plus an OpenRouter embedder row the owner may switch to. */
async function openRouterSwitch(db: Awaited<ReturnType<typeof freshDb>>): Promise<Fixture> {
  const h = await makeHarness(db, { routes: OPENROUTER_EMBEDDER_ROUTES });
  const owner = await seedOwner(db);
  await db
    .insert(userCredentials)
    .values({ id: OPENROUTER_CREDENTIAL, ownerId: owner.userId, provider: castId<ProviderId>("openrouter"), ciphertext: "x", iv: "x", tag: "x" });
  const bound = (
    await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "nomic-embed-text",
      allowBackground: true,
    })
  ).id;
  await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: bound });
  const other = (
    await h.svc.create({
      principal: owner.principal,
      providerId: "openrouter",
      credentialId: OPENROUTER_CREDENTIAL,
      baseUrl: null,
      model: OPENROUTER_EMBEDDER,
      allowBackground: true,
    })
  ).id;
  const fixture = { h, owner, bound, other };
  await storeCardVectors(db, fixture, 2);
  return fixture;
}

const LLAMA_CPP_URL = "http://127.0.0.1:18704/v1";

function jsonAnswer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A llama.cpp server launched as an embedder for `listed`: its kind is known only from the per-model probe (the
 *  embeddings route answers an empty body with a 400 naming `input`). */
function llamaCppEmbedder(listed: string): (url: string, init: RequestInit | undefined) => Promise<Response> | null {
  const routes: Readonly<Record<string, (body: { readonly input?: unknown }) => Response>> = {
    "/props": () => jsonAnswer({ ["build_info"]: "b5000-abc", ["default_generation_settings"]: { ["n_ctx"]: 4096 } }),
    "/v1/models": () => jsonAnswer({ object: "list", data: [{ id: listed, object: "model" }] }),
    "/rerank": () => jsonAnswer({ error: { message: "not supported" } }, 501),
    "/v1/embeddings": (body) =>
      body.input === undefined
        ? jsonAnswer({ error: { message: '"input" must be provided' } }, 400)
        : jsonAnswer({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] }),
  };
  return (url, init) => {
    if (!url.startsWith("http://127.0.0.1:18704")) {
      return null;
    }
    const route = routes[new URL(url).pathname];
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { readonly input?: unknown }) : {};
    return Promise.resolve(route === undefined ? jsonAnswer({ error: "not found" }, 404) : route(body));
  };
}

describe("previewEmbedSpaceChange over a listed but unprobed model", () => {
  // A curated guess ranks below the server's own probe, so it cannot hold the preview quiet while the probe is owed.
  // The first id is curated as a chat model; the second is curated as nothing (the control).
  for (const listed of ["Qwen3-8B-Q4_K_M.gguf", "gte-Qwen2-7B-instruct.gguf"]) {
    test(`an embedder the probe has not described yet (${listed}) previews the rebuild the write then makes`, async () => {
      const db = await freshDb();
      const fixture = await twoEmbedders(db, { intercept: llamaCppEmbedder(listed) });
      await storeCardVectors(db, fixture, 2);
      const create = async (model: string): Promise<UserConnectionId> =>
        (
          await fixture.h.svc.create({
            principal: fixture.owner.principal,
            providerId: BYO_PROVIDER,
            credentialId: null,
            baseUrl: LLAMA_CPP_URL,
            model,
            allowBackground: true,
          })
        ).id;
      const served = await create(listed);
      const older = await create("old-model.gguf");
      // Another row's turn warms the shared list; the served model is listed but not probed.
      await fixture.h.runtime.resolve({ task: "chat", principal: fixture.owner.principal, connectionId: older }).catch(() => undefined);
      const changesBefore = fixture.h.embedSpaceChanges.length;

      const preview = await fixture.h.svc.previewEmbedSpaceChange({ principal: fixture.owner.principal, change: { kind: "everywhere", connectionId: served } });
      const written = await fixture.h.svc.useForEverything({ principal: fixture.owner.principal, connectionId: served });

      expect(written.map((binding) => binding.task)).toContain("embed");
      expect(fixture.h.embedSpaceChanges.length - changesBefore).toBe(1);
      expect(preview).toMatchObject({ reindex: true, stored: { cards: 2 } });
    });
  }
});

describe("previewEmbedSpaceChange after a restart", () => {
  // A restarted process holds no catalog in memory; the preview must read the persisted one the write will read.
  test("a fresh runtime previews the rebuild that using a catalog-described embedder for everything then makes", async () => {
    const db = await freshDb();
    const fixture = await openRouterSwitch(db);
    await fixture.h.runtime.resolve({ task: "embed", principal: fixture.owner.principal, connectionId: fixture.other });
    const restarted = await makeHarness(db, { routes: OPENROUTER_EMBEDDER_ROUTES });

    const preview = await restarted.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "everywhere", connectionId: fixture.other },
    });
    const listedTasks = (await restarted.svc.get({ principal: fixture.owner.principal, connectionId: fixture.other })).tasks;
    expect(restarted.requests, "the preview and the list view dial nothing").toHaveLength(0);
    await restarted.svc.useForEverything({ principal: fixture.owner.principal, connectionId: fixture.other });

    expect(preview).toMatchObject({ reindex: true, stored: { cards: 2 } });
    expect(listedTasks).toContain("embed");
    expect(restarted.embedSpaceChanges).toHaveLength(1);
  });

  // Nothing persisted says what the row is, and the write will ask its catalog: the preview confirms rather than stay quiet.
  test("a row whose catalog was never read previews a rebuild rather than none", async () => {
    const db = await freshDb();
    const fixture = await openRouterSwitch(db);
    const restarted = await makeHarness(db, { routes: OPENROUTER_EMBEDDER_ROUTES });

    const preview = await restarted.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "everywhere", connectionId: fixture.other },
    });

    expect(restarted.requests).toHaveLength(0);
    expect(preview).toMatchObject({ reindex: true, stored: { cards: 2 } });
  });
});

describe("previewEmbedSpaceChange", () => {
  test("binding a different embedder over a stored index says rebuild, with the counts it covers", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    await storeCardVectors(db, fixture, 3);
    const preview = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "bind", task: "embed", connectionId: fixture.other },
    });
    expect(preview).toMatchObject({ reindex: true, stored: { cards: 3, memory: 0, documents: 0, images: 0 }, embedCalls: 3 });
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
    expect(other).toMatchObject({ reindex: true, stored: { cards: 2, memory: 0, documents: 0, images: 0 }, embedCalls: 2 });
    expect(same.reindex).toBe(false);
  });

  // The switch deletes the chat digests, so the memory rebuild re-summarizes: the pane must know whether it can.
  test("the preview says whether a Utility model is set to re-summarize chat memory", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    const change = { kind: "bind", task: "embed", connectionId: fixture.other } as const;
    const without = await fixture.h.svc.previewEmbedSpaceChange({ principal: fixture.owner.principal, change });
    const utility = await fixture.h.svc.create({
      principal: fixture.owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "llama3.1",
      allowBackground: true,
    });
    await fixture.h.svc.setBinding({ principal: fixture.owner.principal, task: "summarize", connectionId: utility.id });
    const withUtility = await fixture.h.svc.previewEmbedSpaceChange({ principal: fixture.owner.principal, change });
    expect([without.utilityModelSet, withUtility.utilityModelSet]).toEqual([false, true]);
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
    expect(preview).toMatchObject({ reindex: false, stored: { cards: 0, memory: 0, documents: 0, images: 0 }, embedCalls: 0 });
  });

  test("a change with nothing stored still says rebuild, at zero cost, and the read writes nothing", async () => {
    const db = await freshDb();
    const fixture = await twoEmbedders(db);
    const changesBefore = fixture.h.embedSpaceChanges.length;
    const preview = await fixture.h.svc.previewEmbedSpaceChange({
      principal: fixture.owner.principal,
      change: { kind: "bind", task: "embed", connectionId: fixture.other },
    });
    expect(preview).toMatchObject({ reindex: true, stored: { cards: 0, memory: 0, documents: 0, images: 0 }, embedCalls: 0 });
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
