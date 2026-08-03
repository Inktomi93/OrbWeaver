// CT: the Databank CONTENT pane over the stubbed network. What it pins (databank-surface-spec §6.2):
//
//   · the no-selection arm TEACHES what the bank is — an empty CONTENT pane reads as unbuilt;
//   · the selection handoff: the row you clicked is the document the pane paints;
//   · the identity header keeps its phase chip (the chip §6.1 deletes from the LIST ROW, because here it is
//     the answer to the question the user asked by opening the document) and the Details readout;
//   · the source text is a SEPARATE `includeText` read fired only on REVEAL — the whole reason the contract
//     splits the two reads, and what keeps opening a 4 MB document cheap — rendered as a read-only REGION,
//     never a `Textarea` (legacy's form control announced the canon as an editable textbox).

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankDetailStory, DatabankDetailWideStory, DatabankWorkspaceStory } from "../_ct-stories.tsx";
import { INDEXING_DOC, READY_DOC, SOURCE_TEXT, stubDatabank } from "../fixtures.ts";

/** The row bodies open a document — matched loosely because the row's accessible name carries its scent
 *  line as well as its title (top-level so the pattern is compiled once). */
const CRIMSON_ROW = /The Crimson Court/;
const DUSKWATER_ROW = /Duskwater Barony/;

test("CONTENT with nothing open TEACHES what the bank is — never a blank pane", async ({ mount, page }) => {
  await stubDatabank(page);
  const content = await mount(<DatabankDetailStory />);

  await expect(content.getByText("Your databank")).toBeVisible();
});

test("opening a row from the LIST paints THAT document's detail (the selection handoff)", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);

  await workspace.getByRole("button", { name: DUSKWATER_ROW }).first().click();

  // The row you clicked is the document you got — in the pane, not just on the wire.
  await expect(workspace.getByRole("heading", { name: "Duskwater Barony" })).toBeVisible();
  await expect.poll(() => trpc.lastInput("databank.get"), { intervals: [20, 50, 100] }).toEqual({ id: INDEXING_DOC.id });
});

test("the detail states its metadata, keeps its Ready chip, and offers Reindex", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  await expect(workspace.getByText("Ready", { exact: true })).toBeVisible();
  await expect(workspace.getByText("application/pdf")).toBeVisible();
  await expect(workspace.getByText("12 / 12 embedded")).toBeVisible();

  await workspace.getByRole("button", { name: "Reindex" }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex"), { intervals: [20, 50, 100] }).toEqual({ scope: { kind: "document", documentId: READY_DOC.id } });
});

// THE DETAIL KEEPS A MEASURE (side-eye sweep 2026-08-03). `justify="between"` label/value rows spend
// whatever width they are given: at the 1448px desktop CONTENT pane "Origin" sat at x=496 and its own value
// "Text" at x=1387 — 890px of nothing between a label and the thing it labels, and Reindex flung to the far
// edge of its sentence. Both sibling member editors (tag, regex) keep `max-w-prose`; this one did not.
// Asserted at the WIDEST real host (the 720px story cannot see it) as the RENDERED readout width against
// the pane's own, so a token change cannot drift out from under it and a px literal cannot satisfy it.
test("the detail keeps a MEASURE at a desktop-wide pane — it does not spread with the window", async ({ mount, page }) => {
  await stubDatabank(page);
  const wide = await mount(<DatabankDetailWideStory />);
  await wide.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(wide.getByText("application/pdf")).toBeVisible();

  const measured = await page.evaluate(() => {
    const label = [...document.querySelectorAll("p,span")].find((el) => el.textContent?.trim() === "Origin" && el.children.length === 0);
    const pane = document.querySelector('[data-slot="databank-content"]');
    if (label === undefined || pane === null) {
      return null;
    }
    // The readout ROW is the label's parent — its width is what the whole finding is about.
    const row = label.parentElement;
    return { row: row === null ? 0 : row.getBoundingClientRect().width, pane: pane.getBoundingClientRect().width };
  });

  expect(measured).not.toBeNull();
  // The pane really is the wide one…
  expect(measured?.pane ?? 0).toBeGreaterThan(1200);
  // …and the readout is not. `max-w-prose` is the measure both sibling member editors (tag, regex) keep;
  // asserted as a RELATION to the pane, so the token behind it can move without rotting this line.
  expect(measured?.row ?? Number.POSITIVE_INFINITY).toBeLessThan((measured?.pane ?? 0) * 0.7);
});

test("source text is a read-only REGION, fetched only on reveal — not a Textarea, not part of the open read", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  // Opening a document must NOT haul its canon: the text is absent until asked for.
  await expect(workspace.getByText(SOURCE_TEXT)).toHaveCount(0);

  await workspace.getByRole("button", { name: "View source text" }).click();
  await expect(workspace.getByText(SOURCE_TEXT)).toBeVisible();
  // The readout is not a form control — legacy's `Textarea readOnly` announced as an editable textbox.
  await expect(workspace.locator("textarea")).toHaveCount(0);
  await expect.poll(() => trpc.inputs("databank.get"), { intervals: [20, 50, 100] }).toContainEqual({ id: READY_DOC.id, includeText: true });
});
