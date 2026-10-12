// The LIST-FLIP CARRY SEAM (mirrors state/list-flip-carry.ts, #391) — the injected op that lets a writer
// OUTSIDE the shell dock the LIST without going behind the CONTEXT carry #383 installed.
//
// A CT, not a unit test, because the registrant is a CLOSURE OVER A COMMIT: `useShellLayout` re-publishes
// the carry every render, and the carry decides by comparing the regime the panels are in NOW against the
// one the next list mode produces. "The invoked carry is the pre-flip one" is a question only a real
// rendered subscriber over the real store can answer; a node double would have to fake it.
//
// WHAT THIS FILE DOES NOT CLAIM (measured, 2026-08-22): it does NOT pin the call ORDER inside
// `dockListPanel`. A planted write-first version left both tests green, because the registered closure
// holds the previous commit's values either way — so an order assertion here would be an un-failable
// fence, not a proof. The source header records the same finding. What IS decidable, and pinned below:
// the carry is invoked at all (the exact thing #391's defect skipped), with the destination mode, seeing
// the pre-flip state. The end-to-end proof that this seam fixes the orphan lives one tier up
// (app-shell.ct.tsx's #391 test, over the real frame).

import { expect, test } from "@playwright/experimental-ct-react";
import { ListFlipCarryProbe } from "./_ct-stories.tsx";

test("#391 dockListPanel invokes the registered carry with the destination mode, and the override lands", async ({ mount }) => {
  const probe = await mount(<ListFlipCarryProbe />);
  await expect(probe.getByTestId("list-override")).toHaveText("none");
  await probe.getByRole("button", { name: "mount the carry", exact: true }).click();

  await probe.getByRole("button", { name: "dock the list" }).click();

  // The carry was HANDED the destination ("docked") while the commit it belongs to still SAID the origin
  // ("none"). Both halves matter: the argument is what a regime comparison needs, and the pre-flip
  // observation is what makes that comparison meaningful. Going behind the carry — a bare
  // `setPanelMode("list","docked")`, which is exactly #391's defect — leaves this log at "none".
  await expect(probe.getByTestId("carry-log")).toHaveText("docked@none");
  await expect(probe.getByTestId("list-override")).toHaveText("docked");
});

test("#391 registerListFlipCarry(null) retires the carry, and the dock still lands", async ({ mount }) => {
  const probe = await mount(<ListFlipCarryProbe />);
  await probe.getByRole("button", { name: "mount the carry", exact: true }).click();
  await probe.getByRole("button", { name: "dock the list" }).click();
  await expect(probe.getByTestId("carry-log")).toHaveText("docked@none");

  // Retire it — the shell unmounting, which is a real state (the ladder's hard reload, a crash boundary).
  await probe.getByRole("button", { name: "unmount the carry", exact: true }).click();
  await probe.getByRole("button", { name: "collapse the list" }).click();
  await expect(probe.getByTestId("list-override")).toHaveText("collapsed");

  await probe.getByRole("button", { name: "dock the list" }).click();

  // No shell mounted ⇒ no rendered frame ⇒ no regime for the flip to move CONTEXT between, so an absent
  // carry is not a failure: the dock is simply the override write, and the log gains nothing.
  await expect(probe.getByTestId("list-override")).toHaveText("docked");
  await expect(probe.getByTestId("carry-log")).toHaveText("docked@none");
});

// `collapseListPanel` is `dockListPanel`'s closing twin, minted for `__orb.nav.panel` — it must pay the SAME
// #383 carry the topbar's own collapse (through `useShellLayout`'s wide-regime `collapsePanel`) does, unlike
// the probe's bare `setPanelMode("list","collapsed")` door above, which the carry deliberately does not see.
test("collapseListPanel invokes the registered carry with the destination mode, and the override lands", async ({ mount }) => {
  const probe = await mount(<ListFlipCarryProbe />);
  await probe.getByRole("button", { name: "mount the carry", exact: true }).click();
  await probe.getByRole("button", { name: "dock the list" }).click();
  await expect(probe.getByTestId("carry-log")).toHaveText("docked@none");

  await probe.getByRole("button", { name: "nav-bridge close the list" }).click();

  await expect(probe.getByTestId("carry-log")).toHaveText("docked@none | collapsed@docked");
  await expect(probe.getByTestId("list-override")).toHaveText("collapsed");
});
