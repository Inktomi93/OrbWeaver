// CT: the P4 immersive-card lifecycle chrome (parity-plus §4.7) — collapsed sandbox + view-raw + expand.
// The SECURITY boundary is SandboxFrame's own (sandbox-frame.ct.tsx pins it); this suite pins the chrome:
// the title label, the lenient-origin marker, the raw-source toggle showing the EXACT stored bytes, and
// the expand lightbox labelled by the title.

import { ImmersiveCard } from "@orb/ui/immersive-card";
import { expect, test } from "@playwright/experimental-ct-react";

const HTML = "<div>an in-world page</div>";

test("the collapsed card renders the title chrome over a sandboxed iframe (never main-DOM HTML)", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Zandik's letter" origin="fence" />);
  await expect(cmp.locator('[data-slot="immersive-card-title"]')).toContainText("Zandik's letter");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
  await expect(cmp.locator("div", { hasText: "an in-world page" })).toHaveCount(0);
});

test("a title-less card falls back to the untitled label; a lenient card carries the auto marker", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} origin="lenient" />);
  await expect(cmp.locator('[data-slot="immersive-card-title"]')).toContainText("Immersive card");
  await expect(cmp.locator('[data-slot="immersive-card-origin"]')).toContainText("auto");
  await expect(cmp).toHaveAttribute("data-origin", "lenient");
});

test("view-raw shows the EXACT stored source and toggles back to the sandbox", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Terminal" origin="fence" />);
  await cmp.getByRole("button", { name: "View raw source" }).click();
  await expect(cmp.locator('[data-slot="immersive-card-raw"]')).toHaveText(HTML);
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await cmp.getByRole("button", { name: "Show rendered card" }).click();
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

// RV-1 — the §4.7 formed-COLLAPSED state: the card comes down to its bare title bar and back.
test("collapse takes the card down to the title bar (body unmounted) and re-showing restores the sandbox", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Zandik's letter" origin="fence" />);
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);

  const collapse = cmp.getByRole("button", { name: "Collapse card" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();

  // The title bar survives; the body (and with it the sandboxed frame) is gone — not merely hidden.
  await expect(cmp.locator('[data-slot="immersive-card-title"]')).toContainText("Zandik's letter");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  // View-raw acts on the body, so it is applicability-omitted while collapsed (never a disabled twin).
  await expect(cmp.getByRole("button", { name: "View raw source" })).toHaveCount(0);

  const show = cmp.getByRole("button", { name: "Show card" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
  await expect(cmp.getByRole("button", { name: "View raw source" })).toHaveCount(1);
});

test("the collapse control is keyboard-operable and wears the same chrome box as the expand control", async ({ mount }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Zandik's letter" origin="fence" />);
  const collapse = cmp.getByRole("button", { name: "Collapse card" });
  const expand = cmp.getByRole("button", { name: "Expand card" });

  // Uniform header band: the disclosure is the same ghost icon button as the lightbox control beside it
  // (the Collapsible trigger renders THROUGH Button, so its box is the button box, not a text trigger's).
  const [collapseBox, expandBox] = await Promise.all([collapse.boundingBox(), expand.boundingBox()]);
  expect(collapseBox?.width).toBe(expandBox?.width);
  expect(collapseBox?.height).toBe(expandBox?.height);

  await collapse.focus();
  await collapse.press("Enter");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await cmp.getByRole("button", { name: "Show card" }).press(" ");
  await expect(cmp.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

test("expand opens the lightbox dialog labelled by the title, with its own sandboxed frame", async ({ mount, page }) => {
  const cmp = await mount(<ImmersiveCard html={HTML} title="Poster" origin="fence" />);
  await cmp.getByRole("button", { name: "Expand card" }).click();
  const dialog = page.locator('[data-slot="dialog-popup"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-slot="immersive-card-lightbox-header"]')).toContainText("Poster");
  await expect(dialog.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});
