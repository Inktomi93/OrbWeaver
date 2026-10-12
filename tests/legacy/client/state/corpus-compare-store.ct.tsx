// Compare store CT uses real browser renders for useSyncExternalStore. The pair survives a Similarity-to-
// Compare tab switch that unmounts the previous body. Seeding is one transition, never a half-filled pair
// that could fire an unasked diff; a single-slot write preserves its sibling.

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
  await expect(state).toHaveText("a=character_remy b=character_frida");

  await probe.getByRole("button", { name: "clear corpus compare b" }).click();
  await expect(state).toHaveText("a=character_remy b=none");
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
  await expect(names).toHaveText("aName=Remy bName=Frida");

  await probe.getByRole("button", { name: "clear corpus compare b" }).click();
  await expect(names).toHaveText("aName=Remy bName=none");
});
