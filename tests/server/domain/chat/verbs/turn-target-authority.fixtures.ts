// A seeded group room with a member, a stranger and a muted seat for turn-target authority cases.

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { textRoom } from "../scenario-physical.ts";

export async function room(): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly member: ChatRoot["owner"];
    readonly stranger: ChatRoot["owner"];
    readonly aria: ChatRoot["characters"][number];
    readonly bryn: ChatRoot["characters"][number];
    readonly claim: Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["commitMessage"]>>["messages"][number];
  }
> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await textRoom(["Hi there", " more"], {
      server: { random: () => 0.99 },
      characters: ["aria", "bryn"].map((name) => createCharacterSchema.parse({ handle: name, name, description: `${name} has a public character card.` })),
      group: { output: "per-speaker", policy: "natural" },
    }),
  );
  const aria = h.characters[0];
  const bryn = h.characters[1];
  if (aria === undefined || bryn === undefined) {
    throw new Error("the physical root did not create both characters");
  }
  // These cases start claimed; fresh force-room initialization is a different production contract.
  const posted = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "The room is claimed." });
  const claim = posted.messages[0];
  if (claim === undefined) {
    throw new Error("the public claim produced no user row");
  }
  const member = await h.root.principalFor((await h.root.actor()).id);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const lifetime = construction.move();
  return { h, aria, bryn, member, stranger, claim, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

export async function muteBryn(f: Awaited<ReturnType<typeof room>>): Promise<void> {
  const seat = (await f.h.root.services.chat.listParticipants({ principal: f.h.owner, chatId: f.h.chatId })).find(
    ({ characterId }) => characterId === f.bryn.id,
  );
  if (seat === undefined) {
    throw new Error("the actual roster has no Bryn seat");
  }
  await f.h.root.services.chat.setSeatKnobs({ principal: f.h.owner, chatId: f.h.chatId, participantId: seat.id, patch: { disabled: true } });
}

export async function drain(stream: ReturnType<ChatRoot["root"]["services"]["chat"]["impersonateStream"]>): Promise<void> {
  for await (const _delta of stream) {
    /* Drain the actual public iterator so its ownership guard executes. */
  }
}
