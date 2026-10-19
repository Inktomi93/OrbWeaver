// A present member reads a roster card through the one D22 clamp; the host reads it in full.
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/substrate/auth/clamp.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const DESCRIPTION = "member-card-sheet-description";
const STEERING = "member-card-host-only-steering";

test("the member-card level clamps a member's roster card read at the real door and never clamps the host", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny" } });
  const host = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const outsider = await root.internalCallerFor((await root.actor()).id);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const card = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "member-card-clamp", name: "Clamped", description: DESCRIPTION, systemPrompt: STEERING }),
  });
  const chatId = (await hostCaller.chat.startChat({ characterIds: [card.id], opening: "none" })).chat.id;
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
  const read = { chatId, characterId: card.id, timeZone: UTC_TIME_ZONE };

  await hostCaller.chat.setGroupConfig({ chatId, config: { ...DEFAULT_GROUP_CONFIG, memberCardVisibility: "name-avatar" } });
  expect(await memberCaller.chat.getMemberCard(read)).toMatchObject({ visibility: "name-avatar", name: "Clamped", description: null, systemPrompt: null });
  expect(await hostCaller.chat.getMemberCard(read)).toMatchObject({ visibility: "full", description: DESCRIPTION, systemPrompt: STEERING });

  await hostCaller.chat.setGroupConfig({ chatId, config: { ...DEFAULT_GROUP_CONFIG, memberCardVisibility: "sheet" } });
  expect(await memberCaller.chat.getMemberCard(read)).toMatchObject({ visibility: "sheet", description: DESCRIPTION, systemPrompt: null });
  await expect(outsider.chat.getMemberCard(read)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
