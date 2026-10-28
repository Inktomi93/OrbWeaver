// Detector controls belong here: planted markup proves the declared owner boundary independently of product layout.
import { expect, test } from "@playwright/test";
import { actionGroupGeometry } from "./action-group-geometry.ts";

test("an owned control passes while a visually overlapping sibling cannot borrow its region", async ({ page }) => {
  await page.setContent(
    '<div id="owner" style="width:300px;height:80px"><button type="button">Owned</button></div>' +
      '<button type="button" style="position:absolute;left:120px;top:10px">Sibling</button>',
  );
  const owner = page.locator("#owner");
  const owned = page.getByRole("button", { name: "Owned", exact: true });
  const sibling = page.getByRole("button", { name: "Sibling", exact: true });
  expect((await actionGroupGeometry(owner, [owned])).inlineOverflow).toBe(0);
  await expect(actionGroupGeometry(owner, [owned, sibling])).rejects.toThrow("Action must belong to the declared action-group region");
});

test("a contained descendant still reports genuine inline overflow", async ({ page }) => {
  await page.setContent('<div id="owner" style="width:100px"><button type="button" style="width:200px">Wide owned action</button></div>');
  const geometry = await actionGroupGeometry(page.locator("#owner"), [page.getByRole("button", { name: "Wide owned action", exact: true })]);
  expect(geometry.controls).toHaveLength(1);
  expect(geometry.inlineOverflow).toBeGreaterThan(1);
});

test("a control on another page cannot be measured against this region", async ({ page }) => {
  await page.setContent('<div id="owner"><button type="button">Owned</button></div>');
  const owner = page.locator("#owner");
  expect((await actionGroupGeometry(owner, [page.getByRole("button", { name: "Owned", exact: true })])).inlineOverflow).toBe(0);
  const other = await page.context().newPage();
  try {
    await other.setContent('<button type="button">Other page</button>');
    await expect(actionGroupGeometry(owner, [other.getByRole("button", { name: "Other page", exact: true })])).rejects.toThrow(
      "Action must belong to the declared action-group page",
    );
  } finally {
    await other.close();
  }
});
