// CT: the Databank CONTEXT arm — the activation panel. What it pins (databank-surface-spec §6):
//
//   · with nothing open it renders the SECTION's own no-selection copy, not the generic "Details / select
//     something" filler the F-12 sweep deleted. A `single` context body is mounted unconditionally by the
//     shell and handed no result, so this arm is the body's own to render;
//   · it owns the OWNER-scoped `Everywhere` write (per-chat attach is HOST authority and lives in the chat
//     panel — the write lives where the authority lives);
//   · it states WHERE the document is active, as counts rather than a roster of other people's rooms.

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankContextStory, DatabankWorkspaceStory } from "../_ct-stories";
import { READY_DOC, stubDatabank } from "../fixtures";

/** The row body opens a document — matched loosely because the row's accessible name carries its scent
 *  line as well as its title (top-level so the pattern is compiled once). */
const CRIMSON_ROW = /The Crimson Court/;

test("CONTEXT with nothing open says what the pane WILL show (its own words, F-12)", async ({ mount, page }) => {
  await stubDatabank(page);
  const context = await mount(<DatabankContextStory />);

  await expect(context.getByText("Where a document fires")).toBeVisible();
  // The generic filler the F-12 sweep deleted must not come back.
  await expect(context.getByText("Select something to see its details here.")).toHaveCount(0);
});

test("the activation body owns the Everywhere write and states where the document is active", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  const toggle = workspace.getByRole("switch", { name: "Stop feeding The Crimson Court to every chat" });
  await expect(toggle).toBeVisible();
  await expect(workspace.getByText("Every chat", { exact: true })).toBeVisible();
  await expect(workspace.getByText("1 chat", { exact: true })).toBeVisible();

  await toggle.click();
  await expect.poll(() => trpc.lastInput("databank.detachGlobal"), { intervals: [20, 50, 100] }).toEqual({ documentId: READY_DOC.id });
});
