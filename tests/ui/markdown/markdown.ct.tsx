import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";

test("untrusted: a <script> tag is stripped and never executes", async ({ mount, page }) => {
  let alerted = false;
  page.on("dialog", (d) => {
    alerted = true;
    void d.dismiss();
  });
  const tag = "script";
  const payload = `<${tag}>alert(1)</${tag}>`;
  const cmp = await mount(<Markdown trust="untrusted">{`hello ${payload} world`}</Markdown>);
  await expect(cmp).toContainText("hello");
  expect(await cmp.locator("script").count()).toBe(0);
  expect(alerted).toBe(false);
});

test("untrusted: an external image neither renders NOR prefetches (no img, no preload link)", async ({
  mount,
  page,
}) => {
  const url = ["http://evil", ".test/pixel.png"].join("");
  const cmp = await mount(<Markdown trust="untrusted">{`text ![x](${url}) more`}</Markdown>);
  await expect(cmp).toContainText("text");
  // img is dropped from the untrusted allowlist (D44 §12.3) — no <img> AND, critically, no
  // <link rel=preload as=image> exfil (Streamdown emits that for markdown images; verified).
  expect(await cmp.locator(`img[src*="evil.test"]`).count()).toBe(0);
  expect(await page.locator(`link[href*="evil.test"]`).count()).toBe(0);
});

test("untrusted: a javascript: link href is neutralized", async ({ mount }) => {
  const js = ["java", "script:alert(1)"].join("");
  const cmp = await mount(<Markdown trust="untrusted">{`[click](${js})`}</Markdown>);
  expect(await cmp.locator(`a[href^="java"]`).count()).toBe(0);
});

test("trusted: a GFM table renders", async ({ mount }) => {
  const md = "| a | b |\n| - | - |\n| 1 | 2 |";
  const cmp = await mount(<Markdown trust="trusted">{md}</Markdown>);
  await expect(cmp.locator("table")).toBeVisible();
});
