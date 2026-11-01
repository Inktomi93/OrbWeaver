// The react tool a turn offers stores one message_reactions row on the character seat, a repeat adds none, and
// turning reactions off refuses the tool while the stored row stays.
// @subject packages/server/src/entry/compose/chat-tools.ts

import { CHAT_REACT_TOOL_NAME, reactToolArgsSchema } from "@orb/contracts/chat";
import { messageReactions } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreProse, coreSse } from "../engine/core-physical.ts";
import { turnToolsRoom } from "../verbs/turn-rpg-physical.ts";

const REACT_ARGUMENTS = JSON.stringify(reactToolArgsSchema.parse({ character: "Aria", emoji: "👍" }));

function reactCalls(...ids: readonly string[]): Response {
  return coreSse([
    coreFrame({
      choices: [
        {
          delta: {
            ["tool_calls"]: ids.map((id, index) => ({ index, id, type: "function", function: { name: CHAT_REACT_TOOL_NAME, arguments: REACT_ARGUMENTS } })),
          },
        },
      ],
    }),
    terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 4, completionTokens: 2 } }),
  ]);
}

test("the react tool a turn runs attributes the character seat, preserves repeat data, and rechecks changed room posture", async () => {
  await using h = await turnToolsRoom([
    (): Response => reactCalls("react-fresh", "react-repeat"),
    (): Response => coreProse("Reacted."),
    async (): Promise<Response> => {
      // The room turns reactions off after the turn offered the tool and before the model's call runs.
      await h.root.services.chat.setReactionsEnabled({ principal: h.owner, chatId: h.chatId, enabled: false });
      return reactCalls("react-refused");
    },
    (): Response => coreProse("Refused."),
  ]);
  const { chatId, owner } = h;
  await h.root.services.chat.setReactionsEnabled({ principal: owner, chatId, enabled: true });
  await h.root.services.chat.setCharactersCanReact({ principal: owner, chatId, enabled: true });
  const characterSeat = (await h.root.services.chat.getChat({ principal: owner, chatId })).participants.find(
    (seat) => seat.characterId === h.characters[0]?.id,
  )?.id;
  if (characterSeat === undefined) {
    throw new Error("the room seated no character");
  }

  await h.root.services.chat.commitMessage({ principal: owner, chatId, content: "A real target for the character reaction." });
  const first = await h.root.services.chat.generate({ principal: owner, chatId });
  expect(first.aborted).toBe(false);
  expect(first.messages[0]?.toolCalls.map(({ toolCallId, isError, result }) => ({ toolCallId, isError, result }))).toEqual([
    {
      toolCallId: "react-fresh",
      isError: false,
      result: JSON.stringify({ reacted: true, alreadyReacted: false, character: "Aria", emoji: "👍", target: "the whole message" }),
    },
    {
      toolCallId: "react-repeat",
      isError: false,
      result: JSON.stringify({ reacted: false, alreadyReacted: true, character: "Aria", emoji: "👍", target: "the whole message" }),
    },
  ]);
  expect((await h.root.db.select().from(messageReactions)).map((row) => row.reactorParticipantId)).toEqual([characterSeat]);

  await h.root.services.chat.commitMessage({ principal: owner, chatId, content: "Another target, after reactions are off." });
  const second = await h.root.services.chat.generate({ principal: owner, chatId });
  expect(second.aborted).toBe(false);
  expect(second.messages[0]?.toolCalls).toMatchObject([
    { toolCallId: "react-refused", isError: true, result: JSON.stringify({ error: "Reactions by characters are turned off in this chat." }) },
  ]);
  expect((await h.root.db.select().from(messageReactions)).map((row) => row.reactorParticipantId)).toEqual([characterSeat]);
});
