// The funded-turn scenarios the funding suites share: member-started automatic beats and a two-party host handoff.

import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import type { OwnerStatsView } from "@orb/contracts/stats";
import { connectDevice } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { saveSpeakerConnection, speakerRoom } from "./speaker-funding-physical.ts";

type SpeakerRoom = Awaited<ReturnType<typeof speakerRoom>>;
type Person = SpeakerRoom["h"]["owner"];

export const AUTO_BEATS = 4;
export const NEXT_HOST_KEY = "owned-speaker-next-host-key";

export interface MemberAutoBeats extends AsyncDisposable {
  readonly room: SpeakerRoom;
  readonly member: Person;
  readonly memberBefore: OwnerStatsView | null;
  readonly outcome: TurnOutcome;
}

/** A member's send with the host online starts a two-beat auto round that the host funds. */
export async function memberAutoBeats(): Promise<MemberAutoBeats> {
  await using construction = new AsyncDisposableStack();
  const room = construction.use(
    await speakerRoom(
      { chat: ["Aria begins.", "Bryn replies.", "Aria continues.", "Bryn finishes."] },
      { group: { output: "per-speaker", policy: "list", autoMode: true, autoModeMaxTurns: 2, autoModeDelayMs: 0 } },
    ),
  );
  const { h } = room;
  const member = await invitePerson(h);
  const hostOnline = new AbortController();
  construction.defer(() => hostOnline.abort());
  await connectDevice(h.root, h.owner.userId, hostOnline.signal);
  const memberBefore = await h.root.services.stats.overview(member.userId);
  const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "go" });
  await h.root.settleBackground();
  const lifetime = construction.move();
  return { room, member, memberBefore, outcome, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

export interface TwoPartyHandoff extends AsyncDisposable {
  readonly room: SpeakerRoom;
  readonly nextHost: Person;
  readonly nextConnection: Awaited<ReturnType<typeof saveSpeakerConnection>>;
  readonly before: TurnOutcome;
  readonly after: TurnOutcome;
}

/** The next host sends, takes the room through an accepted handoff, then the original host sends. */
export async function twoPartyHandoff(): Promise<TwoPartyHandoff> {
  await using construction = new AsyncDisposableStack();
  const room = construction.use(
    await speakerRoom(
      { chat: ["The original host funds this.", "The new host funds this."] },
      {
        characters: [createCharacterSchema.parse({ handle: "aria", name: "aria", description: "The traveller aria." })],
        group: { output: "per-speaker", policy: "list" },
      },
    ),
  );
  const { h } = room;
  const nextHost = await invitePerson(h);
  const nextConnection = await saveSpeakerConnection(h, room.peer.baseUrl, "chat", { principal: nextHost, key: NEXT_HOST_KEY });
  for (const person of [h.owner, nextHost]) {
    const online = new AbortController();
    construction.defer(() => online.abort());
    await connectDevice(h.root, person.userId, online.signal);
  }
  const before = await h.root.services.chat.send({ principal: nextHost, chatId: h.chatId, content: "before" });
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: nextHost.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await h.root.services.chat.acceptHostHandoff({ principal: nextHost, chatId: h.chatId });
  const after = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "after" });
  const lifetime = construction.move();
  return { room, nextHost, nextConnection, before, after, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
