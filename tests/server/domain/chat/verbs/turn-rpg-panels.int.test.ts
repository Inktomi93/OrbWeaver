// @subject packages/server/src/domain/chat/substrate/wire-history.ts
// A panel a stored reply wrote as raw HTML joins the game's card window: the newest ride whole, older ones collapse to the
// untitled card stub. Outside a game nothing collapses. Each case runs real turns through prompt assembly and reads the
// provider request the fourth turn sends.
import { cardWireStub } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";
import { coreHttpRoom, coreProse } from "../engine/core-physical.ts";
import { turnRpgReply, turnRpgRoom, turnWireBody } from "./turn-rpg-physical.ts";

const TURNS = 3;
const PROSE = "The keeper reads the ledger.";
const STUB = JSON.stringify(cardWireStub(null)).slice(1, -1);

function mood(turn: number): string {
  return `Mood ${String(turn)}: wary`;
}

// A styled block the reply frame draws as a panel (D354), then prose.
function panelReply(turn: number): string {
  return `<div class="hud" style="border-left:2px solid #F4A261">\n<p>${mood(turn)}</p>\n</div>\n\n${PROSE} Turn ${String(turn)}.`;
}

const ROWS = [
  { label: "a game keeping no card whole collapses every stored panel", game: true, keep: 0, whole: [] },
  { label: "a game keeping one card whole keeps the newest panel", game: true, keep: 1, whole: [3] },
  { label: "a room with no game collapses no panel", game: false, keep: undefined, whole: [1, 2, 3] },
] as const;

test.for(ROWS)("$label", async (row) => {
  const wires: string[] = [];
  const replies = Array.from({ length: TURNS + 1 }, (_, index) => async (request: Request): Promise<Response> => {
    wires.push(JSON.stringify((await turnWireBody(request))["messages"]));
    const text = panelReply(index + 1);
    return row.game ? turnRpgReply(text) : coreProse(text);
  });
  await using h = row.game ? await turnRpgRoom(replies) : await coreHttpRoom(replies);
  const params = { principal: h.owner, chatId: h.chatId };
  if (row.keep !== undefined) {
    // Immersive cards off, so the turn's notes carry no worked card example to share the window with the panels.
    await h.root.services.rpg.updateConfig({ ...params, patch: { cardKeepLastX: row.keep, immersiveHtml: false } });
  }
  for (let turn = 1; turn <= TURNS + 1; turn += 1) {
    await h.root.services.chat.commitMessage({ ...params, content: `Turn ${String(turn)}, keeper.` });
    expect((await h.root.services.chat.generate(params)).aborted).toBe(false);
    await h.root.settleBackground();
  }
  const last = wires.at(-1) ?? "";
  for (let turn = 1; turn <= TURNS; turn += 1) {
    expect(last.includes(mood(turn)), `turn ${String(turn)} panel`).toBe((row.whole as readonly number[]).includes(turn));
    expect(last.includes(`${PROSE} Turn ${String(turn)}.`), `turn ${String(turn)} prose`).toBe(true);
  }
  expect(last.split(STUB).length - 1).toBe(TURNS - row.whole.length);
  // The reader keeps every panel: only the request collapses them.
  const stored = (await h.root.services.chat.listMessages(params)).messages.map((message) => message.content).join("\n");
  for (let turn = 1; turn <= TURNS; turn += 1) {
    expect(stored).toContain(mood(turn));
  }
});
