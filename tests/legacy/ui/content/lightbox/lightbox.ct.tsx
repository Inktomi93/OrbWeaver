import { Lightbox } from "@orb/ui/lightbox";
import { expect, test } from "@playwright/experimental-ct-react";
import { LightboxHarness } from "./lightbox.fixtures.tsx";

const noop = (_open: boolean): void => undefined;

const EXTERNAL = ["https://cdn.example", ".test/z.png"].join("");

test("open renders the media through MessageMedia; the external gate still composes", async ({ mount, page }) => {
  await mount(<Lightbox open={true} onOpenChange={noop} src={{ kind: "external", url: EXTERNAL }} media="image" alt="z" />);
  // Dialog portals to the body — the gated placeholder (not a live external img) is what shows.
  await expect(page.locator('[data-slot="message-media-placeholder"]')).toBeVisible();
  await expect(page.locator(`img[src*="cdn.example"]`)).toHaveCount(0);
});

// THE VIEWER'S OWN FRAME (#146). `Lightbox` asks its `DialogPopup` for `p-block` — a zoom viewer is a bare
// media frame (`bg-transparent shadow-none`), not a padded modal — and it was silently getting the popup's
// `md` size padding (`p-section`) instead: the custom spacing scale was unregistered in tailwind-merge, both
// paddings survived, and `.p-section` is emitted after `.p-block`. With the scale registered the call site's
// declared intent lands. Resolved against the TOKEN, never a hardcoded px.
test("the popup wears the viewer's own p-block frame, not the dialog size's p-section", async ({ mount, page }) => {
  await mount(<Lightbox open={true} onOpenChange={noop} src={{ kind: "asset", url: "/blob/a.png" }} media="image" alt="a" />);
  const popup = page.getByRole("dialog");
  const block = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--spacing-block)";
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
  await expect(popup).toHaveCSS("padding-top", `${block}px`);
  await expect(popup).toHaveCSS("padding-left", `${block}px`);
});

test("closed renders nothing", async ({ mount, page }) => {
  await mount(<Lightbox open={false} onOpenChange={noop} src={{ kind: "asset", url: "/blob/a.png" }} media="image" alt="a" />);
  await expect(page.locator('[data-slot="message-media"]')).toHaveCount(0);
});

test("focus trap + Escape + focus-return-to-trigger (inherited from Dialog)", async ({ mount, page }) => {
  await mount(<LightboxHarness />);
  const trigger = page.getByRole("button", { name: "Open lightbox" });
  await trigger.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Base UI moves initial focus INTO the popup in a post-open effect (asynchronously, after the open
  // animation begins) — the focus TRAP only intercepts Tab once focus is inside the guarded region. Under
  // battery-load contention that effect can lag past `toBeVisible()`; a Tab pressed while focus still sits on
  // the trigger (outside) is a native forward-Tab the trap never sees, so it lands somewhere other than the
  // popup and the trap poll below never settles true. Wait for initial focus to actually land inside the
  // dialog first — that arms the trap deterministically before we exercise it. (Same interaction-delay class
  // as CM6 acceptCompletion: an immediate keypress after open races the widget's own async focus wiring.)
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  // Focus trap: Tab from inside the popup never escapes back to the trigger sitting behind it.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Focus-return-to-trigger: Base UI's Dialog restores focus to whatever was focused pre-open.
  await expect(trigger).toBeFocused();
});
