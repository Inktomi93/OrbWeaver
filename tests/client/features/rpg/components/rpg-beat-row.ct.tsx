// CT: the chronicle BEAT row's body editor under TWO WRITERS (#1559 — the #1485/#1502 defect class in its
// second home). Beats are model-writable, so a body changing underneath an open editor is the NORMAL case
// during play, not an edge: the host is typing while the turn that rewrites the beat lands.
//
// The row's own commit path is already pinned end-to-end through the production host
// (`tests/client/features/rpg/lib/rpg-context-section.ct.tsx` — "a beat row's BODY expands in place into a
// multi-line editor, and blur saves it", plus the Escape arm). What that host CANNOT express is the
// collision: its beats come from a stubbed `rpg.listJournal`, so nothing moves the body WHILE the editor is
// open. That needs a parent holding the content — `BeatRowTwoWritersStory` — which is the same reason
// `TrackerValueTwoWriters` exists next door. These three cases mirror the tracker's three, deliberately:
// one resolver (`lib/edit-session.ts`), one grammar, two surfaces.

import { expect, test } from "@playwright/experimental-ct-react";
import { BeatRowTwoWritersStory } from "../_ct-stories.tsx";

/** The body editor's accessible name — `${title} entry`, shared by the rest trigger and the field. */
const BODY = "Sola's debt entry";
const ARRIVED = "The debt was called in at the Lantern.";

test("an untouched open editor commits NOTHING over a body that changed underneath (#1502)", async ({ mount, page }) => {
  const component = await mount(<BeatRowTwoWritersStory />);
  await page.getByRole("button", { name: BODY }).click();
  const field = page.getByRole("textbox", { name: BODY });
  await expect(field).toHaveValue("She owes the party a favour.");

  await component.getByRole("button", { name: "arrive rewrite" }).click(); // no blur — focus stays in the field
  await field.blur();

  await expect(component.getByTestId("beat-content-committed")).toHaveText("none");
  // …and what arrived is what stands, at rest.
  await expect(component.getByRole("button", { name: BODY })).toContainText(ARRIVED);
});

test("a real edit racing a rewrite is HELD as a conflict, not resolved for the host (#1559)", async ({ mount, page }) => {
  // THE DEFECT: this row judged the commit against `openedFrom` (so an untouched editor was safe) but had
  // no third case — with the host's own text in the field it took the host's text silently, where the
  // tracker holds and asks. A model rewrite the host never saw was overwritten without a word.
  const component = await mount(<BeatRowTwoWritersStory />);
  await page.getByRole("button", { name: BODY }).click();
  const field = page.getByRole("textbox", { name: BODY });
  await field.fill("She owes the party a favour, and she knows it.");
  await component.getByRole("button", { name: "arrive rewrite" }).click();
  await field.blur();

  // Nothing sent, the editor is still open holding the host's text, and it SAYS what arrived.
  await expect(component.getByTestId("beat-content-committed")).toHaveText("none");
  await expect(field).toHaveValue("She owes the party a favour, and she knows it.");
  await expect(field).toHaveAttribute("data-conflict", ARRIVED);
  await expect(field).toHaveAttribute("data-invalid", "");
  const said = component.locator('[data-slot="rpg-beat-body-conflict"]');
  await expect(said).toContainText(ARRIVED);
  await expect(said).toContainText("save again to overwrite it");
  // The reader of the FIELD is told there is something to read (the line is its description).
  await expect(field).toHaveAttribute("aria-describedby", (await said.getAttribute("id")) ?? "");

  // Committing again is the deliberate overwrite — the conflict is a speed bump, not a lock. The first
  // commit already took focus off the field (blur is what ran it), so the second is re-entered on purpose.
  await field.focus();
  await field.blur();
  await expect(component.getByTestId("beat-content-committed")).toHaveText("She owes the party a favour, and she knows it.");
  await expect(page.getByRole("textbox", { name: BODY })).toHaveCount(0);
});

test("Escape out of a conflict keeps what ARRIVED and sends nothing (#1559)", async ({ mount, page }) => {
  const component = await mount(<BeatRowTwoWritersStory />);
  await page.getByRole("button", { name: BODY }).click();
  const field = page.getByRole("textbox", { name: BODY });
  await field.fill("She owes the party a favour, and she knows it.");
  await component.getByRole("button", { name: "arrive rewrite" }).click();
  await field.blur();
  await expect(field).toHaveAttribute("data-conflict", ARRIVED);

  await field.focus();
  await field.press("Escape");
  await expect(page.getByRole("textbox", { name: BODY })).toHaveCount(0);
  await expect(component.getByTestId("beat-content-committed")).toHaveText("none");
  await expect(component.getByRole("button", { name: BODY })).toContainText(ARRIVED);
});
