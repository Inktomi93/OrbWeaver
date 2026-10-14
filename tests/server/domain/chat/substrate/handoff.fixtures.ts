import "@orb/testkit/node/composed-real.ts";
import type { CharacterDetail } from "@orb/contracts/character";
import { createCharacterSchema } from "@orb/contracts/character";
import type { StartChatResult } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { ID_PREFIX } from "@orb/kit/ids";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";

type StoredAsset = Awaited<ReturnType<ServerTestHarness["services"]["assets"]["store"]>>;
export interface HandoffActors {
  readonly host: Principal;
  readonly nominee: Principal;
  readonly chat: StartChatResult["chat"];
  readonly cards: readonly CharacterDetail[];
  readonly avatar: StoredAsset | null;
}

/** Establish the offer through actual creation, targeted invitation and member acceptance. */
export async function handoffActors(harness: ServerTestHarness, withAvatar = false): Promise<HandoffActors> {
  const host = await harness.principalFor((await harness.actor()).id);
  const nominee = await harness.principalFor((await harness.actor()).id);
  const avatar = withAvatar
    ? await harness.services.assets.store({
        principal: host,
        bytes: makeAssetBytes(harness.idSource.typeId(ID_PREFIX.asset)),
        mime: "image/png",
        kind: "avatar",
      })
    : null;
  const first = await harness.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ name: "First gift", handle: "first-gift", description: "", avatarAssetId: avatar?.assetId }),
  });
  const second = await harness.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ name: "Second gift", handle: "second-gift", description: "" }),
  });
  const started = await harness.services.chat.startChat({ principal: host, characterIds: [first.id, second.id], opening: "none" });
  const invitation = await harness.services.chat.createInvite({ principal: host, chatId: started.chat.id, input: { invitedHandle: nominee.handle } });
  await harness.services.chat.acceptInvite({ principal: nominee, inviteId: invitation.invite.id });
  return { host, nominee, chat: started.chat, cards: [first, second], avatar };
}
