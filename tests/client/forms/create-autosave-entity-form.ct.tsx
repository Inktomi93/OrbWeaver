// createAutosaveEntityForm CT — the regression that PINS the draft-mirror clobber fixed by the
// seed-effect `seededRef` guard (create-autosave-entity-form.ts ~line 112). This is a browser/CT
// lane (not the headless sibling create-saved-entity-form.test.ts) because the bug is a RENDER +
// EFFECT interaction — a host re-render re-running the seed effect — that only reproduces with the
// real React scheduler, real timers, and a live DOM (core/Spine-Testing.md §7).
//
// THE SEQUENCE it reproduces (matching the fix's own header comment):
//   1. mount → `draftSeed` is undefined, so the seed effect no-ops (both fixed AND buggy).
//   2. type an edit → the debounced onChange mirrors it into the draft slot (the observer shows it).
//   3. click "force host re-render" → `serverValues` gets a FRESH identity → the host re-renders →
//      `draftSeed` is re-read and now DEFINED (the edit) → its identity flips.
//        • BUGGY (deps `[entityId, draftSeed]`, no guard): the effect RE-RUNS and writes the fixed
//          mount `seedRef.current` (= SEED text) back OVER the edit — the observer reverts to seed.
//        • FIXED (`seededRef` short-circuits): the effect body is skipped — the edit HOLDS.
//
// Real timers + Playwright auto-retrying `expect` (§7 — fake timers drift against React 19). The
// draft-state observation is the ONE testid element (§7 last-resort locator, sanctioned for an
// observability probe, never for the input/button — those use getByLabel/getByRole).

import { expect, test } from "@playwright/experimental-ct-react";
import {
  AutosaveDraftMirrorStory,
  AutosaveFailedSaveStory,
  AutosaveUnmountFlushStory,
} from "./_ct-stories";

test("a host re-render after an edit does NOT clobber the draft mirror back to the mount seed", async ({
  mount,
  page,
}) => {
  await mount(<AutosaveDraftMirrorStory />);

  const draftState = page.getByTestId("draft-mirror-state");
  // At mount the seed effect no-ops (draftSeed undefined) → the slot is empty.
  await expect(draftState).toHaveText("{}");

  // Step 2 — the edit. `getByLabel` (not testid) resolves the bound TextField via its <Field> label.
  await page.getByLabel("Draft text").fill("edited value");

  // The debounced onChange (50ms) mirrors the edit into the draft slot — auto-retry waits it out.
  // The edit is kept INVALID (see the story's validator) so it mirrors but never submits+clears;
  // this persisted mirror is the precondition the clobber assertion below then defends.
  await expect(draftState).toContainText('"text":"edited value"');

  // Step 3 — the clobber trigger: a host re-render handing `serverValues` a fresh object identity.
  await page.getByRole("button", { name: "force host re-render" }).click();

  // THE PIN: the draft slot STILL holds the edit, NOT the mount seed ("seed text"). Without the
  // `seededRef` guard this fails here (the re-run seed effect wrote `seedRef.current` over the edit);
  // with it, the edit survives. Auto-retry gives the (buggy) clobber every chance to land first.
  await expect(draftState).toContainText('"text":"edited value"');
  await expect(draftState).not.toContainText("seed text");
});

test("a field unmounting mid-debounce flushes its pending edit via onFieldUnmount", async ({
  mount,
  page,
}) => {
  await mount(<AutosaveUnmountFlushStory />);

  const savedState = page.getByTestId("unmount-flush-saved-state");
  // Empty-key default is `{}` (matching the draft-mirror story's own `DraftObserver` convention).
  await expect(savedState).toHaveText("{}");

  await page.getByLabel("Flush text").fill("flushed value");
  // The debounce is deliberately 5s — nothing has fired yet, so the mirror/submit is still pending.
  await expect(savedState).toHaveText("{}");

  // Unmount ONLY the field (the form instance stays mounted) — this is what `onFieldUnmount` fires on.
  await page.getByRole("button", { name: "unmount field" }).click();

  // THE PIN: the flush lands well inside the 5s debounce window, proving `onFieldUnmount` drove the
  // submit directly (`handleSubmit()`), not the (much later) natural debounce timer.
  await expect(savedState).toContainText('"text":"flushed value"');
});

// The complement — the setRoomOverrides({})-on-open regression, empirically traced to `onFieldUnmount`
// (NOT onChange): a field unmounting on an UNTOUCHED form must NOT flush its seed. React StrictMode's dev
// double-invoke (mount→unmount→remount) unmounts fields on EVERY mount, and in prod any tab-away before an
// edit does the same — without the `!isDefaultValue` guard, that flush autosaved the untouched seed to the
// server (room-overrides wrote `{}` on every chat-open).
test("a field unmounting on an UNTOUCHED form does NOT flush its seed (the setRoomOverrides({}) bug)", async ({
  mount,
  page,
}) => {
  await mount(<AutosaveUnmountFlushStory />);

  const savedState = page.getByTestId("unmount-flush-saved-state");
  await expect(savedState).toHaveText("{}");

  // Unmount the field with NO prior edit. `onFieldUnmount` fires SYNCHRONOUSLY in the unmount commit, so a
  // BROKEN guard has already written the untouched seed (`{"text":""}`) to the save signal by the time this
  // click resolves — this assertion would then fail. The `!isDefaultValue` guard skips it; the signal stays
  // empty. (Deterministic, no wait: the flush is synchronous, not the 5s debounce.)
  await page.getByRole("button", { name: "unmount field" }).click();
  await expect(savedState).toHaveText("{}");
});

// F4 — a REJECTING autosave must not leave an unhandled promise rejection, and must skip clearDraft so
// the edit survives in the mirror for retry. Before the fix, the listener's `void handleSubmit()` let
// form-core's re-thrown onSubmit error escape as an unhandledrejection (and poisoned CT console asserts).
test("a rejecting autosave surfaces no unhandled rejection and preserves the draft", async ({
  mount,
  page,
}) => {
  await mount(<AutosaveFailedSaveStory />);

  const draftState = page.getByTestId("failed-save-draft");
  const calledState = page.getByTestId("failed-save-called");
  const rejectionCount = page.getByTestId("failed-save-rejections");
  await expect(draftState).toHaveText("{}");
  await expect(calledState).toHaveText("{}");
  await expect(rejectionCount).toHaveText("0");

  // Type a VALID edit → the debounced onChange mirrors it, then submits → the save REJECTS.
  await page.getByLabel("Failing text").fill("edited while offline");

  // The submit fired (save was called with the edit) and rejected — proving the failure path ran.
  await expect(calledState).toContainText('"text":"edited while offline"');
  // The mirror STILL holds the edit: onSubmit awaits save BEFORE clearDraft, so a failed save skips
  // the clear (the data survives for retry). A SUCCESSFUL save would have cleared it to "{}".
  await expect(draftState).toContainText('"text":"edited while offline"');

  // THE PIN: the rejection was swallowed by the listener's `.catch` — zero unhandled rejections. A
  // macrotask boundary guarantees any pending `unhandledrejection` microtask (which the broken `void`
  // path WOULD queue after the reject we just observed) has fired before this assertion reads the count.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  await expect(rejectionCount).toHaveText("0");
});
