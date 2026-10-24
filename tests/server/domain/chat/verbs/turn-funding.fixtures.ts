// The funded-turn scenarios the funding suites share: member-started automatic beats and a two-party host handoff.

import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import type { OwnerStatsView } from "@orb/contracts/stats";
import type { UserId } from "@orb/kit/ids";
import { vi } from "vitest";
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
  /** The initiator each committed turn's RPG terminal hook received, in commit order. */
  readonly triggeredBy: readonly (UserId | null)[];
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
  h.root.app.presence.connect(h.owner.userId, hostOnline.signal);
  const memberBefore = await h.root.services.stats.overview(member.userId);
  // Observe the real composed collaborator; the default spy calls the actual operation unchanged.
  const completed = vi.spyOn(h.root.app.rpgChatOps, "onTurnCompleted");
  construction.defer(() => completed.mockRestore());
  const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "go" });
  await h.root.settleBackground();
  const triggeredBy = completed.mock.calls.map((call) => call[4].triggeredBy);
  const lifetime = construction.move();
  return { room, member, memberBefore, outcome, triggeredBy, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
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
    h.root.app.presence.connect(person.userId, online.signal);
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
