// A summary the build drops takes every longer summary built from it along, through the composed root: when an edited
// scene's own summary comes back blank, or an edited group's consolidation does, the stored longer summaries retelling
// the scene as it read before the edit leave the memory view and the next prompt, and the summaries beside them stay.
// Digests come from the production memory build; only the provider edges are scripted (`recall-world.ts`).
// @subject packages/server/src/domain/chat/memory/generate/digests.ts

import type { MemoryView } from "@orb/contracts/chat";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon, SUMMARIZE_TRANSCRIPT_MARKER } from "@orb/testkit/node/composed";
import type { Arc } from "./recall-world.ts";
import { blockOf, generatedText, probe, recallTurn, TURN_INTENT, world } from "./recall-world.ts";

const BOTH = `Tell me about the scene. ${probe("bath")} ${probe("storm")}`;
const MERGED_FACTS = "The scenes merged into one arc.";
// Each consolidation names what it covers, so the prompt shows which stored summary it carries.
const STORM_ARC = "The storm arc was merged into one telling.";
const BATH_ARC = "The bath arc was merged into one telling.";
const EARLY_ARC = "The early story was merged into one telling.";

function listed(view: MemoryView, tier: number, blockIdx: number): boolean {
  return view.items.some((item) => item.key.tier === tier && item.key.blockIdx === blockIdx);
}

function itemAt(view: MemoryView, tier: number, blockIdx: number): MemoryView["items"][number] {
  return present(view.items.find((item) => item.key.tier === tier && item.key.blockIdx === blockIdx));
}

/** Rebuild the room's memory after a canon change: the live pass after a turn, then the corpus sweep. */
async function redigest(w: Awaited<ReturnType<typeof world.build>>): Promise<void> {
  const keeper = present(w.h.characters[0]);
  const turn = await w.h.root.services.chat.forceCharacterTurn({ principal: w.h.owner, chatId: w.h.chatId, characterId: keeper.id, intent: TURN_INTENT });
  expect(turn.aborted).toBe(false);
  await w.h.root.settleBackground();
  await w.sweep({ kind: "memory-backfill", params: {} });
}

/** Rewrite the first transcript line of `arc`'s scene, keeping the marker the scripted summarizer keys on. */
async function editScene(h: ChatRoot, arc: Arc): Promise<void> {
  const line = (await readRoomCanon(h.root, h.owner, h.chatId)).find((message) => message.content.includes(`line-${arc}.`));
  if (line === undefined) {
    throw new Error(`the room holds no ${arc} line`);
  }
  await h.root.services.chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: line.id, content: `line-${arc}. The ${arc} was told again.` });
}

test("an edited scene whose new summary comes back blank takes the longer summary built from it out of the view and the prompt", {
  tags: ["slow"],
}, async () => {
  let blankStorm = false;
  await using w = await world.build({
    mode: "tiered",
    maxTier: 1,
    replyFor: (body) => {
      const scripted = generatedText(body);
      if (scripted.includes(MERGED_FACTS)) {
        return body.includes("arc-storm.") ? scripted.replace(MERGED_FACTS, STORM_ARC) : undefined;
      }
      // A blank re-summary of the edited storm scene: the build drops that summary.
      return blankStorm && body.includes(SUMMARIZE_TRANSCRIPT_MARKER) && body.includes("line-storm.") ? "" : undefined;
    },
  });
  const stormScene = blockOf("storm");
  const stormArc = Math.floor(stormScene / 2);
  const before = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // The premise: the storm scene and the longer summary built from it are both stored, and recall admits the longer one.
  expect(itemAt(before, 1, stormArc).text).toContain(STORM_ARC);
  expect(listed(before, 0, stormScene)).toBe(true);
  expect((await recallTurn(w.h, BOTH)).prompt).toContain(STORM_ARC);

  blankStorm = true;
  await editScene(w.h, "storm");
  await redigest(w);
  const after = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(listed(after, 0, stormScene)).toBe(false);
  expect(listed(after, 1, stormArc)).toBe(false);
  // The summaries beside the dropped ones stay: a different scene and the longer summary over other scenes.
  expect(listed(after, 0, blockOf("bath"))).toBe(true);
  expect(listed(after, 1, 0)).toBe(true);

  const run = await recallTurn(w.h, BOTH);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).not.toContain(STORM_ARC);
  // The control: the room's other memory still reaches the prompt.
  expect(run.prompt).toContain(MERGED_FACTS);
});

test("an edited group whose consolidation comes back blank takes the longer summaries above it out of the view and the prompt", {
  tags: ["slow"],
}, async () => {
  let blankBathArc = false;
  await using w = await world.build({
    mode: "tiered",
    maxTier: 2,
    replyFor: (body) => {
      const scripted = generatedText(body);
      if (!scripted.includes(MERGED_FACTS)) {
        return;
      }
      // The consolidation over the bath arc's own summary is the longer one; the bath arc's is over the scenes.
      if (body.includes(BATH_ARC)) {
        return scripted.replace(MERGED_FACTS, EARLY_ARC);
      }
      if (!body.includes("arc-bath.")) {
        return;
      }
      return blankBathArc ? "" : scripted.replace(MERGED_FACTS, BATH_ARC);
    },
  });
  const before = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // The premise: the bath scene, the arc over the first two scenes and the one over four scenes are all stored.
  expect(itemAt(before, 1, 0).text).toContain(BATH_ARC);
  expect(itemAt(before, 2, 0).text).toContain(EARLY_ARC);
  expect((await recallTurn(w.h, BOTH)).prompt).toContain(EARLY_ARC);

  blankBathArc = true;
  await editScene(w.h, "bath");
  await redigest(w);
  const after = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // The edited scene is summarized again, so only its two parents were proven stale.
  expect(itemAt(after, 0, blockOf("bath")).key.contentHash).not.toBe(itemAt(before, 0, blockOf("bath")).key.contentHash);
  expect(listed(after, 1, 0)).toBe(false);
  expect(listed(after, 2, 0)).toBe(false);
  expect(listed(after, 1, 1)).toBe(true);
  expect(listed(after, 2, 1)).toBe(true);

  const run = await recallTurn(w.h, BOTH);
  expect(run.prompt).not.toContain(BATH_ARC);
  expect(run.prompt).not.toContain(EARLY_ARC);
  // The control: the room's other memory still reaches the prompt.
  expect(run.prompt).toContain(MERGED_FACTS);
});
