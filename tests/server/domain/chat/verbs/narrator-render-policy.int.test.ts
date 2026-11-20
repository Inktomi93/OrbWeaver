// A narrator row is one generation voicing every character in the room, stamped with the host's synthetic group
// character, which holds no seat. Its render policy is the most restrictive among the present character seats, resolved
// on the roster read, the same for the host and a member, and the card frame's author read agrees with it.
// @subject packages/server/src/domain/chat/substrate/chat-detail.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { RenderPolicy } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, renderPolicyOverrideForStep } from "@orb/contracts/chat";
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

async function narratorRenderFor(h: ChatRoot, principal: Principal): Promise<unknown> {
  return (await h.root.services.chat.getChat({ principal, chatId: h.chatId })).narratorRender;
}

test("a narrator row's author holds no seat, and the row resolves to the least-trusted present character for the host and a member", async () => {
  await using h = await textRoom([CARD], { characters: CAST, group: NARRATED });
  const aria = present(h.characters[0]);
  const kai = present(h.characters[1]);
  // Aria's own step is Render HTML; Kai inherits the install's interactive default, the higher step.
  await h.caller.character.update({ characterId: aria.id, input: renderPolicyOverrideForStep("trusted") });
  const member = await invitePerson(h);
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on." })).aborted).toBe(false);

  const narrated = present((await readRoomCanon(h.root, member, h.chatId)).at(-1));
  expect(narrated).toMatchObject({ kind: "narrator", role: "assistant", content: CARD });
  const author = present(narrated.characterId);
  const seats = (await h.root.services.chat.getChat({ principal: member, chatId: h.chatId })).participants;
  expect(seats.filter(({ kind }) => kind === "character").map(({ characterId }) => characterId)).toEqual([aria.id, kai.id]);
  expect(seats.map(({ characterId }) => characterId)).not.toContain(author);

  const bound = { renderPolicy: policyOf(h, "trusted"), renderSource: "own", characterId: aria.id };
  expect(await narratorRenderFor(h, h.owner)).toEqual(bound);
  expect(await narratorRenderFor(h, member)).toEqual(bound);
  // The card frame reads the same policy for the narrator author, and each seat still reads its own.
  expect(await h.root.services.chat.resolveAuthorRenderPolicy({ principal: member, chatId: h.chatId, characterId: author })).toEqual(policyOf(h, "trusted"));
  expect(await h.root.services.chat.resolveAuthorRenderPolicy({ principal: member, chatId: h.chatId, characterId: kai.id })).toEqual(
    policyOf(h, "interactive"),
  );

  // Kai drops below Aria, so Kai now binds every narrator row, for both viewers.
  await h.caller.character.update({ characterId: kai.id, input: renderPolicyOverrideForStep("untrusted") });
  const lowered = { renderPolicy: policyOf(h, "untrusted"), renderSource: "own", characterId: kai.id };
  expect(await narratorRenderFor(h, h.owner)).toEqual(lowered);
  expect(await narratorRenderFor(h, member)).toEqual(lowered);
  expect(await h.root.services.chat.resolveAuthorRenderPolicy({ principal: h.owner, chatId: h.chatId, characterId: author })).toEqual(policyOf(h, "untrusted"));
});

test("a removed character stops binding the narrator policy, and nothing consents once no character or no host remains", async () => {
  await using h = await textRoom([], { characters: CAST, group: NARRATED });
  const aria = present(h.characters[0]);
  const kai = present(h.characters[1]);
  await h.caller.character.update({ characterId: aria.id, input: renderPolicyOverrideForStep("untrusted") });
  await h.caller.character.update({ characterId: kai.id, input: renderPolicyOverrideForStep("trusted") });
  const member = await invitePerson(h);
  expect(await narratorRenderFor(h, member)).toEqual({ renderPolicy: policyOf(h, "untrusted"), renderSource: "own", characterId: aria.id });

  await h.root.services.chat.removeCharacterFromChat({ principal: h.owner, chatId: h.chatId, characterId: aria.id });
  expect(await narratorRenderFor(h, member)).toEqual({ renderPolicy: policyOf(h, "trusted"), renderSource: "own", characterId: kai.id });

  // The host leaves: the remaining seat stays on the roster at the install floor, and no narrator policy applies.
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  const hostless = await h.root.services.chat.getChat({ principal: member, chatId: h.chatId });
  expect(hostless.participants.filter(({ kind }) => kind === "character").map(({ renderSource }) => renderSource)).toEqual(["no-host"]);
  expect(hostless.narratorRender).toBeUndefined();

  await using empty = await textRoom([], { characters: CAST.slice(0, 1), group: NARRATED });
  expect(await narratorRenderFor(empty, empty.owner)).toMatchObject({ characterId: present(empty.characters[0]).id });
  await empty.root.services.chat.removeCharacterFromChat({ principal: empty.owner, chatId: empty.chatId, characterId: present(empty.characters[0]).id });
  expect(await narratorRenderFor(empty, empty.owner)).toBeUndefined();
});
