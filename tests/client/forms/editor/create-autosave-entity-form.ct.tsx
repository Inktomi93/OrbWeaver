// createAutosaveEntityForm CT — the D78 canonical regressions (autosave-form-doctrine.md §10
// CT-1..6). Each mounts the REAL session boundary over a save SPY; the F1/F2 live P0 reproductions
// become permanent pins. CT (not headless) because every scenario is a RENDER + STORE-SUBSCRIPTION +
// TEARDOWN interaction that only reproduces with the real React scheduler, real timers, and a live DOM
// (docs/law/Spine-Testing.md §7). Real timers + Playwright auto-retrying `expect` (fake timers drift vs
// React 19). Observation is the ONE-testid channel (§7 last-resort locator, sanctioned for a probe);
// the inputs/buttons use getByLabel/getByRole.

import { expect, test } from "@playwright/experimental-ct-react";
import {
  BoundaryArrayOpsStory,
  BoundaryBrickHealStory,
  BoundaryCleanEchoStory,
  BoundaryCompletionOwnershipStory,
  BoundaryEchoDuringDebounceStory,
  BoundaryIdentitySwitchStory,
  BoundaryReadOnlyStory,
  BoundaryReseedStory,
  BoundarySeamlessRefusalStory,
  BoundaryStatusStory,
  BoundaryUnmountFlushStory,
} from "./_ct-stories.tsx";

test("an older completion cannot clear or re-baseline a newer unsaved edit", async ({ mount, page }) => {
  await mount(<BoundaryCompletionOwnershipStory />);
  const input = page.getByLabel("Completion text");

  await input.fill("older submitted");
  await page.getByRole("button", { name: "submit now" }).click();
  await input.fill("newer submitted");
  await page.getByRole("button", { name: "submit now" }).click();
  await expect(page.getByTestId("completion-calls")).toHaveText("2");

  await page.getByRole("button", { name: "resolve second" }).click();
  await expect(page.getByTestId("completion-state")).toHaveText("saved");
  await input.fill("latest unsaved");
  await expect(page.getByTestId("completion-draft")).toHaveText("latest unsaved");

  await page.getByRole("button", { name: "resolve first" }).click();
  await expect(input).toHaveValue("latest unsaved");
  await expect(page.getByTestId("completion-draft")).toHaveText("latest unsaved");

  // Returning to the newer confirmed value is clean only if the older completion did not steal the
  // baseline. The old implementation re-baselined to "older submitted" and stayed Saving here.
  await input.fill("newer submitted");
  await expect(page.getByTestId("completion-state")).toHaveText("saved");
});

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

// CT-5 — status lifecycle. A failing save → error + Retry affordance; making it succeed then retrying →
// saved. The READOUT is asserted alongside the state enum, because the enum is the story's own testid and
// the words are what a user actually gets.
//
// RETARGETED by #104: this used to assert the `caption` reassurance line ("Synced across your devices.")
// appearing in `saved` and vanishing in `error`. The owner killed that line — a self-hosted single-user box
// syncs to nothing — and with zero remaining consumers the `caption` prop went with it, so the assertion
// now pins the two-word readout the component actually renders. The `error` arm's real invariant survives:
// in `error` the status is a Retry AFFORDANCE and never a reassuring word.
test("CT-5: status goes error→Retry→saved, and the readout says so", async ({ mount, page }) => {
  await mount(<BoundaryStatusStory />);

  const status = page.locator('[data-slot="autosave-status"]');
  await expect(page.getByTestId("status-state")).toHaveText("saved");
  await expect(status).toHaveText("Saved");

  // Type → the driver submits → the save REJECTS → error state + the Retry button.
  await page.getByLabel("Status text").fill("edited offline");
  await expect(page.getByTestId("status-state")).toHaveText("error");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  // In `error` nothing reassuring is on screen — the line is the failure plus its affordance.
  await expect(status).toContainText("Save failed");
  await expect(status).not.toContainText("Saved ");

  // Make the save succeed, then hit Retry (submits current values unconditionally) → saved.
  await page.getByRole("button", { name: "make save succeed" }).click();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("status-state")).toHaveText("saved");
  await expect(status).toHaveText("Saved");
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

// CT-9 — a pending debounced save survives a serverValues churn (the 2026-08-01 lost-save incident). The
// driver's timer used to live in the effect closure, so re-subscribing that effect (its deps carry the
// server-baseline hash) CLEARED the armed timer and never re-armed it: the edit was dropped silently while
// the status still read "Saved". Any settings write (busDriven refetch) or two-device echo churns
// `serverValues` — the form is dirty, so the clean-echo re-baseline correctly does nothing and the ONLY
// path to persistence is the timer. It must survive.
test("CT-9: a serverValues churn during the debounce does not drop the pending save", async ({ mount, page }) => {
  await mount(<BoundaryEchoDuringDebounceStory />);

  await expect(page.getByLabel("Churn text")).toHaveValue("srv-1");

  // Edit, then churn the server snapshot INSIDE the 300ms debounce window.
  await page.getByLabel("Churn text").fill("my edit");
  await page.getByRole("button", { name: "churn server snapshot" }).click();

  // The debounced save still fires, carrying the edit. (Pre-fix: the count stayed 0 forever.)
  await expect(page.getByTestId("echo-drop-log")).toHaveText("echo-drop-entity=my edit");
  await expect(page.getByTestId("echo-drop-count")).toHaveText("1");
  // The edit is not double-submitted by the re-subscription either.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));
  await expect(page.getByTestId("echo-drop-count")).toHaveText("1");
});

// CT-10 — unmounting the boundary flushes the pending edit. CT-3 pins the entity-switch trigger; this is
// the "close the settings modal / leave the pane mid-edit" one. Debounce is 5s, so a spy hit can ONLY be
// the teardown flush.
test("CT-10: unmounting the boundary flushes the pending edit instead of dropping it", async ({ mount, page }) => {
  await mount(<BoundaryUnmountFlushStory />);

  await page.getByLabel("Unmount text").fill("edited then left");
  await page.getByRole("button", { name: "unmount the pane" }).click();

  await expect(page.getByTestId("unmount-log")).toHaveText("unmount-entity=edited then left");
  await expect(page.getByTestId("unmount-count")).toHaveText("1");
});

// CT-11 — a mount with NO persistence seam REFUSES instead of lying (Codex audit client-forms-01). Both
// seams were optional and the driver ran `await save?.(value)`: it resolved on `undefined`, so the edit was
// re-baselined away, its crash-survival draft CLEARED, and the status set to "saved" — success reported for
// a write that never happened. The seam is now compile-required (the .test-d sibling pins that); this pins
// the runtime backstop a cast can still reach — the draft SURVIVES and the status is honest.
test("CT-11: a boundary with no persistence seam reports error and keeps the draft, never 'saved'", async ({ mount, page }) => {
  await mount(<BoundarySeamlessRefusalStory />);

  await expect(page.getByLabel("Seamless text")).toHaveValue("server value");

  // Edit → the 50ms driver submits → onSubmit refuses before the rebaseline/clearDraft/"saved" sequence.
  await page.getByLabel("Seamless text").fill("edit that must not be discarded");

  await expect(page.getByTestId("seamless-state")).toHaveText("error");
  // THE PIN: the crash-survival draft still holds the edit (pre-fix it was cleared as "saved").
  await expect(page.getByTestId("seamless-draft")).toHaveText("edit that must not be discarded");
  // The edit is still in the box, and the status never flips back to a success it did not earn.
  await expect(page.getByLabel("Seamless text")).toHaveValue("edit that must not be discarded");
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  await expect(page.getByTestId("seamless-state")).toHaveText("error");
});

// CT-12 — the DECLARED read-only arm (the member view of the Group / Field-overrides / Injections editors).
// It must never report "Saved" over an edit, and it must mirror nothing it could never save. The story's
// field is deliberately ENABLED — it plays the `disabled={!isHost}` a future field forgets — so what is
// under test is the boundary's own honesty, not the field's.
test("CT-12: a declared read-only mount reads 'blocked' when edited and mirrors no draft", async ({ mount, page }) => {
  await mount(<BoundaryReadOnlyStory />);

  // An untouched read-only mount is in sync with the server row.
  await expect(page.getByTestId("read-only-state")).toHaveText("saved");

  await page.getByLabel("Read-only text").fill("an edit that can never be saved");

  // THE PIN: the status is `blocked`, never "saved" — the driver is not making this write and says so.
  await expect(page.getByTestId("read-only-state")).toHaveText("blocked");
  // A macrotask past the 50ms debounce: no driver ever armed, so nothing flips it back to "saved".
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  await expect(page.getByTestId("read-only-state")).toHaveText("blocked");
  // Nothing was mirrored to the crash draft — a draft this mount could never save is only a future
  // stale-draft heal.
  await expect(page.getByTestId("read-only-draft")).toHaveText("");
});

// CT-7/CT-8 — the localStorage-brick fix. The store is PRE-SEEDED with a poisoned
// draft (values mismatch the server, baseline hash stale). The mount MUST discard it: the field heals to
// SERVER truth (CT-7), and ZERO saves fire without any user input (CT-8, the resurrection guard). Old
// behavior showed the stale draft as "saved" and resurrected it onto the server on first touch.
test("CT-7/CT-8: a poisoned draft is discarded on mount — field heals to server, zero saves fire", async ({ mount, page }) => {
  await mount(<BoundaryBrickHealStory />);

  // CT-7: the field shows SERVER truth, not the stale draft (the whole brick defect).
  await expect(page.getByLabel("Brick text")).toHaveValue("server truth");
  await expect(page.getByLabel("Brick text")).not.toHaveValue("STALE DRAFT (should never show)");

  // CT-8: no user input has occurred — a macrotask boundary gives any (buggy) mount-time resurrection
  // save every chance to fire; the count must stay exactly 0.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  await expect(page.getByTestId("brick-count")).toHaveText("0");
});
