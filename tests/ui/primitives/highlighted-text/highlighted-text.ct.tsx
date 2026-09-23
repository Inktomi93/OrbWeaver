// CT: the highlighted-text seal — `[start, end)` char-offset ranges render as real `<mark>`
// elements (SR-announceable), overlapping/adjacent ranges merge into one run, and the first
// highlight scrolls into view on mount (ui-primitive carve-out work-order item 11).
import { HighlightedText } from "@orb/ui/highlighted-text";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

const TEXT = "The quick brown fox jumps over the lazy dog";

test("multiple non-overlapping ranges each render as a real mark with the correct text", async ({ mount }) => {
  const component = await mount(
    <HighlightedText
      text={TEXT}
      ranges={[
        { start: 4, end: 9 }, // "quick"
        { start: 16, end: 19 }, // "fox"
      ]}
    />,
  );
  const marks = component.locator("mark");
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(0)).toHaveText("quick");
  await expect(marks.nth(1)).toHaveText("fox");
  await expect(component).toContainText(TEXT);
});

test("overlapping ranges merge into a single mark (the chosen simplest-correct behavior)", async ({ mount }) => {
  const component = await mount(
    <HighlightedText
      text={TEXT}
      ranges={[
        { start: 4, end: 9 }, // "quick"
        { start: 7, end: 16 }, // "ck brown " — overlaps the first
      ]}
    />,
  );
  const marks = component.locator("mark");
  await expect(marks).toHaveCount(1);
  await expect(marks.first()).toHaveText("quick brown");
});

test("adjacent ranges (touching, non-overlapping offsets) also merge into one mark", async ({ mount }) => {
  const component = await mount(
    <HighlightedText
      text={TEXT}
      ranges={[
        { start: 4, end: 9 }, // "quick"
        { start: 9, end: 16 }, // " brown" — starts exactly where the first ends
      ]}
    />,
  );
  const marks = component.locator("mark");
  await expect(marks).toHaveCount(1);
  await expect(marks.first()).toHaveText("quick brown");
});

test("empty ranges render plain text with no marks", async ({ mount }) => {
  const component = await mount(<HighlightedText text={TEXT} ranges={[]} />);
  await expect(component.locator("mark")).toHaveCount(0);
  await expect(component).toContainText(TEXT);
});

test("the mark wears the highlight token pair, not a raw color", async ({ mount }) => {
  const component = await mount(<HighlightedText text={TEXT} ranges={[{ start: 0, end: 3 }]} />);
  const mark = component.locator("mark").first();
  await expect(mark).toHaveCSS("background-color", resolvedTokenColor("color.highlight"));
  await expect(mark).toHaveCSS("color", resolvedTokenColor("color.highlight-foreground"));
});

// The `skin` axis — the resolved-TEMPLATE readout is machine text, not
// prose. Asserted by resolved type + color so a token move can't leave a stale-green class assertion.
test("skin=code renders the runs as mono muted machine text; the default stays body-voice prose", async ({ mount, page }) => {
  await mount(
    <>
      <HighlightedText ranges={[{ start: 0, end: 3 }]} text={TEXT} />
      <HighlightedText ranges={[{ start: 0, end: 3 }]} skin="code" text={TEXT} />
    </>,
  );
  const roots = page.locator('[data-slot="highlighted-text-root"]');
  await expect(roots).toHaveCount(2);

  await expect(roots.nth(0)).toHaveCSS("color", resolvedTokenColor("color.foreground"));
  await expect(roots.nth(1)).toHaveCSS("color", resolvedTokenColor("color.muted-foreground"));

  const [proseFont, codeFont, proseSize, codeSize] = await Promise.all([
    roots.nth(0).evaluate((el) => getComputedStyle(el).fontFamily),
    roots.nth(1).evaluate((el) => getComputedStyle(el).fontFamily),
    roots.nth(0).evaluate((el) => getComputedStyle(el).fontSize),
    roots.nth(1).evaluate((el) => getComputedStyle(el).fontSize),
  ]);
  expect(proseFont).not.toContain("Geist Mono");
  expect(codeFont).toContain("Geist Mono");
  expect(Number.parseFloat(codeSize)).toBeLessThan(Number.parseFloat(proseSize));
});

// The mark MEANS "this run is the hit" in either voice — the skin is the surrounding type, never the
// highlight semantics, so the token pair must survive the code arm.
test("skin=code keeps the mark on the highlight token pair", async ({ mount, page }) => {
  await mount(<HighlightedText ranges={[{ start: 0, end: 3 }]} skin="code" text={TEXT} />);
  const mark = page.locator("mark").first();
  await expect(mark).toHaveCSS("background-color", resolvedTokenColor("color.highlight"));
  await expect(mark).toHaveCSS("color", resolvedTokenColor("color.highlight-foreground"));
});

test("the first highlight scrolls into view on mount", async ({ mount, page }) => {
  const line = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n";
  const filler = line.repeat(100);
  const text = `${filler}TARGET`;
  const start = text.length - "TARGET".length;

  await mount(
    <div data-testid="scroll-parent" style={{ height: 200, overflow: "auto" }}>
      <HighlightedText text={text} ranges={[{ start, end: text.length }]} />
    </div>,
  );

  const scrollParent = page.getByTestId("scroll-parent");
  await expect.poll(() => scrollParent.evaluate((el) => el.scrollTop), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  await expect(page.locator("mark")).toBeInViewport();
});

test("scroll-to-first re-fires when ranges changes to a new offset (the find-next case)", async ({ mount, page }) => {
  const line = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n";
  const filler = line.repeat(200);
  const text = `${filler}FIRST${filler}SECOND`;
  const firstStart = filler.length;
  const firstEnd = firstStart + "FIRST".length;
  const secondStart = text.length - "SECOND".length;

  const component = await mount(
    <div data-testid="scroll-parent" style={{ height: 200, overflow: "auto" }}>
      <HighlightedText ranges={[{ start: firstStart, end: firstEnd }]} text={text} />
    </div>,
  );
  const scrollParent = page.getByTestId("scroll-parent");
  await expect.poll(() => scrollParent.evaluate((el) => el.scrollTop), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  const scrollAfterFirst = await scrollParent.evaluate((el) => el.scrollTop);

  await component.update(
    <div data-testid="scroll-parent" style={{ height: 200, overflow: "auto" }}>
      <HighlightedText ranges={[{ start: secondStart, end: text.length }]} text={text} />
    </div>,
  );

  await expect.poll(() => scrollParent.evaluate((el) => el.scrollTop), { intervals: [20, 50, 100] }).toBeGreaterThan(scrollAfterFirst);
});

test("a parent re-render with an equal-but-fresh ranges array does not re-fire the scroll", async ({ mount, page }) => {
  const line = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n";
  const filler = line.repeat(100);
  const text = `${filler}TARGET`;
  const start = text.length - "TARGET".length;

  const component = await mount(
    <div data-testid="scroll-parent" style={{ height: 200, overflow: "auto" }}>
      <HighlightedText ranges={[{ start, end: text.length }]} text={text} />
    </div>,
  );
  const scrollParent = page.getByTestId("scroll-parent");
  await expect.poll(() => scrollParent.evaluate((el) => el.scrollTop), { intervals: [20, 50, 100] }).toBeGreaterThan(0);

  // The reader scrolls back up to read from the top.
  await scrollParent.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(scrollParent).toHaveJSProperty("scrollTop", 0);

  // Parent re-renders passing a FRESH `ranges` array with the same start/end values (the common
  // inline-literal shape) — must not yank the reader back down.
  await component.update(
    <div data-testid="scroll-parent" style={{ height: 200, overflow: "auto" }}>
      <HighlightedText ranges={[{ start, end: text.length }]} text={text} />
    </div>,
  );

  await expect(scrollParent).toHaveJSProperty("scrollTop", 0);
});
