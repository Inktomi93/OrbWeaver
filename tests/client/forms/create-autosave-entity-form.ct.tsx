// createAutosaveEntityForm CT — the D78 canonical regressions (autosave-form-doctrine.md §10
// CT-1..6). Each mounts the REAL session boundary over a save SPY; the F1/F2 live P0 reproductions
// become permanent pins. CT (not headless) because every scenario is a RENDER + STORE-SUBSCRIPTION +
// TEARDOWN interaction that only reproduces with the real React scheduler, real timers, and a live DOM
// (core/Spine-Testing.md §7). Real timers + Playwright auto-retrying `expect` (fake timers drift vs
// React 19). Observation is the ONE-testid channel (§7 last-resort locator, sanctioned for a probe);
// the inputs/buttons use getByLabel/getByRole.

import { expect, test } from "@playwright/experimental-ct-react";
import { BoundaryArrayOpsStory, BoundaryCleanEchoStory, BoundaryIdentitySwitchStory, BoundaryReseedStory, BoundaryStatusStory } from "./_ct-stories";

// CT-1 — identity switch renders the NEW entity (the F1 P0: the preset editor showed A under B). The
// boundary keys its Session by entityId, so flipping entityId is a full teardown/remount seeded from B's
// serverValues. CT-3 rides the same story: the pre-switch edit flushes exactly ONCE, for the OLD entity.
test("CT-1/CT-3: switching entityId renders the new entity and flushes the old edit exactly once", async ({ mount, page }) => {
  await mount(<BoundaryIdentitySwitchStory />);

  // Entity A seeded from its server row.
  await expect(page.getByLabel("A text")).toHaveValue("alpha");

  // Edit A within the debounce window, then IMMEDIATELY switch to B (before the 50ms debounce fires) —
  // CT-3's teardown-flush trigger: the switch tears A's session down mid-debounce.
  await page.getByLabel("A text").fill("alpha edited");
  await page.getByRole("button", { name: "switch to B" }).click();

  // CT-1: B's field shows B's server value, NOT A's edit (the F1 render-the-previous-entity defect).
  await expect(page.getByLabel("B text")).toHaveValue("beta");

  // CT-3: exactly ONE save fired, carrying the OLD entity's edit (the teardown flush targets the session
  // being torn down). The log is the full trail — it must be precisely "A=alpha edited".
  await expect(page.getByTestId("switch-log")).toHaveText("A=alpha edited");
  await expect(page.getByTestId("switch-count")).toHaveText("1");
});

// CT-2 — reseed discards the pre-reseed edit (the F2 22ms write-back). edit → reseed(starter) → the field
// shows starter AND the spy received NO save carrying the pre-reseed value (the teardown was discard-
// flagged, so its flush was skipped). Save-count pinned at 0.
test("CT-2: reseed shows the starter and discards the pre-reseed edit (no write-back)", async ({ mount, page }) => {
  await mount(<BoundaryReseedStory />);

  await expect(page.getByLabel("Reseed text")).toHaveValue("server value");

  // Edit, then reseed BEFORE the debounce could persist — the reseed must discard the edit.
  await page.getByLabel("Reseed text").fill("edited then discarded");
  await page.getByRole("button", { name: "reseed to starter" }).click();

  // The field shows the starter (the reseed remounted seeded from `next`).
  await expect(page.getByLabel("Reseed text")).toHaveValue("starter value");

  // THE PIN: no save carrying the pre-reseed edit ever landed (the discard-flagged teardown skipped the
  // flush). A macrotask boundary gives any (buggy) write-back every chance to fire first.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  await expect(page.getByTestId("reseed-count")).toHaveText("0");
  await expect(page.getByTestId("reseed-log")).toHaveText("");
});

// CT-4 — array ops persist with ZERO call-site flushes (the §7 trap). push AND remove both reach the spy
// via the store-subscription driver; no button calls form.handleSubmit().
test("CT-4: push and remove array ops autosave via the store driver, no manual flush", async ({ mount, page }) => {
  await mount(<BoundaryArrayOpsStory />);

  await expect(page.getByTestId("array-live")).toHaveText("[]");

  // Push — the driver debounces then submits; the spy records the pushed array.
  await page.getByRole("button", { name: "push item" }).click();
  await expect(page.getByTestId("array-live")).toHaveText('["one"]');
  await expect(page.getByTestId("array-spy")).toContainText("one");

  // Remove — a structural array op the old factory's listeners.onChange never fired for; here it persists.
  await page.getByRole("button", { name: "remove item" }).click();
  await expect(page.getByTestId("array-live")).toHaveText("[]");
  // The latest spy state = the 2nd save carrying the now-empty array: "2:" (count 2, joined items empty).
  await expect(page.getByTestId("array-spy")).toHaveText("2:");
});

// CT-5 — status lifecycle + caption. A failing save → error + Retry affordance; making it succeed then
// retrying → saved. The caption renders ONLY in `saved`.
test("CT-5: status goes error→Retry→saved, caption shows in saved only", async ({ mount, page }) => {
  await mount(<BoundaryStatusStory />);

  await expect(page.getByTestId("status-state")).toHaveText("saved");
  // In `saved`, the caption is present.
  await expect(page.getByText("Synced across your devices.")).toBeVisible();

  // Type → the driver submits → the save REJECTS → error state + the Retry button.
  await page.getByLabel("Status text").fill("edited offline");
  await expect(page.getByTestId("status-state")).toHaveText("error");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  // In `error`, the caption is NOT rendered (the "Save failed — Retry · caption" line is unrepresentable).
  await expect(page.getByText("Synced across your devices.")).toHaveCount(0);

  // Make the save succeed, then hit Retry (submits current values unconditionally) → saved + caption back.
  await page.getByRole("button", { name: "make save succeed" }).click();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("status-state")).toHaveText("saved");
  await expect(page.getByText("Synced across your devices.")).toBeVisible();
});

// CT-6 — clean server-echo (§5, two-device freshness). A fresh serverValues (changed content) while the
// form is CLEAN re-baselines to the new server values; the same change while DIRTY keeps the edit.
test("CT-6: a server echo re-baselines a clean form but is kept out of a dirty one", async ({ mount, page }) => {
  await mount(<BoundaryCleanEchoStory />);

  await expect(page.getByLabel("Echo text")).toHaveValue("echo-1");

  // CLEAN case: an untouched form + a server echo (changed content) → the field adopts the new value.
  await page.getByRole("button", { name: "clean echo" }).click();
  await expect(page.getByLabel("Echo text")).toHaveValue("echo-2");

  // DIRTY case: edit (debounce is 5s, so the edit stays UNSAVED = dirty), then fire a distinct echo. The
  // dirty form must KEEP the edit (last-writer-wins) — the echo is NOT applied while there are unsaved
  // edits. A macrotask gives the (buggy) clobber every chance to land first.
  await page.getByLabel("Echo text").fill("my local edit");
  await page.getByRole("button", { name: "dirty echo" }).click();
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 200)));
  await expect(page.getByLabel("Echo text")).toHaveValue("my local edit");
});
