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
import { DatabankDetailStory, DatabankWorkspaceStory } from "../_ct-stories";
import { INDEXING_DOC, READY_DOC, SOURCE_TEXT, stubDatabank } from "../fixtures";

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
