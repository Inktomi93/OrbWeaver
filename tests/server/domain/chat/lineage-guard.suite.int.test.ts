// getChatLineage's fork-ancestry walk — the cycle-guard + depth-cap that production has but tests never
// pinned (the Wave-3 verifier confirmed cycle-safety BY HAND; nothing pins it, so a refactor that dropped
// the `visited` set or the `maxDepth` clamp would pass every existing test and then HANG the turn/read path
// on a self-referential `parentChatId`). `loadAncestorChain` (persistence/queries.ts) is the ONE home of
// both guards — `getChatLineage`/fork/export all walk through it — so this pins it there directly (no
// membership seam needed; the verb layers per-ancestor gating ON TOP of this unscoped walk).
//
// The `parentChatId` self-FK makes a cycle "schema-impossible" ONLY on a single INSERT (the parent must
// pre-exist); an UPDATE can still weld a loop (A→B, then B→A — both rows exist), which is exactly the
// corruption the `visited` set defends against. This suite welds that loop and asserts the walk TERMINATES
// with a bounded result rather than spinning forever.
//
// NON-VACUITY: the linked-list walk with no `visited` set would infinite-loop the cycle test (the runner
// times out, never green); with no `maxDepth` clamp the 70-node test would return 70, not the capped 64 —
// each assert fails the instant its guard is removed.

import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { loadAncestorChain } from "../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedChat } from "./_support.ts";

/** Re-point a chat's `parentChatId` (the only way to weld a cycle the single-insert FK can't express). */
async function setParent(db: Db, child: ChatId, parent: ChatId | null): Promise<void> {
  await db.update(chats).set({ parentChatId: parent }).where(eq(chats.id, child));
}

// The production default cap (persistence/queries.ts `loadAncestorChain(db, chatId, maxDepth = 64)`) — read
// from the code, not invented (the steal-list's "50" was approximate; the real clamp is 64).
const MAX_DEPTH = 64;

describe("loadAncestorChain — the cycle guard", () => {
  test("a two-node parent cycle (A→B→A) terminates with a bounded, de-duplicated chain (no hang)", async () => {
    const db = await freshDb();
    const a = await seedChat(db, "cyc_a");
    const b = await seedChat(db, "cyc_b", { parentChatId: a });
    // Weld the loop: A now points back at B (A→B→A→…). A single INSERT could never express this.
    await setParent(db, a, b);

    const chain = await loadAncestorChain(db, a);

    // Terminates (this line is only reached if the walk did NOT spin forever) with each node visited ONCE.
    expect(chain.map((r) => r.id)).toEqual([a, b]);
  });

  test("a self-loop (A→A) yields exactly the one node", async () => {
    const db = await freshDb();
    const a = await seedChat(db, "self_a");
    await setParent(db, a, a);

    const chain = await loadAncestorChain(db, a);

    expect(chain.map((r) => r.id)).toEqual([a]);
  });
});

describe("loadAncestorChain — the depth cap", () => {
  test(`a chain deeper than the cap is truncated to exactly ${MAX_DEPTH} nodes`, async () => {
    const db = await freshDb();
    const depth = MAX_DEPTH + 6; // 70 — comfortably past the clamp
    // Build a straight ancestry chain node_0 (root) … node_{depth-1} (leaf); each points at the prior.
    let parent: ChatId | null = null;
    const ids: ChatId[] = [];
    for (let i = 0; i < depth; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential — each node's parent is the prior node's id (a linked list).
      const id = await seedChat(db, `depth_${i}`, parent === null ? {} : { parentChatId: parent });
      ids.push(id);
      parent = id;
    }
    const leaf = castId<ChatId>(ids[depth - 1] as string);

    const chain = await loadAncestorChain(db, leaf);

    // The walk stops at the cap — it returns the leaf + its 63 nearest ancestors (self-first), NOT all 70.
    expect(chain).toHaveLength(MAX_DEPTH);
    expect(chain[0]?.id).toBe(leaf);
    // Bounded: the root (node_0, `depth - 1` hops up) is BEYOND the cap, so it never appears.
    expect(chain.map((r) => r.id)).not.toContain(ids[0]);
  });

  test("a chain SHORTER than the cap returns every node (the guard doesn't over-truncate)", async () => {
    const db = await freshDb();
    const root = await seedChat(db, "short_root");
    const mid = await seedChat(db, "short_mid", { parentChatId: root });
    const leaf = await seedChat(db, "short_leaf", { parentChatId: mid });

    const chain = await loadAncestorChain(db, leaf);

    expect(chain.map((r) => r.id)).toEqual([leaf, mid, root]);
  });
});
