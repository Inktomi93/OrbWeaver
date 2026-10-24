// @subject packages/server/src/transport/trpc/routers/chat.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { textRoom } from "../../../domain/chat/scenario-physical.ts";
import { followupRoom } from "../../../domain/chat/verbs/followup-physical.ts";
import { TAIL_ROSTER } from "../../../domain/chat/verbs/turn-lifetimes-roster.ts";
import { clockOptions, KATHMANDU, KATHMANDU_CLOCK, nativeClocks, UTC_CLOCK } from "./turn-lifetimes-clock-physical.ts";

test("the actual caller renders Kathmandu on SEND and maps an unknown viewer zone to UTC", async () => {
  await using h = await textRoom(["The first clock.", "The second clock."], clockOptions());
  expect((await h.caller.chat.send({ chatId: h.chatId, content: "Read the first clock.", timeZone: KATHMANDU })).aborted).toBe(false);
  expect((await h.caller.chat.send({ chatId: h.chatId, content: "Read the fallback clock.", timeZone: "Etc/Unknown" })).aborted).toBe(false);
  expect(await nativeClocks(h)).toEqual([KATHMANDU_CLOCK, UTC_CLOCK]);
});

test("actual auto-continuation and bounded auto-mode retain the initiating sender's zone", async () => {
  await using continuation = await followupRoom(
    [
      { text: "The clock is", finishReason: "length" },
      { text: " still the sender's.", finishReason: "stop" },
    ],
    clockOptions(),
  );
  await continuation.caller.settings.updateUserSettingsSection({ section: "chat", patch: { autoContinue: true, autoContinueRounds: 1 } });
  expect((await continuation.caller.chat.send({ chatId: continuation.chatId, content: "Read this clock.", timeZone: KATHMANDU })).aborted).toBe(false);
  expect(await nativeClocks(continuation)).toEqual([KATHMANDU_CLOCK, KATHMANDU_CLOCK]);
  await using chain = await textRoom(["First complete beat.", "Second complete beat.", "Last complete beat."], {
    ...clockOptions(),
    characters: TAIL_ROSTER.slice(0, 2),
    group: { output: "per-speaker", policy: "list", autoMode: true, autoModeMaxTurns: 1, autoModeDelayMs: 0 },
  });
  expect((await chain.caller.chat.send({ chatId: chain.chatId, content: "Carry this clock through the exchange.", timeZone: KATHMANDU })).aborted).toBe(false);
  await chain.root.settleBackground();
  expect(await nativeClocks(chain)).toEqual([KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK]);
  expect((await readRoomCanon(chain.root, chain.owner, chain.chatId)).filter(({ role }) => role === "assistant")).toHaveLength(3);
});
