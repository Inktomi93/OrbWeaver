// substrate/merge — the [merge-clear] contract + lock-honoring (rpg-design/05 §2.4). Pure unit. The
// {}-noop / null-clear transition seam is the OPPOSITE of settings' deepMergePlain, so it gets its own
// explicit transition test (memory: merge-clear needs a transition test). Locks: manual-edit-wins — a
// tool patch on a locked path is dropped.

import { describe } from "vitest";
import { applyLockedPatch } from "../../../../../packages/server/src/domain/rpg/substrate/merge";
import { expect, quest, questId, test } from "../_support";

describe("the [merge-clear] contract", () => {
  test("undefined at a key = skip (omit preserves)", () => {
    const out = applyLockedPatch({ location: "keep" }, { location: undefined }, null);
    expect(out.location).toBe("keep");
  });

  test("explicit null = leaf CLEAR", () => {
    const out = applyLockedPatch({ weather: { type: "rain" } }, { weather: null }, null);
    expect(out.weather).toBeNull();
  });

  test("empty object {} = NO-OP (leaf preserved) — the transition-vs-null seam", () => {
    const base = { weather: { type: "rain", wind: "gusty" } };
    const noop = applyLockedPatch(base, { weather: {} }, null);
    expect(noop.weather).toEqual({ type: "rain", wind: "gusty" });
    // Contrast: null on the SAME key clears it. Same key, opposite outcomes — the contract's whole point.
    const cleared = applyLockedPatch(base, { weather: null }, null);
    expect(cleared.weather).toBeNull();
  });

  test("a non-empty plain object over a plain-object base RECURSES (deep merge)", () => {
    const out = applyLockedPatch({ clock: { day: 1, hour: 9 } }, { clock: { hour: 18 } }, null);
    expect(out.clock).toEqual({ day: 1, hour: 18 });
  });

  test("an array REPLACES (no concat)", () => {
    const out = applyLockedPatch({ pools: [{ name: "a" }] }, { pools: [{ name: "b" }] }, null);
    expect(out.pools).toEqual([{ name: "b" }]);
  });

  test("a primitive REPLACES", () => {
    const out = applyLockedPatch({ location: "old" }, { location: "new" }, null);
    expect(out.location).toBe("new");
  });

  test("base is not mutated (a new object is returned)", () => {
    const base = { location: "old" };
    const out = applyLockedPatch(base, { location: "new" }, null);
    expect(base.location).toBe("old");
    expect(out).not.toBe(base);
  });
});

describe("lock-honoring (manual-edit-wins)", () => {
  test("a tool patch on a LOCKED leaf is dropped — the hand edit survives", () => {
    const out = applyLockedPatch({ location: "hand-set" }, { location: "tool-tried" }, { location: true });
    expect(out.location).toBe("hand-set");
  });

  test("an unlocked sibling still applies while the locked path is protected", () => {
    const out = applyLockedPatch({ location: "hand-set", weather: { type: "clear" } }, { location: "tool-x", weather: { type: "storm" } }, { location: true });
    expect(out.location).toBe("hand-set");
    expect(out.weather).toEqual({ type: "storm" });
  });

  test("a bare `quests` prefix lock all-or-nothing pins the WHOLE array", () => {
    // The REAL production shape: quests is an RpgQuest[] ARRAY (contracts/rpg/snapshot.ts). A prefix lock
    // drops the whole patch array — none of the tool's quest edits land.
    const base = { quests: [quest("main"), quest("side")] };
    const out = applyLockedPatch(base, { quests: [quest("main", { status: "completed" }), quest("side", { status: "completed" })] }, { quests: true });
    expect(out.quests).toEqual([quest("main"), quest("side")]);
  });

  test("a per-quest lock (quests.<id>) keeps that quest active while a tool completes its sibling [the counterexample]", () => {
    // The verifier's exact runnable counterexample against the REAL array: q_main is hand-locked, the tool
    // wholesale-replaces the array completing BOTH — q_main must stay active, q_side must complete.
    const mainId = questId("main");
    const sideId = questId("side");
    const base = { quests: [quest("main"), quest("side")] };
    const patch = {
      quests: [
        { ...quest("main"), status: "completed" },
        { ...quest("side"), status: "completed" },
      ],
    };
    const out = applyLockedPatch(base, patch, { [`quests.${mainId}`]: true });
    const outQuests = out.quests as { id: string; status: string }[];
    expect(outQuests.find((q) => q.id === mainId)?.status).toBe("active");
    expect(outQuests.find((q) => q.id === sideId)?.status).toBe("completed");
  });

  test("a per-quest lock survives a tool that REMOVES the quest from the array (re-inserted)", () => {
    // The tool's replacement array drops q_main entirely (a removal). The lock re-inserts the base element.
    const mainId = questId("main");
    const base = { quests: [quest("main"), quest("side")] };
    const patch = { quests: [quest("side", { status: "completed" })] }; // q_main dropped
    const out = applyLockedPatch(base, patch, { [`quests.${mainId}`]: true });
    const outQuests = out.quests as { id: string; status: string }[];
    expect(outQuests.find((q) => q.id === mainId)?.status).toBe("active"); // survived removal
    expect(outQuests.find((q) => q.id === questId("side"))?.status).toBe("completed");
  });

  test("keyed-element locks generalize — an inventory item lock (inventory.<id>) survives removal too", () => {
    // Proves the registry is generic, not a quests-only hack: inventory (key `id`) rides the same grammar.
    const base = {
      inventory: [
        { id: "sword", name: "sword", quantity: 1 },
        { id: "gold", name: "gold", quantity: 5 },
      ],
    };
    const patch = { inventory: [{ id: "gold", name: "gold", quantity: 0 }] }; // sword dropped, gold zeroed
    const out = applyLockedPatch(base, patch, { "inventory.sword": true });
    const items = out.inventory as { id: string; quantity: number }[];
    expect(items.find((i) => i.id === "sword")?.quantity).toBe(1); // locked survivor re-inserted
    expect(items.find((i) => i.id === "gold")?.quantity).toBe(0); // unlocked took the patch
  });
});
