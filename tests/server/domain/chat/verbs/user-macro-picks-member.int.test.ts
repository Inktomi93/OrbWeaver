// A room member reads which authoring home declared each pickable macro as a kind alone: never the host's preset
// name or id, never the macro body.
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// @subject packages/contracts/src/chat/views.ts

import { expect, test } from "@orb/testkit/node";
import { seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/composed";
import { textRoom } from "../scenario-physical.ts";
import { MOOD_CONFIG } from "./turn-lifetimes-macro-data.ts";

const PRIVATE_PRESET_NAME = "Host-only mood preset";

test("a member's picks read names the home as a kind and carries neither the host's preset name or id nor the macro body", async () => {
  await using h = await textRoom([]);
  const preset = await h.caller.preset.create({ name: PRIVATE_PRESET_NAME, kind: "custom", config: MOOD_CONFIG });
  await h.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });

  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await seedChatInvite(h.root, { principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipant(h.root, { principal: member, inviteId: invite.invite.id });

  const view = await (await h.root.internalCallerFor(member.userId)).chat.getUserMacroPicks({ chatId: h.chatId });
  expect(view.macros.map((macro) => ({ name: macro.name, source: macro.source, keys: Object.keys(macro).toSorted() }))).toEqual([
    { name: "mood", source: "preset", keys: ["description", "inputs", "name", "source"] },
  ]);
  const wire = JSON.stringify(view);
  expect(wire).not.toContain(PRIVATE_PRESET_NAME);
  expect(wire).not.toContain(preset.id);
  expect(wire).not.toContain("{{tone}}");
});
