// corpus-COMPARE store CT — the pair the Corpus CONTEXT panel's Compare tab diffs, driven through its
// module actions with the read hooks rendered as text. A CT (not a plain unit test) for the same reason as
// its search and selection siblings: the store's only read surface is a reactive hook, and
// `useSyncExternalStore` needs a real browser render.
//
// WHY THE STORE EXISTS AT ALL (#554). The pair used to be `useState` on the Compare tab, which made that
// tab the only way to name one — while the Similarity tab next door listed 1,782 pairs as inert text
// (`clickablePairs: 0`). A pair row is a door now, and the shell UNMOUNTS a CONTEXT tab body on the tab
// switch that door performs, so component state would be discarded at exactly the moment of the hand-off.
//
// WHAT THIS PINS that the surface CTs cannot: a seed is ONE transition (a half-filled pair would let the
// Compare tab fire a diff for a pair nobody asked for), and a single-slot write leaves its sibling alone.

import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusComparePairProbe } from "./_ct-stories.tsx";

test("a seeded pair lands whole, and each slot is writable on its own", async ({ mount }) => {
  const probe = await mount(<CorpusComparePairProbe />);
  const state = probe.locator("output").first();
  // Fresh page → the rest state. The Compare tab reads this as "pick two characters".
  await expect(state).toHaveText("a=none b=none");

  // ONE TRANSITION, not two: the Similarity tab's row has both ids in hand and hands them over together.
  await probe.getByRole("button", { name: "seed corpus pair" }).click();
  await expect(state).toHaveText("a=character_freya b=character_frida");

  // …and the tab's own pickers still write one slot at a time, without disturbing the other.
  await probe.getByRole("button", { name: "set corpus compare a" }).click();
  await expect(state).toHaveText("a=character_yuki b=character_frida");

  await probe.getByRole("button", { name: "clear corpus compare b" }).click();
  await expect(state).toHaveText("a=character_yuki b=none");
});

// #563: the NAME is part of the slot, because the Compare tab's Select can only name a value it finds in
// its own one-page item list — and a pair seeded from a 313-card similarity list routinely is not in it.
test("each slot carries its NAME, and a slot's name moves with its id", async ({ mount }) => {
  const probe = await mount(<CorpusComparePairProbe />);
  const names = probe.locator("output").nth(1);
  await expect(names).toHaveText("aName=none bName=none");

  await probe.getByRole("button", { name: "seed corpus pair" }).click();
  await expect(names, "the pair row has both names in hand and hands them over with the ids").toHaveText("aName=Freya bName=Frida");

  // A single-slot write replaces that slot's name and leaves its sibling's alone — the pairing is what
  // makes a stale name (the previous character's, under the new id) unrepresentable.
  await probe.getByRole("button", { name: "set corpus compare a" }).click();
  await expect(names).toHaveText("aName=Yuki bName=Frida");

  await probe.getByRole("button", { name: "clear corpus compare b" }).click();
  await expect(names).toHaveText("aName=Yuki bName=none");
});
