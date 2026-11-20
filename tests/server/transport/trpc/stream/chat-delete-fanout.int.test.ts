// When the host deletes a room, every session that should drop it is told over its real socket: the host's own other sessions (one
// attached to the room, one on the list only), a seated member, and a member removed before the delete, who is told the room died
// but is not sent a list change. Each recipient is read at the bus (what the producer published to its channel) and at the socket
// (the frames that left the server), so a missing signal names the hop that dropped it.
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// @subject packages/server/src/domain/chat/verbs/emit-chat-changed.ts
// @subject packages/server/src/transport/trpc/stream/sources/chat.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId, UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { Device } from "./_held-room.ts";
import { admit, openDevice, openRoom } from "./_held-room.ts";

/** What a recipient's bus channels carried from the moment it was opened: the user's own channel and the room's. */
interface BusTrace {
  readonly user: UserBusEvent[];
  readonly room: ChatBusEvent[];
}

const isDeletion = (event: ChatBusEvent, chatId: ChatId): boolean => event.type === "chatDeleted" && event.chatId === chatId;
const isListChange = (event: UserBusEvent, chatId: ChatId): boolean => event.type === "chatsChanged" && event.chatId === chatId;

test("a deleted room is told to the host's other sessions and a seated member, and a removed member learns only that the room died", async () => {
  await using room = await openRoom();
  await using watching = new AsyncDisposableStack();
  const stop = new AbortController();
  const loops: Promise<void>[] = [];
  const devices: Device[] = [];
  watching.defer(async () => {
    stop.abort();
    await Promise.allSettled([...loops, ...devices.map((device) => device.close())]);
  });
  const trace = (userId: UserId): BusTrace => {
    const seen: BusTrace = { user: [], room: [] };
    const buses = room.root.app.liveBuses;
    loops.push(
      (async (): Promise<void> => {
        for await (const event of buses.user.subscribeUserEvents(userId, stop.signal)) {
          seen.user.push(event);
        }
      })(),
      (async (): Promise<void> => {
        for await (const { event } of buses.chat.subscribeChatEvents(room.chatId, stop.signal)) {
          seen.room.push(event);
        }
      })(),
    );
    return seen;
  };

  const member = await admit(room, "fanout-member");
  const removed = await admit(room, "fanout-removed");
  const host = room.host.userId;
  const bus = { host: trace(host), member: trace(member.id), removed: trace(removed.id) };

  // The host's two sessions, the member's, and the removed member's, as the browser attaches them: the room and the user's own channel.
  const sockets = {
    hostInRoom: await openDevice(room, room.hostSeat),
    hostOnList: await openDevice(room, room.hostSeat),
    member: await openDevice(room, member),
    removed: await openDevice(room, removed),
  };
  devices.push(...Object.values(sockets));
  await sockets.hostInRoom.attach();
  await sockets.hostInRoom.attachUser();
  await sockets.hostOnList.attachUser();
  await sockets.member.attach();
  await sockets.member.attachUser();
  await sockets.removed.attach();
  await sockets.removed.attachUser();

  // Each socket's own barrier on its user channel: a tag made by that account, whose event follows everything queued for it before.
  const barrier = async (device: Device, userId: UserId): Promise<void> => {
    const caller = await room.root.internalCallerFor(userId);
    const tag = await caller.tag.createTag({ input: { name: `fanout-barrier-${room.root.ids.uuid()}` } });
    await device.waitForUser((events) => events.some((event) => event.tagId === tag.id));
  };
  const settle = async (): Promise<void> => {
    await barrier(sockets.hostInRoom, host);
    await barrier(sockets.hostOnList, host);
    await barrier(sockets.member, member.id);
    await barrier(sockets.removed, removed.id);
  };

  // Removed before the delete: the kick fans its own list change, so only what follows the settled state is read as the delete's fan.
  const hostCaller = await room.root.internalCallerFor(host);
  await room.root.services.chat.kick({ principal: room.host, chatId: room.chatId, userId: removed.id });
  await settle();
  const before = {
    hostInRoom: sockets.hostInRoom.userEvents.length,
    hostOnList: sockets.hostOnList.userEvents.length,
    member: sockets.member.userEvents.length,
    removed: sockets.removed.userEvents.length,
    bus: { host: bus.host.user.length, member: bus.member.user.length, removed: bus.removed.user.length },
  };

  await hostCaller.chat.delete({ chatId: room.chatId });

  await settle();
  for (const device of [sockets.hostInRoom, sockets.member, sockets.removed]) {
    await device.waitFor((frames) => frames.some(({ event }) => isDeletion(event, room.chatId)));
  }

  const listChanges = (device: Device, from: number): number =>
    device.userEvents.slice(from).filter(({ type, chatId }) => type === "chatsChanged" && chatId === room.chatId).length;
  const busListChanges = (events: readonly UserBusEvent[], from: number): number =>
    events.slice(from).filter((event) => isListChange(event, room.chatId)).length;
  const roomDeaths = (device: Device): number => device.frames.filter(({ event }) => isDeletion(event, room.chatId)).length;

  // The producer published the room's death once, on the live-only lane, and a list change to each member present at the delete.
  expect(bus.host.room.filter((event) => isDeletion(event, room.chatId))).toHaveLength(1);
  expect(busListChanges(bus.host.user, before.bus.host)).toBeGreaterThan(0);
  expect(busListChanges(bus.member.user, before.bus.member)).toBeGreaterThan(0);
  expect(busListChanges(bus.removed.user, before.bus.removed)).toBe(0);

  // (a) the host's second session attached to the deleted room: the room's death and the list change.
  expect(roomDeaths(sockets.hostInRoom)).toBe(1);
  expect(listChanges(sockets.hostInRoom, before.hostInRoom)).toBeGreaterThan(0);
  // (b) the host's session on the list only: the list change.
  expect(listChanges(sockets.hostOnList, before.hostOnList)).toBeGreaterThan(0);
  // (c) a member seated at the delete: both.
  expect(roomDeaths(sockets.member)).toBe(1);
  expect(listChanges(sockets.member, before.member)).toBeGreaterThan(0);
  // (d) a member removed before the delete and still attached: the room's death, and no list change after the kick's own.
  expect(roomDeaths(sockets.removed)).toBe(1);
  expect(listChanges(sockets.removed, before.removed)).toBe(0);
});
