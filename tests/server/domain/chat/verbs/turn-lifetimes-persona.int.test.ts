// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/verbs/participants.ts
import { expect, test } from "@orb/testkit/node";
import { attachPersonaLore, invitePerson, personaInputs, personaRoom, seatPersona } from "../persona-cache-physical.ts";

const HOST_LORE = "HOST-PERSONA-ONLY-LORE";
const MEMBER_LORE = "MEMBER-PERSONA-ONLY-LORE";

test("the host's disabled member-persona-lore policy also excludes the initiating member's own book", async () => {
  await using h = await personaRoom(["The keeper answers the member."], { group: { output: "per-speaker", policy: "list" } });
  const member = await invitePerson(h);
  const hostPersona = await seatPersona(h, h.owner, "Host POV", "The host's established voice.");
  const memberPersona = await seatPersona(h, member, "Member POV", "The member's own voice.");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: hostPersona.id });
  await attachPersonaLore(h, h.owner, hostPersona.id, HOST_LORE);
  await attachPersonaLore(h, member, memberPersona.id, MEMBER_LORE);
  expect(await h.root.services.chat.setMemberPersonaLore({ principal: h.owner, chatId: h.chatId, enabled: false })).toBe(false);
  const online = new AbortController();
  using presence = new DisposableStack();
  presence.defer(() => online.abort());
  h.root.app.presence.connect(h.owner.userId, online.signal);
  const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "Ask the keeper." });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter(({ role }) => role === "user")).toMatchObject([{ authorUserId: member.userId, personaId: memberPersona.id }]);
  expect(outcome.messages.filter(({ role }) => role === "assistant")).toMatchObject([{ content: "The keeper answers the member." }]);
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(1);
  const wire = JSON.stringify(inputs[0]);
  expect(wire).toContain(HOST_LORE);
  expect(wire).not.toContain(MEMBER_LORE);
});
