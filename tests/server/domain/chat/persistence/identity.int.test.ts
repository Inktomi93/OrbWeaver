// @subject packages/server/src/domain/chat/persistence/identity.ts
// The room's identity set is read through its two public doors, `getChat` and `listMessages`; no row is read or written
// here. Coverage is member-gated: every id the room's roster, pin or stored lines name resolves, whoever owns it.
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatIdentity } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

type Principal = ChatRoot["owner"];

async function avatarHash(
  h: ChatRoot,
  principal: Principal,
): Promise<{ readonly assetId: Awaited<ReturnType<ChatRoot["root"]["services"]["assets"]["store"]>>["assetId"]; readonly hash: string }> {
  const stored = await h.root.services.assets.store({
    principal,
    bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
    kind: "avatar",
    mime: "image/png",
  });
  return { assetId: stored.assetId, hash: stored.hash };
}

async function character(h: ChatRoot, handle: string, avatar?: Awaited<ReturnType<typeof avatarHash>>): Promise<CharacterId> {
  const view = await h.root.services.character.create({
    principal: h.owner,
    input: createCharacterSchema.parse({
      handle,
      name: handle,
      description: `${handle} description`,
      ...(avatar === undefined ? {} : { avatarAssetId: avatar.assetId }),
    }),
  });
  return view.id;
}

async function persona(h: ChatRoot, principal: Principal, name: string, avatar?: Awaited<ReturnType<typeof avatarHash>>): Promise<PersonaId> {
  const view = await h.root.services.persona.create({
    principal,
    input: createPersonaSchema.parse({ name, description: `${name} description`, ...(avatar === undefined ? {} : { avatarAssetId: avatar.assetId }) }),
  });
  return view.id;
}

async function room(
  h: ChatRoot,
  characterIds: readonly CharacterId[],
): Promise<Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["startChat"]>>["chat"]["id"]> {
  return (await h.root.services.chat.startChat({ principal: h.owner, characterIds: [...characterIds], opening: "none" })).chat.id;
}

function entry(identities: readonly ChatIdentity[], id: string): ChatIdentity | undefined {
  return identities.find((identity) => identity.id === id);
}

test("a roster character and a seat persona each resolve with their kind, and an avatar-less entity keeps a null hash", async () => {
  await using h = await textRoom(["unused"]);
  const portrait = await avatarHash(h, h.owner);
  const aria = await character(h, "iris", portrait);
  const bare = await character(h, "bare");
  const nyx = await persona(h, h.owner, "nyx");
  const chatId = await room(h, [aria, bare]);
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId, personaId: nyx });

  const { identities } = await h.root.services.chat.getChat({ principal: h.owner, chatId });

  expect(entry(identities, aria)).toEqual({ kind: "character", id: aria, name: "iris", avatarHash: portrait.hash });
  expect(entry(identities, bare)).toEqual({ kind: "character", id: bare, name: "bare", avatarHash: null });
  expect(entry(identities, nyx)).toEqual({ kind: "persona", id: nyx, name: "nyx", description: "nyx description", avatarHash: null });
  expect(identities).toHaveLength(3);
});

test("a room naming no character, seat persona or pin has an empty identity set", async () => {
  await using h = await textRoom(["unused"]);
  const chatId = await room(h, []);
  expect((await h.root.services.chat.getChat({ principal: h.owner, chatId })).identities).toEqual([]);
});

test("a persona that signed a line but no longer holds a seat still resolves in the transcript's identities", async () => {
  await using h = await textRoom(["unused"]);
  const portrait = await avatarHash(h, h.owner);
  const worn = await persona(h, h.owner, "worn");
  const old = await persona(h, h.owner, "mira", portrait);
  const chatId = await room(h, [await character(h, "kai")]);
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId, personaId: old });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId, content: "signed by mira" });
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId, personaId: worn });
  // `worn` both holds the seat and signs a line, so one id is named twice.
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId, content: "signed by worn" });

  const { identities } = await h.root.services.chat.listMessages({ principal: h.owner, chatId });

  // The seat now wears `worn`; the stored line still carries `old`, and both must resolve.
  expect(
    identities
      .filter(({ kind }) => kind === "persona")
      .map(({ id }) => id)
      .toSorted(),
  ).toEqual([worn, old].toSorted());
  expect(entry(identities, old)?.avatarHash).toBe(portrait.hash);
});

test("a removed character keeps the portrait its stored lines still show", async () => {
  await using h = await textRoom(["Iris speaks."]);
  const portrait = await avatarHash(h, h.owner);
  const aria = await character(h, "iris", portrait);
  const bryn = await character(h, "bryn");
  const chatId = await room(h, [aria, bryn]);
  const turn = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId, characterId: aria });
  expect(turn.aborted).toBe(false);
  expect(entry((await h.root.services.chat.listMessages({ principal: h.owner, chatId })).identities, aria)?.avatarHash).toBe(portrait.hash);

  await h.root.services.chat.removeCharacterFromChat({ principal: h.owner, chatId, characterId: aria });

  const { identities, messages } = await h.root.services.chat.listMessages({ principal: h.owner, chatId });
  expect(
    (await h.root.services.chat.getChat({ principal: h.owner, chatId })).participants.some((seat) => seat.kind === "character" && seat.characterId === aria),
  ).toBe(false);
  expect(messages.some(({ role }) => role === "assistant")).toBe(true);
  expect(entry(identities, aria)).toEqual({ kind: "character", id: aria, name: "iris", avatarHash: portrait.hash });
});

test("a member's persona resolves in the host's room with its own name and avatar; the set is not owner-scoped", async () => {
  await using h = await textRoom(["unused"]);
  const hostFace = await avatarHash(h, h.owner);
  const hostPersona = await persona(h, h.owner, "host_pov", hostFace);
  const chatId = await room(h, [await character(h, "kai")]);
  const member = await invitePerson({ ...h, chatId });
  const memberFace = await avatarHash(h, member);
  const memberPersona = await persona(h, member, "member_pov", memberFace);
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId, personaId: hostPersona });
  await h.root.services.persona.setActivePersona({ principal: member, chatId, personaId: memberPersona });

  const { identities } = await h.root.services.chat.getChat({ principal: h.owner, chatId });

  expect(entry(identities, hostPersona)).toMatchObject({ kind: "persona", name: "host_pov", avatarHash: hostFace.hash });
  expect(entry(identities, memberPersona)).toMatchObject({ kind: "persona", name: "member_pov", avatarHash: memberFace.hash });
  // The member reads the same set: it follows the room, not the reader.
  expect((await h.root.services.chat.getChat({ principal: member, chatId })).identities).toEqual(identities);
});

test("a pinned persona whose owner left the room still resolves for the room that holds the pin", async () => {
  await using h = await textRoom(["unused"]);
  const pinned = await persona(h, h.owner, "founder_pov");
  const chatId = await room(h, [await character(h, "kai")]);
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId, personaId: pinned });
  const member = await invitePerson({ ...h, chatId });
  expect((await h.root.services.chat.getChat({ principal: h.owner, chatId })).anchorState).toBe("live");
  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId, userId: member.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: member, chatId });
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId });

  const view = await h.root.services.chat.getChat({ principal: member, chatId });

  // No seat and no stored line names the founder's persona: only the pin does.
  expect(view.participants.some((seat) => seat.userId === h.owner.userId)).toBe(false);
  expect(view.anchorPersonaId).toBe(pinned);
  expect(entry(view.identities, pinned)).toMatchObject({ kind: "persona", name: "founder_pov" });
  expect(view.anchorState).toBe("held");

  await h.root.services.chat.setChatAnchorPersona({ principal: member, chatId, personaId: null });
  expect((await h.root.services.chat.getChat({ principal: member, chatId })).anchorState).toBe("none");
});
