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
import { AutosaveDraftMirrorStory, AutosaveUnmountFlushStory } from "./_ct-stories";

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
