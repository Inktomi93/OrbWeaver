// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/substrate/wire-history.ts
import { expect, test } from "@orb/testkit/node";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreHttpRoom, coreSse } from "../engine/core-physical.ts";
import { turnRpgReply, turnRpgRoom, turnWireBody } from "./turn-rpg-physical.ts";

const CARD = ':::card title="Terminal"\n<div style="color:red">multi-KB html blob</div>\n:::';
const ROWS = [
  { label: "no game and no card window", game: false },
  { label: "an actual game's explicit zero window", game: true },
] as const;

test.for(ROWS)("stored card delivery preserves $label", async (row) => {
  const wires: string[] = [];
  const reply = async (request: Request): Promise<Response> => {
    wires.push(JSON.stringify((await turnWireBody(request))["messages"]));
    return row.game
      ? turnRpgReply("The keeper reads the terminal.")
      : coreSse([
          coreFrame({ choices: [{ delta: { content: "The keeper reads the terminal." } }] }),
          terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
        ]);
  };
  await using h = row.game ? await turnRpgRoom([reply]) : await coreHttpRoom([reply]);
  const params = { principal: h.owner, chatId: h.chatId };
  if (row.game) {
    await h.root.services.rpg.updateConfig({ ...params, patch: { cardKeepLastX: 0 } });
  }
  const committed = await h.root.services.chat.commitMessage({ ...params, content: `look:\n${CARD}` });
  expect(committed.aborted).toBe(false);
  const stored = committed.messages[0];
  if (stored === undefined) {
    throw new Error("the public card commit did not return its actual row");
  }
  expect(stored.content).toContain("multi-KB html blob");
  const outcome = await h.root.services.chat.generate(params);
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  expect(wires).toHaveLength(1);
  expect(wires[0]?.includes("[card: Terminal]")).toBe(row.game);
  expect(wires[0]?.includes("multi-KB html blob")).toBe(!row.game);
  expect((await h.root.services.chat.listMessages(params)).messages.find((message) => message.id === stored.id)?.content).toContain("multi-KB html blob");
});
