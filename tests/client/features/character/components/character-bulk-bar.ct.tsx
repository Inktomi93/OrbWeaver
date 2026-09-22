// CT: `<CharacterBulkBar>` at a NARROW LIST panel (P1 regression — the trailing Delete button was clipped
// past the ~337px panel edge). Asserts all three bulk actions render AND the last one (Delete) fits fully
// inside the panel width (its right edge ≤ the panel's), which `size="sm"` restores.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type {} from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { CharacterBulkBarStory } from "../_ct-stories.tsx";

test("the bulk actions fit the narrow panel — Delete is not clipped past the edge", async ({ mount, page }) => {
  const component = await mount(<CharacterBulkBarStory />);
  const del = component.getByRole("button", { name: "Delete", exact: true });
  await expect(component.getByRole("button", { name: "Tag", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await expect(del).toBeVisible();

  // The Delete button's right edge stays within the panel box (no clip past the ~337px edge). Null boxes
  // (an unmeasurable/hidden element) resolve to a failing comparison rather than a skipped assertion.
  // #838 — the bar is the `bulk` SLICE of one vocabulary (`lib/character-actions.ts`), in its declared
  // order. Literal, so a registry edit that re-orders or re-labels this bar reds here.
  await expect(component.locator('[data-slot="selection-bar-actions"]').getByRole("button")).toHaveText(["Tag", "Archive", "Delete"]);

  const panelBox = await page.getByTestId("bulk-panel").boundingBox();
  const delBox = await del.boundingBox();
  const panelRight = (panelBox?.x ?? 0) + (panelBox?.width ?? 0);
  const delRight = (delBox?.x ?? Number.POSITIVE_INFINITY) + (delBox?.width ?? 0);
  expect(delRight).toBeLessThanOrEqual(panelRight);
});

test("bulk selection clears only after the durable archive succeeds and remains for retry on rejection", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "character.bulkArchive": () => {
      attempts += 1;
      return attempts === 1 ? trpcError() : undefined;
    },
  });
  const component = await mount(<CharacterBulkBarStory />);
  const count = component.getByRole("status", { name: "Bulk selection count" });
  const archive = component.getByRole("button", { name: "Archive", exact: true });

  await expect(count).toHaveText("3");
  await archive.click();
  await expect.poll(() => trpc.count("character.bulkArchive")).toBe(1);
  await expect(archive).toBeEnabled();
  await expect(count).toHaveText("3");

  await archive.click();
  await expect(count).toHaveText("0");
  await expect.poll(() => trpc.count("character.bulkArchive")).toBe(2);
});

const BULK_ACTIONS = ["archive", "tag", "delete"] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];
type Replacement = "overlap" | "disjoint";
type Verdict = "success" | "rejection";

const REPLACEMENTS: readonly Replacement[] = ["overlap", "disjoint"];
const VERDICTS: readonly Verdict[] = ["success", "rejection"];
const LABEL_BY_ACTION: Readonly<Record<BulkAction, string>> = {
  archive: "Archive",
  tag: "Tag",
  delete: "Delete",
};

async function submitBulkAction(component: Locator, action: BulkAction): Promise<void> {
  await component.getByRole("button", { name: LABEL_BY_ACTION[action], exact: true }).click();
  if (action === "tag") {
    const page = component.page();
    await page.getByRole("combobox", { name: "Tag name" }).fill("adventure");
    await page.getByRole("button", { name: 'Create "adventure"' }).click();
  } else if (action === "delete") {
    await component.page().getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  }
}

async function replaceSelectionWhileHeld(component: Locator, replacement: Replacement): Promise<void> {
  await component.getByTestId("replace-selection-clear").click();
  await component.getByRole("button", { name: replacement === "overlap" ? "Select overlapping newer characters" : "Select newer character" }).click();
  await expect(component.getByRole("status", { name: "Bulk selected IDs" })).toHaveText(replacement === "overlap" ? "char_a,char_d" : "char_d");
}

async function routeBulkAction(page: Page, action: BulkAction, held: ReturnType<typeof trpcHold>): Promise<void> {
  switch (action) {
    case "archive":
      await routeTrpc(page, { "character.bulkArchive": held });
      return;
    case "tag":
      await routeTrpc(page, { "character.bulkAddCardTag": held, "tag.listTagsWithUsage": [] });
      return;
    case "delete":
      await routeTrpc(page, { "character.bulkRemove": held });
  }
}

function releaseBulkSuccess(action: BulkAction, held: ReturnType<typeof trpcHold>): void {
  switch (action) {
    case "archive":
      held.release(undefined);
      return;
    case "tag":
      held.release({ applied: ["char_a", "char_b", "char_c"], failed: [] });
      return;
    case "delete":
      held.release(undefined);
  }
}

function expectedSelection(replacement: Replacement, verdict: Verdict): string {
  if (verdict === "success" || replacement === "disjoint") {
    return "char_d";
  }
  return "char_a,char_d";
}

for (const action of BULK_ACTIONS) {
  for (const replacement of REPLACEMENTS) {
    for (const verdict of VERDICTS) {
      test(`${LABEL_BY_ACTION[action]} ${replacement} ${verdict}: the completion retires only IDs owned by the submitted snapshot`, async ({ mount, page }) => {
        const held = trpcHold();
        await routeBulkAction(page, action, held);
        const component = await mount(<CharacterBulkBarStory />);

        await submitBulkAction(component, action);
        await held.requested;
        await replaceSelectionWhileHeld(component, replacement);
        if (verdict === "success") {
          releaseBulkSuccess(action, held);
        } else {
          held.release(trpcError());
        }

        await expect(component.getByRole("status", { name: "Bulk selected IDs" })).toHaveText(expectedSelection(replacement, verdict));
      });
    }
  }
}
