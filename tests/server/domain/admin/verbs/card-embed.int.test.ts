// @subject packages/server/src/domain/admin/verbs/card-embed.ts

import "@orb/testkit/node/composed-real.ts";
import { KIND_DEFS } from "@orb/contracts/inference";
import { createAdminCardEmbed } from "@orb/server/domain/admin";
import { testModelId } from "@orb/testkit/iso/inference-identities.ts";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { makeResolved } from "@orb/testkit/node/factories/resolved-connection.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

test("foreign and textless cards never reach funding or storage; an owned card preserves its Principal and reads the live owner binding", async ({
  db,
  services,
}) => {
  const owner = await seedUser(db, { role: "admin" });
  const stranger = await seedUser(db, { role: "admin" });
  const card = await seedCharacter(db, { ownerId: owner.id, description: "owned card prose" });
  const synthetic = await seedCharacter(db, { ownerId: owner.id, synthetic: true });
  const store = vi
    .fn<Parameters<typeof createAdminCardEmbed>[0]["store"]>()
    .mockImplementation(async (input) => ({ outcome: "written", contentHash: "observed-content", model: input.model }));
  let model = testModelId("embed-first");
  const roleClientsFor = vi.fn<Parameters<typeof createAdminCardEmbed>[0]["roleClientsFor"]>(async () => ({
    resolved: async () => makeResolved({ task: "embed", ownerId: owner.id, model, capability: KIND_DEFS.embedding.floor }),
  }));
  const embed = createAdminCardEmbed({ getCard: services.character.getCard, loadCardText: services.character.loadCardText, store, roleClientsFor });
  const foreign = await embed.embedCharacterCard(principal(stranger.id, { role: stranger.role }), card.id);
  expect(store.mock.calls.map(([input]) => (input.kind === "card" ? input.content : null))).toEqual([]);
  expect(foreign).toBe(false);
  expect(await embed.embedCharacterCard(principal(owner.id, { role: owner.role }), synthetic.id)).toBe(false);
  expect(roleClientsFor).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  const actor = principal(owner.id, { role: owner.role });
  expect(await embed.embedCharacterCard(actor, card.id)).toBe(true);
  model = testModelId("embed-second");
  expect(await embed.embedCharacterCard(actor, card.id)).toBe(true);
  expect(roleClientsFor.mock.calls.map(([userId]) => userId)).toEqual([owner.id, owner.id]);
  expect(
    store.mock.calls.map(([input]) => ({ ownerId: input.ownerId, characterId: input.kind === "card" ? input.characterId : null, model: input.model })),
  ).toEqual([
    { ownerId: owner.id, characterId: card.id, model: testModelId("embed-first") },
    { ownerId: owner.id, characterId: card.id, model: testModelId("embed-second") },
  ]);
  const stored = store.mock.calls[0]?.[0];
  expect(stored?.kind === "card" ? stored.content : null).toContain("owned card prose");
});
