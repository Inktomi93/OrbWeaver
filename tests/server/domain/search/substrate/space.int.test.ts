// substrate/space — the retrieval-side space read. Three properties, each the opposite of a plausible
// "simplification":
//
//   • NO BINDING IS A TYPED REFUSAL, not a skip (the embeddings sibling's arm is `null`, deliberately):
//     a retrieval with no space cannot be skipped — silently embedding the query in nobody's space would
//     return confident nonsense.
//   • THE JOINT-SPACE RULE (§10-3) answers with the arm that EXISTS: an owner with no image-capable
//     embedder searches their pictures as captions in the TEXT space, with the caption lens forced. The
//     write side derives the same arm from the same read, which is what keeps the two in one geometry.
//   • THE TRANSITION REFUSAL (§10-5): while the corpus is still in the last COMPLETE space and the live
//     binding resolves to another, the read REFUSES instead of scanning. Every admitted embedder is
//     1024-wide, so cosine across the two is dimensionally valid and semantically meaningless — the naive
//     build returns confidently-ranked garbage where the pre-§10-5 tree returned an empty list.
//
// It is an INT test because the last-complete space is a db fact (`embed_space_state`) — a unit-level fake
// would be asserting the fold, which contracts already pins, rather than the read.
//
// THE PRINCIPAL every receipt below is taken as is the seeded OWNER whose completion rows are written, and
// each transition assertion is paired with the same call for an owner in the steady state, so a refusal is
// never ambiguous between "mid-reindex" and "broken fixture".

import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { upsertCompletedSpace } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING } from "../../../../../packages/server/src/domain/search/contract/errors.ts";
import { requireImageSpace, requireSpaceModel } from "../../../../../packages/server/src/domain/search/substrate/space.ts";
import { freshDb } from "../../../../support/db.ts";
import type { FakeRoleClientControls } from "../../../../support/factories/role-clients.ts";
import { makeFakeRoleClients } from "../../../../support/factories/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../../embeddings/_support.ts";

const NOW = 1_700_000_000_000;

async function drive(controls: FakeRoleClientControls = {}): Promise<{ db: Db; ownerId: UserId; ctx: { db: Db; roleClientsFor: () => Promise<RoleClients> } }> {
  const db = await freshDb();
  const ownerId = await seedUser(db, {});
  const clients = makeFakeRoleClients(controls);
  return { db, ownerId, ctx: { db, roleClientsFor: (): Promise<RoleClients> => Promise.resolve(clients) } };
}

test("answers the bound model for each vector task", async () => {
  const { ctx, ownerId } = await drive();
  expect(await requireSpaceModel(ctx, ownerId, "embed")).toBe("test-embed-model");
  expect(await requireSpaceModel(ctx, ownerId, "imageEmbed")).toBe("test-image-embed-model");
});

test("no binding is a TYPED refusal, not a skip — a query is never embedded in nobody's space", async () => {
  const { ctx, ownerId } = await drive({ unbound: ["embed"] });
  await expect(requireSpaceModel(ctx, ownerId, "embed")).rejects.toMatchObject({ code: SEARCH_NO_SPACE });
  // The positive control in the same wiring: the OTHER task still answers, so the refusal is the binding's
  // doing and not a broken fixture.
  expect(await requireSpaceModel(ctx, ownerId, "imageEmbed")).toBe("test-image-embed-model");
});

test("an owner with NO vector connection at all cannot search images — the fallback has nothing to fall to", async () => {
  const { ctx, ownerId } = await drive({ unbound: ["imageEmbed", "embed"] });
  await expect(requireImageSpace(ctx, ownerId)).rejects.toMatchObject({ code: SEARCH_NO_SPACE });
});

test("§10-3 an image-capable embedder keeps the image arm — the query rides imageEmbed", async () => {
  const { ctx, ownerId } = await drive();
  expect(await requireImageSpace(ctx, ownerId)).toEqual({ via: "imageEmbed", model: "test-image-embed-model" });
});

test("§10-3 NO imageEmbed binding falls back to the captioned-text lens in the owner's EMBED space", async () => {
  const { ctx, ownerId } = await drive({ unbound: ["imageEmbed"] });
  expect(await requireImageSpace(ctx, ownerId)).toEqual({ via: "embed", model: "test-embed-model" });
});

test("§10-3 a BOUND imageEmbed model that takes no image input falls back the same way", async () => {
  // The second cause, and the one a bare "is it bound?" check misses entirely: the slot is filled, the
  // resolve succeeds, and the model still cannot accept a picture.
  const { ctx, ownerId } = await drive({ imageEmbedVision: false });
  expect(await requireImageSpace(ctx, ownerId)).toEqual({ via: "embed", model: "test-embed-model" });
});

test("§10-5 a corpus still in its LAST COMPLETE space refuses instead of scanning the live one", async () => {
  const { db, ctx, ownerId } = await drive();
  // Every scope of the `embed` task completed in an OLD space — the state a binding change leaves behind
  // until the reindex finishes.
  for (const scope of ["cards", "memory", "documents"] as const) {
    await upsertCompletedSpace(db, { ownerId, scope, space: "older-embed-model", now: NOW });
  }
  await expect(requireSpaceModel(ctx, ownerId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });
  // POSITIVE CONTROL in the same db: `imageEmbed` has no stale completion, so it still answers. The refusal
  // is about THIS task's recorded state, not about the table existing.
  expect(await requireSpaceModel(ctx, ownerId, "imageEmbed")).toBe("test-image-embed-model");
});

test("§10-5 a PARTLY-moved corpus also refuses — one lagging scope is enough", async () => {
  const { db, ctx, ownerId } = await drive();
  await upsertCompletedSpace(db, { ownerId, scope: "cards", space: "test-embed-model", now: NOW });
  await upsertCompletedSpace(db, { ownerId, scope: "memory", space: "test-embed-model", now: NOW });
  await upsertCompletedSpace(db, { ownerId, scope: "documents", space: "older-embed-model", now: NOW });
  // `document_chunks` is a third of what an `embed` scan reads. A per-TASK completion flag would have
  // called this space complete and served a scan that silently misses every document.
  await expect(requireSpaceModel(ctx, ownerId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });
});

test("§10-5 once every scope has landed in the live space the read resumes — the swap completes", async () => {
  const { db, ctx, ownerId } = await drive();
  for (const scope of ["cards", "memory", "documents"] as const) {
    await upsertCompletedSpace(db, { ownerId, scope, space: "test-embed-model", now: NOW });
  }
  expect(await requireSpaceModel(ctx, ownerId, "embed")).toBe("test-embed-model");
});

test("§10-5 a box that has never completed a sweep serves the live space — bootstrap, not a silent fallback", async () => {
  const { ctx, ownerId } = await drive();
  // No `embed_space_state` rows at all: everything that exists was written in the live space, so there is
  // nothing to be mid-move between. Refusing here would break every fresh install.
  expect(await requireSpaceModel(ctx, ownerId, "embed")).toBe("test-embed-model");
});
