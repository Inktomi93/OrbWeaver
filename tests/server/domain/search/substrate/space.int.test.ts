// substrate/space — the retrieval-side space read. Three properties, each the opposite of a plausible
// "simplification":
//
//   • NO BINDING IS A TYPED REFUSAL, not a skip (the embeddings sibling's arm is `null`, deliberately):
//     a retrieval with no space cannot be skipped — silently embedding the query in nobody's space would
//     return confident nonsense.
//   • THE JOINT-SPACE RULE (§10-3) answers with the arm that EXISTS: an owner with no image-capable
//     embedder searches their pictures as captions in the TEXT space, with the caption lens forced. The
//     write side derives the same arm from the same read, which is what keeps the two in one geometry.
//   • THE TRANSITION REFUSAL (§10-5): an active generation is served while its recorded connection still
//     resolves with the same fingerprint. If that connection is gone or has drifted, the read REFUSES
//     instead of scanning with a different embedder. Every admitted embedder is 1024-wide, so cosine across
//     the two is dimensionally valid and semantically meaningless.
//
// It is an INT test because the last-complete space is a db fact (`embed_space_state`) — a unit-level fake
// would be asserting the fold, which contracts already pins, rather than the read.
//
// THE PRINCIPAL every receipt below is taken as is the seeded OWNER whose generation rows are written.
// Refusal tests retain a positive control or a complete-generation counterpart so fixture failure cannot
// masquerade as the expected transition state.

import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { userConnections } from "@orb/db";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import type { GenerationReceipt } from "../../../../../packages/server/src/domain/embeddings/contract/generation.ts";
import type { EmbeddingConnectionSnapshot } from "../../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { markGenerationComplete } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { resolveTargetGeneration } from "../../../../../packages/server/src/domain/embeddings/substrate/generation.ts";
import { SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING } from "../../../../../packages/server/src/domain/search/contract/errors.ts";
import { withActiveQuerySpace } from "../../../../../packages/server/src/domain/search/substrate/space.ts";
import { freshDb } from "../../../../support/db.ts";
import type { FakeRoleClientControls } from "../../../../support/factories/role-clients.ts";
import { makeFakeRoleClients } from "../../../../support/factories/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../../embeddings/_support.ts";

const NOW = 1_700_000_000_000;

async function connectionOf(clients: RoleClients, task: "embed" | "imageEmbed"): Promise<EmbeddingConnectionSnapshot | null> {
  const resolved = await clients.resolved(task);
  return resolved === null
    ? null
    : {
        ...resolved,
        api: "compat",
        wire: "compat",
        baseUrl: null,
        features: {},
        extras: null,
        transport: null,
        embed: clients.embed,
        imageEmbed: clients.imageEmbed,
      };
}

async function drive(controls: FakeRoleClientControls = {}): Promise<{
  db: Db;
  ownerId: UserId;
  clients: RoleClients;
  ctx: {
    db: Db;
    roleClientsFor: () => Promise<RoleClients>;
    resolveEmbeddingConnection: (
      _ownerId: UserId,
      task: "embed" | "imageEmbed",
      _connectionId?: UserConnectionId,
    ) => Promise<EmbeddingConnectionSnapshot | null>;
  };
}> {
  const db = await freshDb();
  const ownerId = await seedUser(db, {});
  const clients = makeFakeRoleClients(controls);
  const resolvedConnection = (await clients.resolved("embed")) ?? (await clients.resolved("imageEmbed"));
  if (resolvedConnection !== null) {
    await db.insert(userConnections).values({
      id: resolvedConnection.connectionId,
      ownerId,
      label: "search space embed",
      providerId: resolvedConnection.providerId,
      model: resolvedConnection.model,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return {
    db,
    ownerId,
    clients,
    ctx: {
      db,
      roleClientsFor: (): Promise<RoleClients> => Promise.resolve(clients),
      resolveEmbeddingConnection: (_ownerId, task) => connectionOf(clients, task),
    },
  };
}

async function target(db: Db, ownerId: UserId, clients: RoleClients, task: "embed" | "imageEmbed"): Promise<GenerationReceipt> {
  const generation = await resolveTargetGeneration(
    { db, now: () => NOW, resolveEmbeddingConnection: (_ownerId, resolvedTask) => connectionOf(clients, resolvedTask) },
    ownerId,
    task,
  );
  if (generation === null) {
    throw new Error(`the ${task} generation must resolve`);
  }
  return generation;
}

type SpaceCtx = Awaited<ReturnType<typeof drive>>["ctx"];

/** The module's ONE exported door, projected to the two facts each case asserts. `withActiveQuerySpace` is
 *  what every query verb calls, so reading through it keeps these receipts on the production path. */
async function spaceModel(ctx: SpaceCtx, ownerId: UserId, task: "embed" | "imageEmbed"): Promise<string> {
  return await withActiveQuerySpace(ctx, ownerId, task, (space) => Promise.resolve(space.model));
}

async function imageSpace(ctx: SpaceCtx, ownerId: UserId): Promise<{ via: "embed" | "imageEmbed"; model: string }> {
  return await withActiveQuerySpace(ctx, ownerId, "imageEmbed", (space) => Promise.resolve({ via: space.via, model: space.model }));
}

async function complete(db: Db, ownerId: UserId, generation: GenerationReceipt): Promise<void> {
  for (const scope of VECTOR_SCOPES_BY_TASK[generation.task]) {
    await markGenerationComplete(db, { ownerId, scope, generation, now: NOW });
  }
}

test("answers the bound model for each vector task", async () => {
  const { ctx, ownerId } = await drive();
  expect(await spaceModel(ctx, ownerId, "embed")).toBe("test-embed-model");
  expect(await spaceModel(ctx, ownerId, "imageEmbed")).toBe("test-image-embed-model");
});

test("no binding is a TYPED refusal, not a skip — a query is never embedded in nobody's space", async () => {
  const { ctx, ownerId } = await drive({ unbound: ["embed"] });
  await expect(spaceModel(ctx, ownerId, "embed")).rejects.toMatchObject({ code: SEARCH_NO_SPACE });
  // The positive control in the same wiring: the OTHER task still answers, so the refusal is the binding's
  // doing and not a broken fixture.
  expect(await spaceModel(ctx, ownerId, "imageEmbed")).toBe("test-image-embed-model");
});

test("an owner with NO vector connection at all cannot search images — the fallback has nothing to fall to", async () => {
  const { ctx, ownerId } = await drive({ unbound: ["imageEmbed", "embed"] });
  await expect(imageSpace(ctx, ownerId)).rejects.toMatchObject({ code: SEARCH_NO_SPACE });
});

test("§10-3 an image-capable embedder keeps the image arm — the query rides imageEmbed", async () => {
  const { ctx, ownerId } = await drive();
  expect(await imageSpace(ctx, ownerId)).toEqual({ via: "imageEmbed", model: "test-image-embed-model" });
});

test("§10-3 NO imageEmbed binding falls back to the captioned-text lens in the owner's EMBED space", async () => {
  const { ctx, ownerId } = await drive({ unbound: ["imageEmbed"] });
  expect(await imageSpace(ctx, ownerId)).toEqual({ via: "embed", model: "test-embed-model" });
});

test("§10-3 a BOUND imageEmbed model that takes no image input falls back the same way", async () => {
  // The second cause, and the one a bare "is it bound?" check misses entirely: the slot is filled, the
  // resolve succeeds, and the model still cannot accept a picture.
  const { ctx, ownerId } = await drive({ imageEmbedVision: false });
  expect(await imageSpace(ctx, ownerId)).toEqual({ via: "embed", model: "test-embed-model" });
});

test("§10-5 an active generation whose recorded connection fingerprints differently is a named refusal", async () => {
  const { db, ctx, ownerId } = await drive();
  const oldClients = makeFakeRoleClients({ embedModel: "older-embed-model" });
  await complete(db, ownerId, await target(db, ownerId, oldClients, "embed"));
  await expect(spaceModel(ctx, ownerId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });
  // POSITIVE CONTROL in the same db: `imageEmbed` is still an unrecorded bootstrap, so it answers from the
  // live binding. The refusal is about THIS task's active connection fingerprint, not the generation table.
  expect(await spaceModel(ctx, ownerId, "imageEmbed")).toBe("test-image-embed-model");
});

test("§10-5 a PARTLY-moved corpus also refuses — one lagging scope is enough", async () => {
  const { db, ctx, ownerId, clients } = await drive();
  const generation = await target(db, ownerId, clients, "embed");
  await markGenerationComplete(db, { ownerId, scope: "cards", generation, now: NOW });
  await markGenerationComplete(db, { ownerId, scope: "memory", generation, now: NOW });
  // `documents` is still absent. A per-task completion flag would serve a first-build corpus that silently
  // misses every document; readGeneration must keep the task in the named moving state.
  await expect(spaceModel(ctx, ownerId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });
});

test("§10-5 once every scope has landed in the live space the read resumes — the swap completes", async () => {
  const { db, ctx, ownerId, clients } = await drive();
  await complete(db, ownerId, await target(db, ownerId, clients, "embed"));
  expect(await spaceModel(ctx, ownerId, "embed")).toBe("test-embed-model");
});

test("§10-5 a box that has never completed a sweep serves the live space — bootstrap, not a silent fallback", async () => {
  const { ctx, ownerId } = await drive();
  // No `embed_space_state` rows at all: everything that exists was written in the live space, so there is
  // nothing to be mid-move between. Refusing here would break every fresh install.
  expect(await spaceModel(ctx, ownerId, "embed")).toBe("test-embed-model");
});
