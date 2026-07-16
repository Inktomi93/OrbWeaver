import { MessageMedia } from "@orb/ui/message-media";
import { expect, test } from "@playwright/experimental-ct-react";

const EXTERNAL = ["https://cdn.example", ".test/pic.png"].join("");

test("external image is gated: a placeholder renders and no external <img> loads until clicked", async ({ mount, page }) => {
  // Leave the image request permanently pending (never 404) so the broken-media fallback (onError)
  // can't fire and race these assertions — deterministic under full-suite concurrency (matches the
  // video test's page.route approach; a plain direct read still lost the race at high parallelism).
  await page.route(EXTERNAL, () => undefined);
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: EXTERNAL }} media="image" alt="pic" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-placeholder");
  expect(await cmp.locator("img").count()).toBe(0);
  await cmp.click();
  // after opt-in the placeholder button is REPLACED by the img (it becomes the component root).
  expect(await cmp.getAttribute("src")).toBe(EXTERNAL);
});

test("asset image renders directly (own origin, no gate)", async ({ mount, page }) => {
  // Same rationale: keep the asset request pending so onError can't swap in the broken fallback.
  await page.route("**/blob/abc.png", () => undefined);
  const cmp = await mount(<MessageMedia src={{ kind: "asset", url: "/blob/abc.png" }} media="image" alt="a" />);
  expect(await cmp.getAttribute("src")).toBe("/blob/abc.png");
});

test("external video has controls and NEVER autoplay (non-overridable)", async ({ mount, page }) => {
  // Leave the request permanently pending (no fulfill/abort/continue) — a real network error would
  // fire `error` and swap in the new broken-media fallback, racing these intrinsic-property checks
  // (which only care what the element was created with, not whether the source ever loads).
  await page.route(EXTERNAL, () => undefined);
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: EXTERNAL }} media="video" alt="v" allowExternal={true} />);
  expect(await cmp.evaluate((el) => (el as HTMLVideoElement).controls)).toBe(true);
  expect(await cmp.evaluate((el) => (el as HTMLVideoElement).autoplay)).toBe(false);
});

test("aspect box is reserved before load (no layout shift)", async ({ mount }) => {
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: EXTERNAL }} media="image" alt="a" dims={{ w: 4, h: 3 }} />);
  const ratio = await cmp.evaluate((el) => getComputedStyle(el).aspectRatio);
  expect(ratio.replace(/\s/gu, "")).toBe("4/3");
});

test("a data: URI is blocked for an external source (no click-to-load, no <img>)", async ({ mount }) => {
  const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC";
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: dataUri }} media="image" alt="pic" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-blocked");
  expect(await cmp.locator("img").count()).toBe(0);
});

test("a dead image shows the graceful fallback, not the native broken glyph", async ({ mount }) => {
  const cmp = await mount(<MessageMedia src={{ kind: "asset", url: "/definitely-missing-asset-404.png" }} media="image" alt="a" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-broken");
});
