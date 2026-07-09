// createSavedEntityForm CT — pins `promote()`'s `dontUpdateMeta: true` meta-preservation guarantee
// (create-saved-entity-form.ts `promote()`) through the REAL factory-exported hook, not just the
// raw FormApi call it wraps (the headless `create-saved-entity-form.test.ts` sibling pins that
// underlying library contract; this closes the gap to the actual `promote()` wrapper). A browser/CT
// lane (not headless) because `form.Subscribe` needs a real render to observe `isDirty` reactively
// (core/Spine-Testing.md §7).

import { expect, test } from "@playwright/experimental-ct-react";
import {
  SavedDraftMirrorStory,
  SavedDraftRestoreStory,
  SavedEntityPromoteStory,
} from "./_ct-stories";

test("promote() with dontUpdateMeta keeps the form's isDirty false", async ({ mount, page }) => {
  await mount(<SavedEntityPromoteStory />);

  const isDirtyState = page.getByTestId("promote-story-is-dirty");
  await expect(isDirtyState).toHaveText("false");

  await page.getByRole("button", { name: "promote avatarAssetId" }).click();

  // THE PIN: promote() is a mount-time NON-USER write — it must change the underlying value (a
  // regular setFieldValue call would flip isDirty here) WITHOUT ever flipping isDirty.
  await expect(isDirtyState).toHaveText("false");
});

// ---------------------------------------------------------------------------------------------
// Obligation 5 (OPTIONAL) — the crash-survival draft mirror (create-saved-entity-form.ts; UI-Primitives
// §13.4 obligation-5 doctrine). The dirty-pill HONESTY is the whole point: a restored draft must LIGHT
// the pill or the next navigation silently loses the work.

test("a surviving draft is restored AND lights the pill (isDefaultValue flips false)", async ({
  mount,
  page,
}) => {
  await mount(<SavedDraftRestoreStory />);

  // THE PIN: the form seeds from the SERVER row, then the promotion effect applies the surviving draft
  // as a USER write — so the field shows the DRAFT (not the server seed) and the pill signal flips.
  await expect(page.getByLabel("Saved text")).toHaveValue("restored draft");
  // A restored draft that read `isDefaultValue: true` would be a lie — a "clean"-looking form that
  // drops the work on the next navigation. It MUST be false.
  await expect(page.getByTestId("saved-restore-is-default")).toHaveText("false");
});

test("a host re-render does NOT re-apply the mount draft over a live edit (draftSeededRef guard)", async ({
  mount,
  page,
}) => {
  await mount(<SavedDraftRestoreStory />);

  const field = page.getByLabel("Saved text");
  const draftState = page.getByTestId("saved-restore-draft");
  // Restored + promoted at mount.
  await expect(field).toHaveValue("restored draft");

  // Edit over the restored draft — the debounced listener mirrors the new text into the same slot.
  await field.fill("live edit");
  await expect(draftState).toContainText('"text":"live edit"');

  // The clobber trigger: a background refetch handing `serverValues` a fresh identity → `draftSeed`
  // flips → the promotion effect RE-RUNS. Auto-retry gives the (buggy) clobber every chance to land.
  await page.getByRole("button", { name: "force host re-render" }).click();

  // THE PIN: the guard skips the re-run, so the live edit HOLDS — without it the effect would re-apply
  // the ORIGINAL mount draft ("restored draft") back over the edit.
  await expect(field).toHaveValue("live edit");
  await expect(draftState).toContainText('"text":"live edit"');
  await expect(draftState).not.toContainText("restored draft");
});

test("an untouched open mints NO draft (the seed is never mirrored)", async ({ mount, page }) => {
  await mount(<SavedDraftMirrorStory />);

  // THE PIN: mounting an editor with no server-side draft and typing nothing must never write a draft
  // slot — the listener skips the untouched seed (`isDefaultValue` true), so the slot stays empty.
  await expect(page.getByTestId("saved-mirror-draft")).toHaveText("{}");
});

test("a real edit mirrors into the draft slot (debounced)", async ({ mount, page }) => {
  await mount(<SavedDraftMirrorStory />);

  const draftState = page.getByTestId("saved-mirror-draft");
  await expect(draftState).toHaveText("{}");

  await page.getByLabel("Mirror text").fill("authored text");

  // THE PIN: the debounced form-level listener mirrors the edit (mirror ONLY — this factory stays
  // button-gated, so the edit is NOT submitted). Auto-retry waits out the debounce.
  await expect(draftState).toContainText('"text":"authored text"');
});

test("a confirmed save clears the mirror", async ({ mount, page }) => {
  await mount(<SavedDraftMirrorStory />);

  const draftState = page.getByTestId("saved-mirror-draft");
  await page.getByLabel("Mirror text").fill("authored text");
  await expect(draftState).toContainText('"text":"authored text"');

  await page.getByRole("button", { name: "save" }).click();

  // THE PIN: onSubmit clears the mirror after `save` resolves (a confirmed save makes the draft
  // redundant — a later crash must not resurrect it over fresher server truth).
  await expect(draftState).toHaveText("{}");
});

test("an explicit discard clears the mirror", async ({ mount, page }) => {
  await mount(<SavedDraftMirrorStory />);

  const draftState = page.getByTestId("saved-mirror-draft");
  await page.getByLabel("Mirror text").fill("authored text");
  await expect(draftState).toContainText('"text":"authored text"');

  await page.getByRole("button", { name: "discard" }).click();

  // THE PIN: discard() resets the form AND drops the mirror — otherwise a reload would resurrect the
  // very draft the user just chose to throw away.
  await expect(draftState).toHaveText("{}");
});
