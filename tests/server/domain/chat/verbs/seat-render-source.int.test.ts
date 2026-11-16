// A character seat's render source says which setting resolved its policy: the card's own ladder step, the install
// default it inherits, or a room with no consenting host. A member reads the same source the host does. (`no-card` is the
// read-miss arm only: deleting a card or handing a room over uncopied removes the seat, so no product path reaches it.)
// @subject packages/server/src/domain/chat/verbs/load-participant-views.ts
// @subject packages/server/src/domain/character/verbs/room-projections.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { ParticipantView, RenderPolicy, RenderPolicySource } from "@orb/contracts/chat";
import { renderPolicyOverrideForStep } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

interface SeatRender {
  readonly characterId: ParticipantView["characterId"];
  readonly renderPolicy: RenderPolicy | undefined;
  readonly renderSource: RenderPolicySource | undefined;
}

function seatsOf(participants: readonly ParticipantView[]): readonly SeatRender[] {
  return participants
    .filter((participant) => participant.kind === "character")
    .map(({ characterId, renderPolicy, renderSource }) => ({ characterId, renderPolicy, renderSource }));
}

test("each character seat names the setting that resolved its render policy, for the host and a member alike", async () => {
  await using root = await createServerHarness({ env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" } });
  const host = await root.principalFor((await root.actor()).id);
  const member = await root.principalFor((await root.actor()).id);
  const hostCaller = await root.internalCallerFor(host.userId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const cardNamed = async (handle: string): Promise<CharacterId> =>
    (
      await root.services.character.create({
        principal: host,
        input: createCharacterSchema.parse({ handle, name: handle, description: "A seat in the render-source room." }),
      })
    ).id;
  const own = await cardNamed("own-step");
  const inherited = await cardNamed("inherits-step");
  await hostCaller.character.update({ characterId: own, input: renderPolicyOverrideForStep("untrusted") });
  const seatRoom = async (): Promise<ChatId> => {
    const chatId = (await hostCaller.chat.startChat({ characterIds: [own, inherited], opening: "none" })).chat.id;
    const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
    await memberCaller.invites.acceptInvite({ inviteId: invite.invite.id });
    return chatId;
  };
  const chatId = await seatRoom();
  const hostless = await seatRoom();
  await hostCaller.invites.selfLeave({ chatId: hostless });

  const media = root.services.settings.getEffectiveConfig().forbidExternalMedia;
  const untrusted: RenderPolicy = { htmlTrust: "untrusted", forbidExternalMedia: media };
  // The own step resolves untrusted while the inheriting card beside it takes the install's interactive default, so the
  // two sources differ by the setting that holds them, not only by value.
  const hosted = seatsOf((await memberCaller.chat.getChat({ chatId })).participants);
  expect(hosted).toEqual([
    { characterId: own, renderPolicy: untrusted, renderSource: "own" },
    { characterId: inherited, renderPolicy: { htmlTrust: "interactive", forbidExternalMedia: media }, renderSource: "inherited" },
  ]);
  expect(seatsOf((await hostCaller.chat.getChat({ chatId })).participants)).toEqual(hosted);
  // No consenting host: every seat takes the install floor and says why, whatever its card stored.
  const floorOf = (characterId: CharacterId): SeatRender => ({ characterId, renderPolicy: untrusted, renderSource: "no-host" });
  expect(seatsOf((await memberCaller.chat.getChat({ chatId: hostless })).participants)).toEqual([floorOf(own), floorOf(inherited)]);
});
