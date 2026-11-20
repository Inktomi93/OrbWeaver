// A narrator row is one generation voicing every character in the room, stamped with a synthetic group character,
// which holds no seat. Its render policy is the most restrictive among the present character seats, resolved on the
// roster read, the same for the host and a member. The card frame's author read agrees with it for any group character
// this room's own canon proves a narrator author, including one from before a host handoff, and gives another room's
// group character, an unknown id, a departed member and a stranger nothing that tells them apart.
// @subject packages/server/src/domain/chat/substrate/chat-detail.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/persistence/narrator-author.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { RenderPolicy } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, renderPolicyOverrideForStep } from "@orb/contracts/chat";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

const CARD = ':::card title="Ledger"\n<div style="color:red">The ford ledger.</div>\n:::';
const CAST = [
  createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "Aria is a warden of the ford." }),
  createCharacterSchema.parse({ handle: "kai", name: "Kai", description: "Kai is a wandering bard." }),
];
const NARRATED = { output: "narrator", policy: DEFAULT_GROUP_CONFIG.policy } as const;

type Principal = ChatRoot["owner"];

function policyOf(h: ChatRoot, htmlTrust: RenderPolicy["htmlTrust"]): RenderPolicy {
  return { htmlTrust, forbidExternalMedia: h.root.services.settings.getEffectiveConfig().forbidExternalMedia };
}

async function narratorRenderFor(h: ChatRoot, principal: Principal, chatId: ChatId = h.chatId): Promise<unknown> {
  return (await h.root.services.chat.getChat({ principal, chatId })).narratorRender;
}

async function authorPolicy(h: ChatRoot, principal: Principal, characterId: CharacterId, chatId: ChatId = h.chatId): Promise<RenderPolicy | undefined> {
  return await h.root.services.chat.resolveAuthorRenderPolicy({ principal, chatId, characterId });
}

/** Run one narrator turn as `principal` and return the synthetic character its row is stamped with. */
async function narrate(h: ChatRoot, principal: Principal, chatId: ChatId = h.chatId): Promise<CharacterId> {
  expect((await h.root.services.chat.send({ principal, chatId, content: "Go on." })).aborted).toBe(false);
  const narrated = present((await readRoomCanon(h.root, principal, chatId)).at(-1));
  expect(narrated).toMatchObject({ kind: "narrator", role: "assistant", content: CARD });
  return present(narrated.characterId);
}

async function errorOf(attempt: Promise<unknown>): Promise<unknown> {
  return await attempt.then(
    () => "resolved",
    (error: unknown) => error,
  );
}

test("a narrator row's author holds no seat, and the row resolves to the least-trusted present character for the host and a member", async () => {
  await using h = await textRoom([CARD], { characters: CAST, group: NARRATED });
  const aria = present(h.characters[0]);
  const kai = present(h.characters[1]);
  // Aria's own step is Render HTML; Kai inherits the install's interactive default, the higher step.
  await h.caller.character.update({ characterId: aria.id, input: renderPolicyOverrideForStep("trusted") });
  const member = await invitePerson(h);
  const author = await narrate(h, h.owner);
  const seats = (await h.root.services.chat.getChat({ principal: member, chatId: h.chatId })).participants;
  expect(seats.filter(({ kind }) => kind === "character").map(({ characterId }) => characterId)).toEqual([aria.id, kai.id]);
  expect(seats.map(({ characterId }) => characterId)).not.toContain(author);

  const bound = { renderPolicy: policyOf(h, "trusted"), renderSource: "own", characterIds: [aria.id] };
  expect(await narratorRenderFor(h, h.owner)).toEqual(bound);
  expect(await narratorRenderFor(h, member)).toEqual(bound);
  // The card frame reads the same policy for the narrator author, and each seat still reads its own.
  expect(await authorPolicy(h, member, author)).toEqual(policyOf(h, "trusted"));
  expect(await authorPolicy(h, member, kai.id)).toEqual(policyOf(h, "interactive"));

  // Kai drops below Aria, so Kai now binds every narrator row, for both viewers.
  await h.caller.character.update({ characterId: kai.id, input: renderPolicyOverrideForStep("untrusted") });
  const lowered = { renderPolicy: policyOf(h, "untrusted"), renderSource: "own", characterIds: [kai.id] };
  expect(await narratorRenderFor(h, h.owner)).toEqual(lowered);
  expect(await narratorRenderFor(h, member)).toEqual(lowered);
  expect(await authorPolicy(h, h.owner, author)).toEqual(policyOf(h, "untrusted"));

  // Aria drops to the same step: both bind, in roster order, so the notice can reach each.
  await h.caller.character.update({ characterId: aria.id, input: renderPolicyOverrideForStep("untrusted") });
  expect(await narratorRenderFor(h, member)).toEqual({ ...lowered, characterIds: [aria.id, kai.id] });
});

test("a removed character stops binding the narrator policy, and nothing consents once no character or no host remains", async () => {
  await using h = await textRoom([], { characters: CAST, group: NARRATED });
  const aria = present(h.characters[0]);
  const kai = present(h.characters[1]);
  await h.caller.character.update({ characterId: aria.id, input: renderPolicyOverrideForStep("untrusted") });
  await h.caller.character.update({ characterId: kai.id, input: renderPolicyOverrideForStep("trusted") });
  const member = await invitePerson(h);
  expect(await narratorRenderFor(h, member)).toEqual({ renderPolicy: policyOf(h, "untrusted"), renderSource: "own", characterIds: [aria.id] });

  await h.root.services.chat.removeCharacterFromChat({ principal: h.owner, chatId: h.chatId, characterId: aria.id });
  expect(await narratorRenderFor(h, member)).toEqual({ renderPolicy: policyOf(h, "trusted"), renderSource: "own", characterIds: [kai.id] });

  // The host leaves: the remaining seat stays on the roster at the install floor, and no narrator policy applies.
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  const hostless = await h.root.services.chat.getChat({ principal: member, chatId: h.chatId });
  expect(hostless.participants.filter(({ kind }) => kind === "character").map(({ renderSource }) => renderSource)).toEqual(["no-host"]);
  expect(hostless.narratorRender).toBeUndefined();

  await using empty = await textRoom([], { characters: CAST.slice(0, 1), group: NARRATED });
  expect(await narratorRenderFor(empty, empty.owner)).toMatchObject({ characterIds: [present(empty.characters[0]).id] });
  await empty.root.services.chat.removeCharacterFromChat({ principal: empty.owner, chatId: empty.chatId, characterId: present(empty.characters[0]).id });
  expect(await narratorRenderFor(empty, empty.owner)).toBeUndefined();
});

test("a narrator row from before a host handoff frames at the present room's narrator policy, as its transcript row renders", async () => {
  await using h = await textRoom([CARD], { characters: CAST, group: NARRATED });
  const member = await invitePerson(h);
  const formerAuthor = await narrate(h, h.owner);

  // The handoff drops the former host's characters (D64); the new host seats a card of their own at Render HTML.
  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: member.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: member, chatId: h.chatId });
  const rhea = await h.root.services.character.create({
    principal: member,
    input: createCharacterSchema.parse({ handle: "rhea", name: "Rhea", description: "Rhea keeps the new host's ledger." }),
  });
  await (await h.root.internalCallerFor(member.userId)).character.update({ characterId: rhea.id, input: renderPolicyOverrideForStep("trusted") });
  await h.root.services.chat.addCharacterToChat({ principal: member, chatId: h.chatId, characterId: rhea.id });

  const room = { renderPolicy: policyOf(h, "trusted"), renderSource: "own", characterIds: [rhea.id] };
  for (const viewer of [member, h.owner]) {
    // The transcript row reads the room's narrator policy; the frame read gives the former host's group character it.
    expect(await narratorRenderFor(h, viewer)).toEqual(room);
    expect(await authorPolicy(h, viewer, formerAuthor)).toEqual(room.renderPolicy);
  }
});

test("a member held to their join reads no author from a narrator row below their history floor", async () => {
  await using h = await textRoom([CARD, CARD], { characters: CAST, group: NARRATED });
  const author = await narrate(h, h.owner);
  // A member's floor is inclusive of the row at their join, so one more line puts the narrator row below it.
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "Before anyone else arrives." });
  const member = await invitePerson(h);
  await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: member.userId, visibility: "from-join" });
  // The host reads every row, so the same id proves an author for them.
  expect(await authorPolicy(h, h.owner, author)).toBeDefined();
  expect(await authorPolicy(h, member, author)).toBeUndefined();
  // A narrator row the member can read, by the same author, proves it.
  expect(await narrate(h, h.owner)).toBe(author);
  expect(await authorPolicy(h, member, author)).toEqual(await authorPolicy(h, h.owner, author));
});

test("another room's group character and an unknown id read alike, and a departed member reads like a stranger", async () => {
  await using h = await textRoom([CARD, CARD], { characters: CAST, group: NARRATED });
  const member = await invitePerson(h);
  const author = await narrate(h, h.owner);
  const other = (await h.root.services.chat.startChat({ principal: h.owner, characterIds: h.characters.map(({ id }) => id), opening: "none" })).chat.id;
  await h.root.services.chat.setGroupConfig({ principal: h.owner, chatId: other, config: NARRATED });
  const otherAuthor = await narrate(h, h.owner, other);
  expect(otherAuthor).not.toBe(author);
  const unknown = h.root.idSource.typeId(ID_PREFIX.character);

  // Positive control: each room's own author reads its room's policy.
  const policy = present(await authorPolicy(h, member, author));
  expect(await authorPolicy(h, h.owner, otherAuthor, other)).toEqual(policy);
  // Named in this room, the other room's group character proves nothing, exactly as an id no row carries.
  expect(await authorPolicy(h, member, otherAuthor)).toBeUndefined();
  expect(await authorPolicy(h, member, unknown)).toBeUndefined();

  // The member was never seated in the other room: the refusal there matches a room that does not exist.
  const foreign = await errorOf(authorPolicy(h, member, otherAuthor, other));
  const missing = await errorOf(authorPolicy(h, member, otherAuthor, h.root.idSource.typeId(ID_PREFIX.chat)));
  expect(foreign).toBeInstanceOf(DomainNotFoundError);
  expect(missing).toBeInstanceOf(DomainNotFoundError);

  // A departed member reads this room as a stranger does, for its own author and for a seat alike.
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
  const departed = await errorOf(authorPolicy(h, member, author));
  const outsider = await errorOf(authorPolicy(h, stranger, author));
  expect(departed).toBeInstanceOf(DomainNotFoundError);
  expect(outsider).toBeInstanceOf(DomainNotFoundError);
  expect(departed instanceof Error && outsider instanceof Error && departed.message === outsider.message).toBe(true);
  expect(await errorOf(authorPolicy(h, member, present(h.characters[0]).id))).toBeInstanceOf(DomainNotFoundError);
});

test("a character removed from the room reads no policy for its old rows, whatever the room's narrator policy", async () => {
  // A round with no narrator: each seated card speaks once.
  await using h = await textRoom([CARD, CARD], { characters: CAST });
  const member = await invitePerson(h);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on." })).aborted).toBe(false);
  // The room's own row stamped with a seated card, not a narrator row and not a group character.
  const spoke = present((await readRoomCanon(h.root, h.owner, h.chatId)).findLast((message) => message.role === "assistant" && message.characterId !== null));
  expect(spoke.kind).not.toBe("narrator");
  const speaker = present(spoke.characterId);
  // Positive control: seated, the speaker reads its own seat's policy.
  expect(await authorPolicy(h, member, speaker)).toEqual(policyOf(h, "interactive"));

  await h.root.services.chat.removeCharacterFromChat({ principal: h.owner, chatId: h.chatId, characterId: speaker });
  await h.caller.character.update({ characterId: speaker, input: renderPolicyOverrideForStep("untrusted") });
  // The remaining seat still gives the room an Interactive narrator policy, which the removed card's rows must not take.
  expect(await narratorRenderFor(h, member)).toMatchObject({ renderPolicy: policyOf(h, "interactive") });
  expect(await authorPolicy(h, member, speaker)).toBeUndefined();
});
