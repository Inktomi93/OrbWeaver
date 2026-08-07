// substrate/merge — the [merge-clear] contract + lock-honoring (rpg-design/05 §2.4). Pure unit. The
// {}-noop / null-clear transition seam is the OPPOSITE of settings' deepMergePlain, so it gets its own
// explicit transition test (memory: merge-clear needs a transition test). Locks: manual-edit-wins — a
// tool patch on a locked path is dropped.

import { describe } from "vitest";
import { applyLockedPatch, rebasePatchOntoHead } from "../../../../../packages/server/src/domain/rpg/substrate/merge.ts";
import { actorWithWallet, expect, quest, questId, test } from "../_support.ts";

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

  test("a per-actor SUB-FIELD lock (actorState.<key>.status) pins that value while sibling fields take the patch", () => {
    // The #10 per-field pin: the whole-array tool overlay correlates actors by `actorRefKey`; the locked
    // `status` survives while the SAME actor's trackers take the tool's write — never a whole-roster pin.
    const base = { actorState: [actorWithWallet("mari", 10, 5)] };
    const patchRow = actorWithWallet("mari", 10, 2);
    const patched = { ...patchRow, volatile: { ...patchRow.volatile, status: "tool-set" } };
    // The `volatile` segment is a REAL path segment (R2) — the merge walks the stored JSON, so a lock path
    // that skipped it would pin nothing at all.
    const out = applyLockedPatch(base, { actorState: [patched] }, { "actorState.cast:mari.volatile.status": true });
    const actors = out.actorState as { volatile: { status: string; trackerValues: Record<string, { value: number }> } }[];
    expect(actors[0]?.volatile.status).toBe(""); // locked — the hand value (empty) survives
    expect(actors[0]?.volatile.trackerValues["focus"]?.value).toBe(2); // unlocked sibling field took the patch
  });

  test("a nested TRACKER lock (actorState.<key>.trackerValues.<key>) pins ONE tracker, siblings take the patch", () => {
    // The tracked-field unification made this FREE: `trackerValues` is a record keyed by tracker key, so the
    // plain object walk already yields a per-tracker lock path — no keyed-array registry entry needed (the
    // retired name-addressed `pools[]` array was exactly why that machinery had to exist).
    const withTrackers = (focus: number, mana: number): Record<string, unknown> => {
      const row = actorWithWallet("mari", 10, focus);
      return { ...row, volatile: { ...row.volatile, trackerValues: { focus: { value: focus, items: null }, mana: { value: mana, items: null } } } };
    };
    const out = applyLockedPatch(
      { actorState: [withTrackers(5, 8)] },
      { actorState: [withTrackers(1, 0)] },
      { "actorState.cast:mari.volatile.trackerValues.mana": true },
    );
    const values = (out.actorState as { volatile: { trackerValues: Record<string, { value: number }> } }[])[0]?.volatile.trackerValues ?? {};
    expect(values["mana"]?.value).toBe(8); // pinned
    expect(values["focus"]?.value).toBe(1); // took the patch
  });

  test("an actor carrying a sub-field lock survives a tool that drops the actor (removal defense)", () => {
    const base = { actorState: [actorWithWallet("mari", 10, 5), actorWithWallet("zan", 3, 1)] };
    const patch = { actorState: [actorWithWallet("zan", 3, 1)] }; // mari dropped
    const out = applyLockedPatch(base, patch, { "actorState.cast:mari.volatile.wallet.gold": true });
    const keys = (out.actorState as { actorRef: { castKey: string } }[]).map((a) => a.actorRef.castKey);
    expect(keys).toContain("mari"); // re-inserted — the pinned wallet never silently dies with its row
    expect(keys).toContain("zan");
  });

  test("an UNNAMED actorState element survives with NO lock — an actor is an identity, not list content", () => {
    // `actorState` is the ONE additive keyed plane: no producer removes an actor by omission (the tool
    // appliers map/append over the base; the hand door derives its next row from the true head), so an
    // unnamed element is ignorance. Without this the second of two per-actor writes silently
    // deleted the first actor's whole volatile row (the e2e-caught hand-plane loss).
    const base = { actorState: [actorWithWallet("mari", 10, 5), actorWithWallet("zan", 3, 1)] };
    const out = applyLockedPatch(base, { actorState: [actorWithWallet("zan", 3, 9)] }, null);
    const actors = out.actorState as { actorRef: { castKey: string }; volatile: { trackerValues: Record<string, { value: number }> } }[];
    expect(actors.map((a) => a.actorRef.castKey).sort()).toEqual(["mari", "zan"]);
    expect(actors.find((a) => a.actorRef.castKey === "mari")?.volatile.trackerValues["focus"]?.value).toBe(5); // untouched
    expect(actors.find((a) => a.actorRef.castKey === "zan")?.volatile.trackerValues["focus"]?.value).toBe(9); // took the patch
  });

  test("every OTHER keyed plane still removes by omission — an unlocked dropped quest is gone [the contrast]", () => {
    // The counterweight to the additive `actorState` rule: quests/inventory/wallet/conditions all have a real
    // remove-by-omission gesture (deleteQuest, the pack's onRemoveItem, `removeCondition`), so the authored
    // array IS the plane there. (`presentCharacters` left the registry with R2 — a flat key list has no
    // elements to correlate, so it wholesale-replaces, which is the same semantic by a cheaper route.)
    const base = { quests: [quest("main"), quest("side")] };
    const out = applyLockedPatch(base, { quests: [quest("side")] }, null);
    expect((out.quests as { id: string }[]).map((q) => q.id)).toEqual([questId("side")]);
  });

  test("a wallet-entry lock (…wallet.<name>) pins one currency while another takes the patch", () => {
    const base = {
      actorState: [
        {
          ...actorWithWallet("mari", 10, 5),
          wallet: [
            { name: "gold", amount: 10 },
            { name: "silver", amount: 4 },
          ],
        },
      ],
    };
    const patched = {
      ...actorWithWallet("mari", 10, 5),
      wallet: [
        { name: "gold", amount: 0 },
        { name: "silver", amount: 9 },
      ],
    };
    const out = applyLockedPatch(base, { actorState: [patched] }, { "actorState.cast:mari.wallet.gold": true });
    const wallet = (out.actorState as { wallet: { name: string; amount: number }[] }[])[0]?.wallet ?? [];
    expect(wallet.find((w) => w.name === "gold")?.amount).toBe(10); // pinned
    expect(wallet.find((w) => w.name === "silver")?.amount).toBe(9); // took the patch
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

describe("rebasePatchOntoHead — replaying an applier's patch onto a head it was not composed against", () => {
  // Every applier in `tools/apply.ts` is a read-modify-write over the base it was handed, so a staged patch
  // carries WHOLE planes. Replaying one onto a newer head must keep what the round meant and drop what it
  // merely carried, or a hand removal made after the base was read is silently undone.

  test("a CARRIED element the head no longer has is dropped (the resurrection class)", () => {
    const base = { presentCharacters: ["cast:mara", "cast:ilya"] };
    const patch = { presentCharacters: ["cast:mara", "cast:ilya"] }; // byte-identical carry
    const head = { presentCharacters: ["cast:ilya"] }; // the host dismissed mara after the base was read
    expect(rebasePatchOntoHead(patch, base, head)).toEqual({ presentCharacters: ["cast:ilya"] });
  });

  test("a genuine ADD still lands (absent from the round's base)", () => {
    const base = { presentCharacters: ["cast:mara"] };
    const patch = { presentCharacters: ["cast:mara", "cast:new"] };
    const head = { presentCharacters: [] }; // mara dismissed meanwhile
    expect(rebasePatchOntoHead(patch, base, head)).toEqual({ presentCharacters: ["cast:new"] });
  });

  test("a genuine REMOVE by the round is honored against the head too", () => {
    const base = { presentCharacters: ["cast:mara", "cast:ilya"] };
    const patch = { presentCharacters: ["cast:ilya"] }; // the round walked mara off-stage
    const head = { presentCharacters: ["cast:mara", "cast:ilya", "cast:late"] };
    expect(rebasePatchOntoHead(patch, base, head)).toEqual({ presentCharacters: ["cast:ilya", "cast:late"] });
  });

  test("a CHANGED keyed element wins even when the head dropped it (the boarded tombstone boundary)", () => {
    const base = { actorState: [actorWithWallet("mara", 3, 2)] };
    const patch = { actorState: [actorWithWallet("mara", 99, 2)] }; // a real write, not a carry
    const head = { actorState: [] };
    const out = rebasePatchOntoHead(patch, base, head)["actorState"] as { volatile: { wallet: { amount: number }[] } }[];
    expect(out[0]?.volatile.wallet[0]?.amount).toBe(99);
  });

  test("flat arrays keep MULTISET semantics — a repeated beat is not deduped, and a trimmed head survives", () => {
    // `applyUpdateScene` emits `[...state.recentEvents, beat]`. If the host trimmed the log mid-flight, the
    // rebase must append only the NEW beat rather than restore the whole stale log — and identical beats
    // (the model can narrate the same line twice) must not collapse.
    const base = { recentEvents: ["a", "b"] };
    const patch = { recentEvents: ["a", "b", "b"] }; // appended a second "b"
    const head = { recentEvents: ["b"] }; // the host trimmed "a" away
    expect(rebasePatchOntoHead(patch, base, head)).toEqual({ recentEvents: ["b", "b"] });
  });

  test("keyed quests: a carried quest the head deleted stays deleted, an authored one lands", () => {
    const base = { quests: [quest("k1"), quest("k2")] };
    const patch = { quests: [quest("k1"), quest("k2", { status: "completed" })] }; // k1 carried, k2 flipped
    const head = { quests: [quest("k2")] }; // the host deleted k1 mid-flight
    const out = rebasePatchOntoHead(patch, base, head)["quests"] as { id: string; status: string }[];
    expect(out.map((q) => q.id)).toEqual([questId("k2")]);
    expect(out[0]?.status).toBe("completed");
  });

  test("records and scalars pass through untouched (they are the lock grammar's business, not the rebase's)", () => {
    const base = { trackerValues: { hp: 1 }, location: "ford", plot: { title: "old" } };
    const patch = { trackerValues: { hp: 2 }, location: "chapel", plot: { title: "new" } };
    const head = { trackerValues: {}, location: "", plot: null };
    expect(rebasePatchOntoHead(patch, base, head)).toEqual(patch);
  });
});
