// substrate/merge — the [merge-clear] contract + lock-honoring (docs/plans/rpg/design.md). Pure unit. The
// {}-noop / null-clear transition seam is the OPPOSITE of settings' deepMergePlain, so it gets its own
// explicit transition test (memory: merge-clear needs a transition test). Locks: manual-edit-wins — a
// tool patch on a locked path is dropped.

import { describe } from "vitest";
import { applyLockedPatch, applyLockedPatchTracked, rebasePatchOntoHead } from "../../../../../packages/server/src/domain/rpg/substrate/merge.ts";
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
    // `status` survives while the SAME actor's trackers take the tool's write — never a whole-participant pin.
    const base = { actorState: [actorWithWallet("mari", 10, 5)] };
    const patchRow = actorWithWallet("mari", 10, 2);
    const patched = { ...patchRow, volatile: { ...patchRow.volatile, status: "tool-set" } };
    // The `volatile` segment is a REAL path segment (R2) — the merge walks the stored JSON, so a lock path
    // that skipped it would pin nothing at all.
    const out = applyLockedPatch(base, { actorState: [patched] }, { "actorState.npc:mari.volatile.status": true });
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
      { "actorState.npc:mari.volatile.trackerValues.mana": true },
    );
    const values = (out.actorState as { volatile: { trackerValues: Record<string, { value: number }> } }[])[0]?.volatile.trackerValues ?? {};
    expect(values["mana"]?.value).toBe(8); // pinned
    expect(values["focus"]?.value).toBe(1); // took the patch
  });

  test("an actor carrying a sub-field lock survives a tool that drops the actor (removal defense)", () => {
    const base = { actorState: [actorWithWallet("mari", 10, 5), actorWithWallet("zan", 3, 1)] };
    const patch = { actorState: [actorWithWallet("zan", 3, 1)] }; // mari dropped
    const out = applyLockedPatch(base, patch, { "actorState.npc:mari.volatile.wallet.gold": true });
    const keys = (out.actorState as { actorRef: { npcKey: string } }[]).map((a) => a.actorRef.npcKey);
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
    const actors = out.actorState as { actorRef: { npcKey: string }; volatile: { trackerValues: Record<string, { value: number }> } }[];
    expect(actors.map((a) => a.actorRef.npcKey).sort()).toEqual(["mari", "zan"]);
    expect(actors.find((a) => a.actorRef.npcKey === "mari")?.volatile.trackerValues["focus"]?.value).toBe(5); // untouched
    expect(actors.find((a) => a.actorRef.npcKey === "zan")?.volatile.trackerValues["focus"]?.value).toBe(9); // took the patch
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
    const out = applyLockedPatch(base, { actorState: [patched] }, { "actorState.npc:mari.wallet.gold": true });
    const wallet = (out.actorState as { wallet: { name: string; amount: number }[] }[])[0]?.wallet ?? [];
    expect(wallet.find((w) => w.name === "gold")?.amount).toBe(10); // pinned
    expect(wallet.find((w) => w.name === "silver")?.amount).toBe(9); // took the patch
  });

  test("#78: an item FIELD lock pins that field alone — the item's other fields, its siblings and the array stay the story's", () => {
    // The grammar the hand door now MINTS for a pack edit (`…inventory.<id>.<field>`). Nothing here is new
    // engine work — the keyed-element walk already deep-merges a correlated pair — but this is the shape the
    // pin means, so it is pinned: one claimed field held, everything around it still writable.
    const packOf = (items: readonly unknown[]): Record<string, unknown> => {
      const row = actorWithWallet("mari", 10, 5);
      return { actorState: [{ ...row, volatile: { ...row.volatile, inventory: items } }] };
    };
    const key = { id: "itm-key", name: "Bone key", description: "", quantity: 1, location: "", type: "" };
    const rope = { id: "itm-rope", name: "Rope", description: "", quantity: 1, location: "", type: "" };
    const out = applyLockedPatchTracked(
      packOf([key, rope]),
      packOf([
        { ...key, name: "a rusted key", location: "belt pouch" },
        { ...rope, quantity: 4 },
        { id: "itm-new", name: "Torch", description: "", quantity: 1, location: "", type: "" },
      ]),
      { "actorState.npc:mari.volatile.inventory.itm-key.name": true },
    );
    const pack = (out.state["actorState"] as { volatile: { inventory: { id: string; name: string; location: string; quantity: number }[] } }[])[0]?.volatile
      .inventory;
    expect(pack?.find((it) => it.id === "itm-key")?.name).toBe("Bone key"); // pinned
    expect(pack?.find((it) => it.id === "itm-key")?.location).toBe("belt pouch"); // the same item's unclaimed field
    expect(pack?.find((it) => it.id === "itm-rope")?.quantity).toBe(4); // a sibling item
    expect(pack?.map((it) => it.id)).toContain("itm-new"); // and the array still grows
    expect(out.suppressed).toEqual(["actorState.npc:mari.volatile.inventory.itm-key.name"]);
  });

  test("#78: a LEGACY plane-wide pack lock still drops the whole inventory patch (stored locks are never rewritten)", () => {
    // Snapshots written before the granularity change carry `…volatile.inventory`. No migration touches stored
    // `fieldLocks` (the dev corpus is the owner's), so the READ side must keep honoring the coarse path exactly
    // as written — the prefix rule does it, and the panel keeps the section Release that lets a host drop it.
    const packOf = (items: readonly unknown[]): Record<string, unknown> => {
      const row = actorWithWallet("mari", 10, 5);
      return { actorState: [{ ...row, volatile: { ...row.volatile, inventory: items } }] };
    };
    const key = { id: "itm-key", name: "Bone key", description: "", quantity: 1, location: "", type: "" };
    const out = applyLockedPatchTracked(
      packOf([key]),
      packOf([
        { ...key, location: "belt pouch" },
        { id: "itm-new", name: "Torch" },
      ]),
      {
        "actorState.npc:mari.volatile.inventory": true,
      },
    );
    const pack = (out.state["actorState"] as { volatile: { inventory: { id: string; location: string }[] } }[])[0]?.volatile.inventory;
    expect(pack).toEqual([key]); // nothing landed: not the field, not the new item
    expect(out.suppressed).toEqual(["actorState.npc:mari.volatile.inventory"]);
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
    const base = { presentCharacters: ["npc:mara", "npc:ilya"] };
    const patch = { presentCharacters: ["npc:mara", "npc:ilya"] }; // byte-identical carry
    const head = { presentCharacters: ["npc:ilya"] }; // the host dismissed mara after the base was read
    expect(rebasePatchOntoHead(patch, base, head)).toEqual({ presentCharacters: ["npc:ilya"] });
  });

  test("a genuine ADD still lands (absent from the round's base)", () => {
    const base = { presentCharacters: ["npc:mara"] };
    const patch = { presentCharacters: ["npc:mara", "npc:new"] };
    const head = { presentCharacters: [] }; // mara dismissed meanwhile
    expect(rebasePatchOntoHead(patch, base, head)).toEqual({ presentCharacters: ["npc:new"] });
  });

  test("a genuine REMOVE by the round is honored against the head too", () => {
    const base = { presentCharacters: ["npc:mara", "npc:ilya"] };
    const patch = { presentCharacters: ["npc:ilya"] }; // the round walked mara off-stage
    const head = { presentCharacters: ["npc:mara", "npc:ilya", "npc:late"] };
    expect(rebasePatchOntoHead(patch, base, head)).toEqual({ presentCharacters: ["npc:ilya", "npc:late"] });
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

  test("SEQUENTIAL patches each rebase against THEIR OWN base — no element is counted as added twice", () => {
    // THE CALLING CONVENTION this engine requires — measured GREEN against the pre-fix source, because the
    // leg-4 defect was in the fold's CALL (it passed the turn's seed for every patch), never in this function.
    // Pinned here anyway, and stated as the contract it is: patch 2 of a turn is composed against the state
    // AFTER patch 1, so it already carries patch 1's beat, and handing this function the seed instead re-scores
    // that beat as a fresh ADD and appends it twice. The integration pin in `hand-edit-vs-flush.suite` is the
    // defect proof; this one is what stops a future caller from reintroducing it.
    const seed: Record<string, unknown> = { recentEvents: ["opening beat"], presentCharacters: [] };
    const p1 = { recentEvents: ["opening beat", "she drew her blade"], presentCharacters: ["npc:mari"] };
    const afterP1 = { recentEvents: p1.recentEvents, presentCharacters: p1.presentCharacters };
    const p2 = { recentEvents: ["opening beat", "she drew her blade", "the door slammed"], presentCharacters: ["npc:mari", "npc:kai"] };

    let head: Record<string, unknown> = { ...seed };
    head = applyLockedPatch(head, rebasePatchOntoHead(p1, seed, head), null);
    head = applyLockedPatch(head, rebasePatchOntoHead(p2, afterP1, head), null);

    expect(head["recentEvents"]).toEqual(["opening beat", "she drew her blade", "the door slammed"]);
    expect(head["presentCharacters"]).toEqual(["npc:mari", "npc:kai"]);
  });

  test("records and scalars pass through untouched (they are the lock grammar's business, not the rebase's)", () => {
    const base = { trackerValues: { hp: 1 }, location: "ford", plot: { title: "old" } };
    const patch = { trackerValues: { hp: 2 }, location: "chapel", plot: { title: "new" } };
    const head = { trackerValues: {}, location: "", plot: null };
    expect(rebasePatchOntoHead(patch, base, head)).toEqual(patch);
  });
});

describe("the suppression report (#77)", () => {
  test("a lock that DROPPED a real change names the path", () => {
    const out = applyLockedPatchTracked({ location: "the guard post" }, { location: "the ford" }, { location: true });
    expect(out.state.location).toBe("the guard post"); // manual-edit-wins is unchanged
    expect(out.suppressed).toEqual(["location"]);
  });

  test("a CARRIED locked value is NOT a loss — the appliers compose whole planes, and noise trains the reader to skip", () => {
    // `update_scene` re-emits every ambient field it was handed, so a locked plane the round never meant to
    // touch arrives in the patch byte-identical. Reporting that would put a line in every turn's disclosure.
    const out = applyLockedPatchTracked(
      { location: "the guard post", weather: null },
      { location: "the guard post", weather: { type: "rain" } },
      { location: true },
    );
    expect(out.suppressed).toEqual([]);
    expect(out.state.weather).toEqual({ type: "rain" }); // the unlocked sibling still takes the write
  });

  test("a SUB-FIELD pin names the deep path, not the plane (the #10 grammar, reported at its own depth)", () => {
    const base = { actorState: [actorWithWallet("gorak", 100, 30)] };
    const patch = { actorState: [actorWithWallet("gorak", 5, 30)] };
    const out = applyLockedPatchTracked(base, patch, { "actorState.npc:gorak.volatile.wallet.gold": true });
    expect(out.suppressed).toEqual(["actorState.npc:gorak.volatile.wallet.gold"]);
  });

  test("a pinned element the patch REMOVED is a suppressed write too (the removal defense reports)", () => {
    const base = { quests: [quest("main"), quest("side")] };
    const patch = { quests: [quest("main")] }; // the round dropped `side`
    const out = applyLockedPatchTracked(base, patch, { [`quests.${questId("side")}`]: true });
    expect((out.state.quests as unknown[]).length).toBe(2); // the pin defeated the removal
    expect(out.suppressed).toEqual([`quests.${questId("side")}`]);
  });

  test("no locks at all reports nothing, and the untracked entry point is unchanged", () => {
    const patch = { location: "the ford" };
    const tracked = applyLockedPatchTracked({ location: "" }, patch, null);
    expect(tracked.suppressed).toEqual([]);
    expect(tracked.state).toEqual(applyLockedPatch({ location: "" }, patch, null));
  });
});
