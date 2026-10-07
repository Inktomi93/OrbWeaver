// <Icon> CT (ui-package-design §6.1 icons seal) — the lucide glyph renders at the named type-scale
// px const, decorative by default, accessible when labelled, and the three appearance axes
// (weight / fill / partialFill) land as RENDERED SVG, asserted on computed values and real geometry
// rather than on the source. Mounted via the support stories: CT cannot serialize a
// component-as-prop (`icon={X}`) across the mount boundary.
import { expect, test } from "@playwright/experimental-ct-react";
import { ctSnapPath } from "../../../support/node/snap-out.ts";
import { CloseIconStory, IconGalleryStory, StarIconStory, TwoPartialStarsStory } from "./icon.fixtures.tsx";

// = ICON_XS / ICON_SM / ICON_MD / ICON_LG (packages/ui/src/primitives/icons/icon.tsx type-scale table).
const ICON_XS_PX = "12";
const ICON_SM_PX = "16";
const ICON_MD_PX = "20";
const ICON_LG_PX = "24";

const REGULAR_PX = "1.75px";
const HAIRLINE_PX = "1px";
const BOLD_PX = "2.5px";
const OPTICAL_REGULAR_PX = 1.75;

test("renders the glyph at the token size, decorative by default", async ({ mount }) => {
  const component = await mount(<CloseIconStory size="sm" />);
  await expect.poll(async () => await component.evaluate((el) => el.tagName.toLowerCase())).toBe("svg");
  await expect(component).toHaveAttribute("width", ICON_SM_PX);
  await expect(component).toHaveAttribute("height", ICON_SM_PX);
  await expect(component).toHaveAttribute("aria-hidden", "true");
});

test("md is the default size and label makes the icon accessible", async ({ mount }) => {
  const component = await mount(<CloseIconStory label="Close" />);
  await expect(component).toHaveAttribute("width", ICON_MD_PX);
  await expect(component).toHaveAttribute("aria-label", "Close");
  await expect(component).toHaveAttribute("aria-hidden", "false");
});

test("the default arm retains the glyph geometry with native non-scaling strokes", async ({ mount }) => {
  const component = await mount(<CloseIconStory />);
  await expect(component).toHaveAttribute("viewBox", "0 0 24 24");
  await expect(component.locator("path")).toHaveCount(2);
  await expect(component.locator("path").nth(0)).toHaveAttribute("d", "M18 6 6 18");
  await expect(component.locator("path").nth(1)).toHaveAttribute("d", "m6 6 12 12");
  await expect(component.locator("path").nth(0)).toHaveCSS("vector-effect", "non-scaling-stroke");
  await expect(component.locator("path").nth(1)).toHaveCSS("vector-effect", "non-scaling-stroke");
});

test("weight lands on the painted paths and stays optically constant across sizes", async ({ mount }) => {
  const component = await mount(<CloseIconStory />);
  await expect(component.locator("path").first()).toHaveCSS("stroke-width", REGULAR_PX);

  await component.update(<CloseIconStory size="lg" weight="hairline" />);
  await expect(component).toHaveAttribute("width", ICON_LG_PX);
  await expect(component.locator("path").first()).toHaveCSS("stroke-width", HAIRLINE_PX);

  await component.update(<CloseIconStory size="xs" weight="bold" />);
  await expect(component).toHaveAttribute("width", ICON_XS_PX);
  await expect(component.locator("path").first()).toHaveCSS("stroke-width", BOLD_PX);
});

test("nonScalingStroke keeps the rendered px weight identical at xs and lg", async ({ mount }) => {
  const component = await mount(<CloseIconStory size="xs" />);
  await expect(component).toHaveAttribute("width", ICON_XS_PX);
  await expect(component.locator("path").first()).toHaveCSS("vector-effect", "non-scaling-stroke");
  await expect
    .poll(
      async () =>
        await component
          .locator("path")
          .first()
          .evaluate((el) => Number.parseFloat(getComputedStyle(el).strokeWidth)),
    )
    .toBeCloseTo(OPTICAL_REGULAR_PX);

  await component.update(<CloseIconStory size="lg" />);
  await expect(component).toHaveAttribute("width", ICON_LG_PX);
  await expect(component.locator("path").first()).toHaveCSS("vector-effect", "non-scaling-stroke");
  await expect
    .poll(
      async () =>
        await component
          .locator("path")
          .first()
          .evaluate((el) => Number.parseFloat(getComputedStyle(el).strokeWidth)),
    )
    .toBeCloseTo(OPTICAL_REGULAR_PX);
});

test("fill=none is the default and paints nothing", async ({ mount }) => {
  const component = await mount(<StarIconStory />);
  await expect(component).toHaveAttribute("fill", "none");
  await expect.poll(async () => await component.evaluate((el) => getComputedStyle(el.querySelector("path") as Element).fill)).toBe("none");
  await expect(component.locator("defs")).toHaveCount(0);
});

test("fill=solid rides lucide's own fill pass-through down to the path, in currentColor", async ({ mount }) => {
  const component = await mount(<StarIconStory fill="solid" />);
  await expect(component).toHaveAttribute("fill", "currentColor");
  const { pathFill, svgColor } = await component.evaluate((el) => ({
    pathFill: getComputedStyle(el.querySelector("path") as Element).fill,
    svgColor: getComputedStyle(el).color,
  }));
  // currentColor resolves through the cascade — the fill IS the text color, so the D71 theme owns it.
  expect(pathFill).toBe(svgColor);
  await expect(component.locator("defs")).toHaveCount(0);
});

test("partialFill draws a hard-stop gradient at the fraction and the path resolves it", async ({ mount }) => {
  const component = await mount(<StarIconStory partialFill={0.5} />);
  let gradientId = await component.evaluate((el) => el.querySelector("linearGradient")?.id ?? "");
  await expect
    .poll(async () => {
      gradientId = await component.evaluate((el) => el.querySelector("linearGradient")?.id ?? "");
      return gradientId;
    })
    .not.toBe("");
  await expect(component).toHaveAttribute("fill", `url(#${gradientId})`);
  await expect
    .poll(
      async () =>
        await component.evaluate((el) =>
          [...el.querySelectorAll("stop")].map((stop) => ({
            offset: stop.getAttribute("offset"),
            opacity: stop.getAttribute("stop-opacity"),
            color: stop.getAttribute("stop-color"),
          })),
        ),
    )
    .toEqual([
      { offset: "0.5", opacity: "1", color: "currentColor" },
      { offset: "0.5", opacity: "0", color: "currentColor" },
    ]);

  // The reference must actually RESOLVE (the <defs> follows the path in document order — a forward
  // reference; if the browser failed to resolve it the paint server would fall back to none/black).
  const resolved = await component.evaluate((el) => {
    const path = el.querySelector("path") as SVGPathElement;
    const ref = getComputedStyle(path).fill;
    const target = el.ownerDocument.getElementById(el.querySelector("linearGradient")?.id ?? "");
    return { ref, targetTag: target?.tagName ?? "" };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(resolved.ref).toContain("url(");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(resolved.targetTag).toBe("linearGradient");
});

test("partialFill 0 and 1 collapse to the plain none / solid arms (no gradient minted)", async ({ mount }) => {
  const empty = await mount(<StarIconStory partialFill={0} />);
  await expect(empty).toHaveAttribute("fill", "none");
  await expect(empty.locator("defs")).toHaveCount(0);
  await empty.unmount();

  const full = await mount(<StarIconStory partialFill={1} />);
  await expect(full).toHaveAttribute("fill", "currentColor");
  await expect(full.locator("defs")).toHaveCount(0);
});

test("out-of-range fractions clamp instead of minting a broken gradient", async ({ mount }) => {
  const under = await mount(<StarIconStory partialFill={-3} />);
  await expect(under).toHaveAttribute("fill", "none");
  await under.unmount();

  const over = await mount(<StarIconStory partialFill={9} />);
  await expect(over).toHaveAttribute("fill", "currentColor");
});

test("two partial instances get DISTINCT gradient ids", async ({ mount }) => {
  const component = await mount(<TwoPartialStarsStory />);
  let ids = await component.evaluate((el) => [...el.querySelectorAll("linearGradient")].map((g) => g.id));
  await expect
    .poll(async () => {
      ids = await component.evaluate((el) => [...el.querySelectorAll("linearGradient")].map((g) => g.id));
      return ids;
    })
    .toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  await expect
    .poll(async () => await component.evaluate((el) => [...el.querySelectorAll("linearGradient")].map((g) => g.querySelector("stop")?.getAttribute("offset"))))
    .toEqual(["0.25", "0.75"]);
});

test("axis gallery renders (screenshot receipt)", async ({ mount }) => {
  const component = await mount(<IconGalleryStory />);
  await expect(component.locator("svg").first()).toBeVisible();
  await component.screenshot({ path: ctSnapPath("icon-seal-gallery") });
});
