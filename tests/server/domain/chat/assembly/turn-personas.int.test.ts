// The production turn binder composes with the production consent/pin read over a real database.

import { createPersonaSchema } from "@orb/contracts/persona";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { UserId } from "@orb/kit/ids";
import { createTurnPersonaResolver } from "@orb/server/domain/chat";
import { createResolvePersonasForParticipants } from "@orb/server/domain/persona";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { seedChat, seedPersona } from "@orb/testkit/node/composed";

async function seededPersona(harness: ServerTestHarness, ownerId: UserId, name: string): Promise<Awaited<ReturnType<typeof seedPersona>>["row"]> {
  const principal = await harness.principalFor(ownerId);
  return (await seedPersona(harness, { principal, input: createPersonaSchema.parse({ name, description: "" }) })).row;
}

async function anchoredRoom(
  harness: ServerTestHarness,
  hostId: UserId,
  anchorPersonaId: Awaited<ReturnType<typeof seededPersona>>["id"],
): Promise<Awaited<ReturnType<typeof seedChat>>["row"]> {
  const principal = await harness.principalFor(hostId);
  return (await seedChat(harness, { principal, characterIds: [], anchorPersonaId })).row;
}

test("a trigger with no seat persona cannot borrow the room's anchor identity", async ({ harness, db }): Promise<void> => {
  const host = await harness.actor();
  const member = await harness.actor();
  const anchor = await seededPersona(harness, host.id, "Anchor");
  const room = await anchoredRoom(harness, host.id, anchor.id);
  const resolve = createTurnPersonaResolver(createResolvePersonasForParticipants({ db: databaseHandle(db) }));

  const result = await resolve({
    chatId: room.id,
    runAsUserId: host.id,
    anchorPersonaId: anchor.id,
    presentHumanUserIds: [host.id, member.id],
    humanSeats: [
      { userId: host.id, personaId: anchor.id },
      { userId: member.id, personaId: null },
    ],
    trigger: { kind: "human", userId: member.id, personaId: null },
    voice: "trigger",
  });

  expect(result.active).toBeNull();
  expect(result.activeUserId).toBe(member.id);
  expect(result.anchor?.name).toBe("Anchor");
  expect(result.people?.map((persona) => persona.name)).toEqual(["Anchor"]);
});

test("a held departed-owner pin remains the card identity but cannot authorize a foreign active persona", async ({ harness, db }): Promise<void> => {
  const host = await harness.actor();
  const departed = await harness.actor();
  const stranger = await harness.actor();
  const pin = await seededPersona(harness, departed.id, "Held pin");
  const foreign = await seededPersona(harness, stranger.id, "Private stranger");
  // The pin's owner founded the room; production refuses an anchor the starter does not own.
  const room = await anchoredRoom(harness, departed.id, pin.id);
  const resolve = createTurnPersonaResolver(createResolvePersonasForParticipants({ db: databaseHandle(db) }));

  const result = await resolve({
    chatId: room.id,
    runAsUserId: host.id,
    anchorPersonaId: pin.id,
    presentHumanUserIds: [host.id],
    humanSeats: [{ userId: host.id, personaId: foreign.id }],
    trigger: { kind: "none" },
    voice: "anchor",
  });

  expect(result.anchor?.name).toBe("Held pin");
  expect(result.active).toBeNull();
  expect(result.activeUserId).toBe(host.id);
  expect(result.people).toBeUndefined();
});

test("canon follows the anchor owner's current seat while impersonation follows the triggering member", async ({ harness, db }): Promise<void> => {
  const host = await harness.actor();
  const member = await harness.actor();
  const anchor = await seededPersona(harness, host.id, "Pinned");
  const current = await seededPersona(harness, host.id, "Host current");
  const memberPersona = await seededPersona(harness, member.id, "Member current");
  const room = await anchoredRoom(harness, host.id, anchor.id);
  const resolve = createTurnPersonaResolver(createResolvePersonasForParticipants({ db: databaseHandle(db) }));
  const args = {
    chatId: room.id,
    runAsUserId: host.id,
    anchorPersonaId: anchor.id,
    presentHumanUserIds: [host.id, member.id],
    humanSeats: [
      { userId: host.id, personaId: current.id },
      { userId: member.id, personaId: memberPersona.id },
    ],
    trigger: { kind: "human", userId: member.id, personaId: memberPersona.id } as const,
  };

  const canon = await resolve({ ...args, voice: "anchor" });
  const draft = await resolve({ ...args, voice: "trigger" });
  expect(canon.active?.name).toBe("Host current");
  expect(canon.activeUserId).toBe(host.id);
  expect(canon.people?.map((persona) => persona.name)).toEqual(["Member current"]);
  expect(draft.active?.name).toBe("Member current");
  expect(draft.activeUserId).toBe(member.id);
  expect(draft.people?.map((persona) => persona.name)).toEqual(["Host current"]);
  expect(draft.anchor).toEqual(canon.anchor);
});
