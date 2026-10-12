// The production turn binder composes with the production consent/pin read over a real database.
import { createTurnPersonaResolver } from "@orb/server/domain/chat";
import { createResolvePersonasForParticipants } from "@orb/server/domain/persona";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { seedPersona } from "@orb/testkit/node/factories/persona.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("a trigger with no seat persona cannot borrow the room's anchor identity", async ({ db }): Promise<void> => {
  const host = await seedUser(db);
  const member = await seedUser(db);
  const anchor = await seedPersona(db, { ownerId: host.id, name: "Anchor" });
  const room = await seedChat(db, { anchorPersonaId: anchor.id });
  const resolve = createTurnPersonaResolver(createResolvePersonasForParticipants({ db }));

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

test("a held departed-owner pin remains the card identity but cannot authorize a foreign active persona", async ({ db }): Promise<void> => {
  const host = await seedUser(db);
  const departed = await seedUser(db);
  const stranger = await seedUser(db);
  const pin = await seedPersona(db, { ownerId: departed.id, name: "Held pin" });
  const foreign = await seedPersona(db, { ownerId: stranger.id, name: "Private stranger" });
  const room = await seedChat(db, { anchorPersonaId: pin.id });
  const resolve = createTurnPersonaResolver(createResolvePersonasForParticipants({ db }));

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

test("canon follows the anchor owner's current seat while impersonation follows the triggering member", async ({ db }): Promise<void> => {
  const host = await seedUser(db);
  const member = await seedUser(db);
  const anchor = await seedPersona(db, { ownerId: host.id, name: "Pinned" });
  const current = await seedPersona(db, { ownerId: host.id, name: "Host current" });
  const memberPersona = await seedPersona(db, { ownerId: member.id, name: "Member current" });
  const room = await seedChat(db, { anchorPersonaId: anchor.id });
  const resolve = createTurnPersonaResolver(createResolvePersonasForParticipants({ db }));
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
