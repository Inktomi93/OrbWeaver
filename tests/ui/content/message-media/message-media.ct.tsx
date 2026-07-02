import { MessageMedia } from "@orb/ui/content";
import { expect, test } from "@playwright/experimental-ct-react";

const EXTERNAL = ["https://cdn.example", ".test/pic.png"].join("");

test("external image is gated: a placeholder renders and no external <img> loads until clicked", async ({
  mount,
}) => {
  const cmp = await mount(
    <MessageMedia src={{ kind: "external", url: EXTERNAL }} media="image" alt="pic" />,
  );
  await expect(cmp).toHaveAttribute("data-slot", "message-media-placeholder");
  expect(await cmp.locator("img").count()).toBe(0);
  await cmp.click();
  // after opt-in the placeholder button is REPLACED by the img (it becomes the component root).
  await expect(cmp).toHaveAttribute("src", EXTERNAL);
});

test("asset image renders directly (own origin, no gate)", async ({ mount }) => {
  const cmp = await mount(
    <MessageMedia src={{ kind: "asset", url: "/blob/abc.png" }} media="image" alt="a" />,
  );
  await expect(cmp).toHaveAttribute("src", "/blob/abc.png");
});

test("external video has controls and NEVER autoplay (non-overridable)", async ({ mount }) => {
  const cmp = await mount(
    <MessageMedia
      src={{ kind: "external", url: EXTERNAL }}
      media="video"
      alt="v"
      allowExternal={true}
    />,
  );
  await expect(cmp).toHaveJSProperty("controls", true);
  await expect(cmp).toHaveJSProperty("autoplay", false);
});

test("aspect box is reserved before load (no layout shift)", async ({ mount }) => {
  const cmp = await mount(
    <MessageMedia
      src={{ kind: "external", url: EXTERNAL }}
      media="image"
      alt="a"
      dims={{ w: 4, h: 3 }}
    />,
  );
  const ratio = await cmp.evaluate((el) => getComputedStyle(el).aspectRatio);
  expect(ratio.replace(/\s/gu, "")).toBe("4/3");
});
