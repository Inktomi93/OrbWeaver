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
  await expect(cmp.locator("img")).toHaveCount(0);
  await cmp.click();
  // after opt-in the placeholder button is REPLACED by the img (it becomes the component root).
  await expect(cmp).toHaveAttribute("src", EXTERNAL);
});

test("external consent belongs to the exact URL and does not follow a rerender to another host", async ({ mount, page }) => {
  const a = "https://media-a.test/a.png";
  const b = "https://media-b.test/b.png";
  let bRequests = 0;
  await page.route(a, () => undefined);
  await page.route(b, () => {
    bRequests += 1;
  });
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: a }} media="image" alt="a" />);
  await cmp.click();
  await expect(cmp).toHaveAttribute("src", a);

  await cmp.update(<MessageMedia src={{ kind: "external", url: b }} media="image" alt="b" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-placeholder");
  await expect(cmp).toContainText("media-b.test");
  expect(bRequests).toBe(0);
});

test("asset image renders directly (own origin, no gate)", async ({ mount, page }) => {
  // Same rationale: keep the asset request pending so onError can't swap in the broken fallback.
  await page.route("**/blob/abc.png", () => undefined);
  const cmp = await mount(<MessageMedia src={{ kind: "asset", url: "/blob/abc.png" }} media="image" alt="a" />);
  await expect(cmp).toHaveAttribute("src", "/blob/abc.png");
});

test("external video has controls and NEVER autoplay (non-overridable)", async ({ mount, page }) => {
  // Leave the request permanently pending (no fulfill/abort/continue) — a real network error would
  // fire `error` and swap in the new broken-media fallback, racing these intrinsic-property checks
  // (which only care what the element was created with, not whether the source ever loads).
  await page.route(EXTERNAL, () => undefined);
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: EXTERNAL }} media="video" alt="v" allowExternal={true} />);
  await expect.poll(() => cmp.evaluate((el) => (el as HTMLVideoElement).controls)).toBe(true);
  await expect.poll(() => cmp.evaluate((el) => (el as HTMLVideoElement).autoplay)).toBe(false);
});

test("aspect box is reserved before load (no layout shift)", async ({ mount }) => {
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: EXTERNAL }} media="image" alt="a" dims={{ w: 4, h: 3 }} />);
  const ratio = await cmp.evaluate((el) => getComputedStyle(el).aspectRatio);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(ratio.replace(/\s/gu, "")).toBe("4/3");
});

// A 60×120 (1:2, portrait) own-origin image: an SVG data URI carries its own intrinsic size, so the
// browser reports naturalWidth/naturalHeight with no network. `asset` sources are never data-URI-gated.
const TALL_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="120"><circle cx="30" cy="30" r="30" fill="black"/></svg>',
)}`;
const RATIO_PRECISION = 2;
const PLACEHOLDER_RATIO = 16 / 9;

/** The loaded image's natural ratio + the ratio it is actually PAINTED at (`getBoundingClientRect`). */
function imageRatios(img: { evaluate: <R>(fn: (el: HTMLImageElement) => R) => Promise<R> }): Promise<{ readonly natural: number; readonly rendered: number }> {
  return img.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { natural: el.naturalWidth / el.naturalHeight, rendered: rect.width / rect.height };
  });
}

test("an image with no declared dims paints at its OWN ratio, never stretched into the placeholder box", async ({ mount }) => {
  // The house law: never distort an image. A non-`auto` aspect-ratio on a replaced element OVERRIDES the
  // intrinsic ratio, and the default `object-fit: fill` then stretches the pixels (a circle becomes an
  // ellipse). No producer of a chat media block fills `dims`, so this is every image in the app.
  const cmp = await mount(<MessageMedia src={{ kind: "asset", url: TALL_SVG }} media="image" alt="tall" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media");
  await expect.poll(async () => (await imageRatios(cmp)).natural).toBeCloseTo(1 / 2, RATIO_PRECISION);
  const ratios = await imageRatios(cmp);
  expect(ratios.rendered).toBeCloseTo(ratios.natural, RATIO_PRECISION);
});

test("a declared-dims box never stretches the pixels inside it (object-fit is not `fill`)", async ({ mount }) => {
  // Belt to the braces above: when a producer DOES declare dims and they disagree with the bytes, the
  // reserved box wins the layout but the image must letterbox inside it, never distort.
  const cmp = await mount(<MessageMedia src={{ kind: "asset", url: TALL_SVG }} media="image" alt="tall" dims={{ w: 16, h: 9 }} />);
  await expect.poll(() => cmp.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
  // Barrier on the SETTLED (loaded) state: an <img> with no intrinsic size yet lays out at 0×0, so an
  // in-flight read returns NaN.
  await expect.poll(async () => (await imageRatios(cmp)).natural).toBeCloseTo(1 / 2, RATIO_PRECISION);
  const ratios = await imageRatios(cmp);
  expect(ratios.rendered).toBeCloseTo(PLACEHOLDER_RATIO, RATIO_PRECISION);
});

test("the un-loadable placeholder still RESERVES the 16:9 box (the anti-CLS reservation survives)", async ({ mount }) => {
  // The placeholder aspect exists to reserve space before anything loads — un-distorting the image must not
  // delete it. The click-to-load gate is the block-level surface where that reservation is observable.
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: EXTERNAL }} media="image" alt="pic" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-placeholder");
  // The reservation is a FLOOR, not an identity: the gate's own label can push the box taller than 16:9.
  // Without the reserved aspect the button collapses to one line of text (~40px), so `>=` still discriminates.
  const box = await cmp.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual((box?.width ?? 0) / PLACEHOLDER_RATIO - 1);
});

const PENDING_ASSET = "/blob/pending-portrait.png";
const PORTRAIT = { w: 1024, h: 1536 } as const;
const MOUNT_WIDTH = 320;
const RESERVED_PRECISION = 1;

test("declared dims RESERVE the true box BEFORE the bytes arrive (#625 — not just after decode)", async ({ mount, page }) => {
  // The reservation half of #622: dims exist so the row holds the image's REAL box while the request is
  // still in flight. An <img> with an aspect-ratio but no definite inline size lays out 0×0 until the
  // bytes give it an intrinsic width — which is a ratio the eye never sees and a reflow on load.
  // Held permanently pending so this measures the PRE-DECODE box, never the loaded one.
  await page.route(`**${PENDING_ASSET}`, () => undefined);
  const cmp = await mount(
    <div style={{ width: `${MOUNT_WIDTH}px` }}>
      <MessageMedia src={{ kind: "asset", url: PENDING_ASSET }} media="image" alt="portrait" dims={PORTRAIT} />
    </div>,
  );
  const img = cmp.locator('[data-slot="message-media"]');
  await expect(img).toBeVisible();
  const box = await img.boundingBox();
  expect(box?.width ?? 0).toBeCloseTo(MOUNT_WIDTH, RESERVED_PRECISION);
  expect(box?.height ?? 0).toBeCloseTo((MOUNT_WIDTH * PORTRAIT.h) / PORTRAIT.w, RESERVED_PRECISION);
});

const GATED_ASSET = "/blob/gated-portrait.svg";
const SVG_MIME = "image/svg+xml";
const PORTRAIT_SVG_BODY = `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT.w}" height="${PORTRAIT.h}"><rect width="100%" height="100%" fill="black"/></svg>`;
const NO_SHIFT_PX = 0.5;

test("declared dims mean ZERO layout shift across the load (#625 — the same box before and after decode)", async ({ mount, page }) => {
  // The reservation's whole point, measured as the thing a reader actually experiences: the box the row
  // holds while the bytes are in flight is the SAME box the decoded image occupies, so nothing below it
  // moves. Before #625 the pre-load box was 0×0 and the entire thread jumped on decode.
  let release: (() => Promise<void>) | undefined;
  await page.route(`**${GATED_ASSET}`, (route) => {
    release = (): Promise<void> => route.fulfill({ body: PORTRAIT_SVG_BODY, contentType: SVG_MIME });
  });
  const cmp = await mount(
    <div style={{ width: `${MOUNT_WIDTH}px` }}>
      <MessageMedia src={{ kind: "asset", url: GATED_ASSET }} media="image" alt="portrait" dims={PORTRAIT} />
    </div>,
  );
  const img = cmp.locator('[data-slot="message-media"]');
  await expect(img).toBeVisible();
  const before = await img.boundingBox();

  await expect.poll(() => release !== undefined).toBe(true);
  await release?.();
  // Barrier on the SETTLED (decoded) image — the assertion is about the box AFTER the bytes land.
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(PORTRAIT.w);
  const after = await img.boundingBox();

  expect(after?.width ?? 0).toBeCloseTo(before?.width ?? -1, NO_SHIFT_PX);
  expect(after?.height ?? 0).toBeCloseTo(before?.height ?? -1, NO_SHIFT_PX);
  expect(after?.height ?? 0).toBeCloseTo((MOUNT_WIDTH * PORTRAIT.h) / PORTRAIT.w, RESERVED_PRECISION);
});

test("a data: URI is blocked for an external source (no click-to-load, no <img>)", async ({ mount }) => {
  const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC";
  const cmp = await mount(<MessageMedia src={{ kind: "external", url: dataUri }} media="image" alt="pic" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-blocked");
  await expect(cmp.locator("img")).toHaveCount(0);
});

test("a dead image shows the graceful fallback, not the native broken glyph", async ({ mount }) => {
  const cmp = await mount(<MessageMedia src={{ kind: "asset", url: "/definitely-missing-asset-404.png" }} media="image" alt="a" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-broken");
});

test("a broken result belongs to the exact URL and does not poison the next media", async ({ mount, page }) => {
  const healthy = "/blob/healthy-after-broken.png";
  await page.route(`**${healthy}`, () => undefined);
  const cmp = await mount(<MessageMedia src={{ kind: "asset", url: "/missing-before-swap.png" }} media="image" alt="missing" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media-broken");
  await cmp.update(<MessageMedia src={{ kind: "asset", url: healthy }} media="image" alt="healthy" />);
  await expect(cmp).toHaveAttribute("data-slot", "message-media");
  await expect(cmp).toHaveAttribute("src", healthy);
});
