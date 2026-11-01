// Turns overlap in one chat. Whatever ends beside a turn that is inside a hidden span, the member's bytes stay clean
// live, in the stored log and on replay.
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts
// @subject packages/server/src/domain/chat/bus.ts

import { expect, test } from "@orb/testkit/node";
import { ended, leaks, memberWatching, openRoom, textOf, tokenCount } from "./_held-room.ts";

const LIVE_CLOSE = "The close lands live.";

test("a member's send refused by the lock inside a host's hidden span leaks nothing of it", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "scrub-refused");
  try {
    const turn = room.send();
    await room.tokensLogged();
    await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: "A member speaks mid-span." });
    room.reply().release();
    await turn;
    await device.waitFor((frames) => textOf(frames).includes(LIVE_CLOSE));
    expect(await leaks(room, device, guest)).toEqual([]);
  } finally {
    await device.close();
  }
});

test("a generate finishing inside a host's hidden span leaks nothing of it", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "scrub-generate");
  try {
    const turn = room.send();
    await room.tokensLogged();
    const held = room.reply();
    room.answerWith("A side reply lands.");
    await room.root.services.chat.generate({ principal: room.host, chatId: room.chatId });
    held.release();
    await turn;
    await device.waitFor((frames) => textOf(frames).includes(LIVE_CLOSE));
    expect(await leaks(room, device, guest)).toEqual([]);
  } finally {
    await device.close();
  }
});

test("a member's Stop on their own generate inside a host's hidden span leaks nothing of it", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "scrub-stop");
  try {
    const turn = room.send();
    await room.tokensLogged();
    const held = room.reply();
    room.rearm();
    const generating = room.root.services.chat.generate({ principal: guest, chatId: room.chatId });
    await room.tokensLogged(2 * tokenCount);
    await room.root.services.chat.abort({ principal: guest, chatId: room.chatId });
    room.reply().fail();
    await generating.catch(() => undefined);
    await device.waitFor(ended);
    held.release();
    await turn;
    await device.waitFor((frames) => textOf(frames).includes(LIVE_CLOSE));
    expect(await leaks(room, device, guest)).toEqual([]);
  } finally {
    await device.close();
  }
});

test("the host's own Stop inside the span leaks nothing of it", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "scrub-host-stop");
  try {
    const turn = room.send();
    await room.tokensLogged();
    await room.root.services.chat.abort({ principal: room.host, chatId: room.chatId });
    room.reply().fail();
    await turn.catch(() => undefined);
    await device.waitFor(ended);
    expect(await leaks(room, device, guest)).toEqual([]);
  } finally {
    await device.close();
  }
});
