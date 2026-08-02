// <Icon> CT (ui-package-design §6.1 icons seal) — the lucide glyph renders at the named type-scale
// px const, decorative by default, accessible when labelled, and the three appearance axes
// (weight / fill / partialFill) land as RENDERED SVG, asserted on computed values and real geometry
// rather than on the source. Mounted via the support stories: CT cannot serialize a
// component-as-prop (`icon={X}`) across the mount boundary.
import { expect, test } from "@playwright/experimental-ct-react";
import { CloseIconStory, IconGalleryStory, StarIconStory, TwoPartialStarsStory } from "./icon.fixtures";

// = ICON_XS / ICON_SM / ICON_MD / ICON_LG (packages/ui/src/primitives/icons/icon.tsx type-scale table).
const ICON_XS_PX = "12";
const ICON_SM_PX = "16";
const ICON_MD_PX = "20";
const ICON_LG_PX = "24";

// lucide's absoluteStrokeWidth math (dist/esm/Icon.mjs): attribute = strokeWidth * 24 / size, so the
// OPTICAL px weight is `strokeWidth` at every size. regular = 1.75, hairline = 1, bold = 2.5.
// getComputedStyle reports stroke-width in px units even though the attribute is in viewBox units.
const REGULAR_AT_MD = "2.1px"; // 1.75 * 24 / 20
const HAIRLINE_AT_LG = "1px"; // 1 * 24 / 24
const BOLD_AT_XS = "5px"; // 2.5 * 24 / 12
const OPTICAL_REGULAR_PX = 1.75;

// The exact markup HEAD renders for `<Icon icon={X} />` — the default arm must stay byte-identical
// after the axes landed (captured from HEAD's component via react-dom/server, then re-verified here
// against the live DOM).
const DEFAULT_ARM_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

test("renders the glyph at the token size, decorative by default", async ({ mount }) => {
  const component = await mount(<CloseIconStory size="sm" />);
  const tag = await component.evaluate((el) => el.tagName.toLowerCase());
  expect(tag).toBe("svg");
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

test("the default arm is byte-identical to the pre-axes seal", async ({ mount }) => {
  const component = await mount(<CloseIconStory />);
  const html = await component.evaluate((el) => el.outerHTML);
  expect(html).toBe(DEFAULT_ARM_SVG);
});

test("weight lands as a COMPUTED stroke-width and stays optically constant across sizes", async ({ mount }) => {
  const regular = await mount(<CloseIconStory />);
  await expect(regular).toHaveCSS("stroke-width", REGULAR_AT_MD);
  await regular.unmount();

  const hairline = await mount(<CloseIconStory size="lg" weight="hairline" />);
  await expect(hairline).toHaveAttribute("width", ICON_LG_PX);
  await expect(hairline).toHaveCSS("stroke-width", HAIRLINE_AT_LG);
  await hairline.unmount();

  const bold = await mount(<CloseIconStory size="xs" weight="bold" />);
  await expect(bold).toHaveAttribute("width", ICON_XS_PX);
  await expect(bold).toHaveCSS("stroke-width", BOLD_AT_XS);
});

test("absoluteStrokeWidth keeps the RENDERED px weight identical at xs and lg", async ({ mount }) => {
  // The point of the axis: the stroke-width attribute is in viewBox units, so the on-screen px weight
  // is attribute * (renderedSize / 24). Both sizes must resolve to the same 1.75px.
  const small = await mount(<CloseIconStory size="xs" />);
  const smallPx = await small.evaluate((el) => Number.parseFloat(getComputedStyle(el).strokeWidth) * (el.getBoundingClientRect().width / 24));
  await small.unmount();

  const large = await mount(<CloseIconStory size="lg" />);
  const largePx = await large.evaluate((el) => Number.parseFloat(getComputedStyle(el).strokeWidth) * (el.getBoundingClientRect().width / 24));

  expect(smallPx).toBeCloseTo(OPTICAL_REGULAR_PX);
  expect(largePx).toBeCloseTo(OPTICAL_REGULAR_PX);
});

test("fill=none is the default and paints nothing", async ({ mount }) => {
  const component = await mount(<StarIconStory />);
  await expect(component).toHaveAttribute("fill", "none");
  const pathFill = await component.evaluate((el) => getComputedStyle(el.querySelector("path") as Element).fill);
  expect(pathFill).toBe("none");
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
  const gradientId = await component.evaluate((el) => el.querySelector("linearGradient")?.id ?? "");
  expect(gradientId).not.toBe("");
  await expect(component).toHaveAttribute("fill", `url(#${gradientId})`);

  const stops = await component.evaluate((el) =>
    [...el.querySelectorAll("stop")].map((stop) => ({
      offset: stop.getAttribute("offset"),
      opacity: stop.getAttribute("stop-opacity"),
      color: stop.getAttribute("stop-color"),
    })),
  );
  expect(stops).toEqual([
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
  expect(resolved.ref).toContain("url(");
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
  const ids = await component.evaluate((el) => [...el.querySelectorAll("linearGradient")].map((g) => g.id));
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);

  const offsets = await component.evaluate((el) => [...el.querySelectorAll("linearGradient")].map((g) => g.querySelector("stop")?.getAttribute("offset")));
  expect(offsets).toEqual(["0.25", "0.75"]);
});

test("axis gallery renders (screenshot receipt)", async ({ mount }) => {
  const component = await mount(<IconGalleryStory />);
  await expect(component.locator("svg").first()).toBeVisible();
  await component.screenshot({ path: "reports/icon-seal-gallery.png" });
});
