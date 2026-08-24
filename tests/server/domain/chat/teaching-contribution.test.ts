// domain/chat/teaching-contribution — CONTRIBUTOR #0, the rpg-gather projection. The seam's whole silence
// claim rests here: a game turn's depth-0 state block must arrive at assembly with the same content, the same
// order and the same `game-state` stamp it had when the merge site stamped it, and a non-game chat must
// contribute nothing at all.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ChatRpgGatherResult, TeachingContext } from "../../../../packages/server/src/domain/chat/contract/context.ts";
import { DEFAULT_TEACHING_KNOBS } from "../../../../packages/server/src/domain/chat/substrate/teaching.ts";
import { createChatTeachingContributions } from "../../../../packages/server/src/domain/chat/teaching-contribution.ts";
import { expect, test } from "../../../support/fixtures.ts";

const STATE_BLOCK: ChatInjection = { position: "in_chat", depth: 0, role: "system", content: "[Scene] a tavern" };

function tctxOf(rpgGather: ChatRpgGatherResult | null): TeachingContext {
  return {
    chatId: castId<ChatId>("chat_game"),
    runAsUserId: castId<UserId>("user_host"),
    knobs: DEFAULT_TEACHING_KNOBS,
    rpgGather,
  };
}

function gatherOf(over: Partial<ChatRpgGatherResult> = {}): ChatRpgGatherResult {
  return { macros: {}, injections: [STATE_BLOCK], tools: [], cardKeepLastX: 0, ...over };
}

describe("createChatTeachingContributions — chat's own contributions", () => {
  test("chat contributes exactly ONE contribution, at order 0 (the gather has to be first)", () => {
    const contributions = createChatTeachingContributions();

    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.order).toBe(0);
    expect(contributions[0]?.id).toBe("chat.rpg-gather");
  });

  test("a NON-GAME chat contributes nothing — the byte-identical arm every plain chat takes", async () => {
    const out = await createChatTeachingContributions()[0]?.collect(tctxOf(null));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });

  test("a game turn's injections ride through VERBATIM, stamped `game-state` (the stamp's one home)", async () => {
    const out = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf()));

    expect(out?.injections).toEqual([{ ...STATE_BLOCK, origin: "game-state" }]);
  });

  test("multiple gather injections keep their ORDER (the reminder + a reconcile note are one ordered pair)", async () => {
    const second: ChatInjection = { ...STATE_BLOCK, content: "[Reconcile] restate the panel" };
    const out = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf({ injections: [STATE_BLOCK, second] })));

    expect(out?.injections.map((i) => i.content)).toEqual([STATE_BLOCK.content, second.content]);
  });

  test("the gather's own `tools` become the contribution's toolNames — not a hard-coded empty set", async () => {
    const empty = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf()));
    const withTools = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf({ tools: ["skill_check"] })));

    // As built, every rpg mode pins `tools: []` (the fold rides `terminalTools`, which is NOT a registry
    // attach) — so today's turn attaches nothing. The projection still carries what the gather declares, so a
    // mode that DOES contribute a registry tool attaches it through the one seam instead of being dropped.
    expect(empty?.toolNames).toEqual([]);
    expect(withTools?.toolNames).toEqual(["skill_check"]);
  });
});
