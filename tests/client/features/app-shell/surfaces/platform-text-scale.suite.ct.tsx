// The topbar, the room and the character Import dialog on the production shell at enlarged text: 200% (WCAG 1.4.4 text
// resize) and 300% layout, at the phone and desktop viewports, on Chromium and the opt-in WebKit project. The appearance
// setting stops at 1.5, so these scales are the root multiplier the writer carries; `:root { font-size }` multiplies it the
// same way, but a `rem` inside a media query stays at the platform default, so a browser whose own default is 200% would
// also flip the shell regime. Only the combinations that hold are listed in QUALIFIED; the rest are open defects on the board.
import { APPEARANCE_CHANNEL_ROWS } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const PHONE = { name: "phone", touch: true, size: { width: 390, height: 844 } } as const;
const DESKTOP = { name: "desktop", touch: false, size: { width: 1440, height: 900 } } as const;
const TEXT_200 = { name: "200% text", factor: 2 } as const;
const LAYOUT_300 = { name: "300% layout", factor: 3 } as const;
const FONT_SCALE_PROPERTY = APPEARANCE_CHANNEL_ROWS.find((row) => row.key === "fontScale")?.name ?? "";
// Layout rounding can read a box a fraction past its container with nothing clipped; a one-pixel box is a screen-reader span.
const SUBPIXEL = 1;
const REACHABLE =
  'button, a[href], input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"]';

type Viewport = typeof PHONE | typeof DESKTOP;
type Scale = typeof TEXT_200 | typeof LAYOUT_300;
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

// The combinations measured clean on Chromium. A surface absent here has a defect at that scale and is not claimed.
const QUALIFIED = {
  topbar: [[DESKTOP, TEXT_200]],
  room: [[DESKTOP, TEXT_200]],
  importDialog: [
    [PHONE, TEXT_200],
    [DESKTOP, TEXT_200],
    [DESKTOP, LAYOUT_300],
  ],
} as const satisfies Record<string, readonly (readonly [Viewport, Scale])[]>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeRoom(page, corpus, await root.internalCallerFor(root.ownerId));
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/**
 * Reachable controls that a user could not press: painted past the viewport or past a clipping ancestor on either axis (a scroller
 * keeps its children reachable on its own axis), or covered at their centre by something that is not the control.
 */
function clippedControls(subject: Element, { reachable, subpixel }: { readonly reachable: string; readonly subpixel: number }): string[] {
  const label = (element: Element): string =>
    `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 40)}"`;
  const spans = (
    box: DOMRect,
    bounds: DOMRect | { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
  ): string[] => [
    ...(box.left < bounds.left - subpixel || box.right > bounds.right + subpixel ? ["x"] : []),
    ...(box.top < bounds.top - subpixel || box.bottom > bounds.bottom + subpixel ? ["y"] : []),
  ];
  const ancestorsOf = (element: Element): Element[] => {
    const chain: Element[] = [];
    for (let up = element.parentElement; up !== null && up !== document.documentElement; up = up.parentElement) {
      chain.push(up);
    }
    return chain;
  };
  const kindOf = (overflow: string): "scroll" | "clip" | "free" => {
    if (overflow === "auto" || overflow === "scroll") {
      return "scroll";
    }
    return overflow === "hidden" || overflow === "clip" ? "clip" : "free";
  };
  const clipAxis = (element: Element, box: DOMRect): string | null => {
    // Inner to outer: each ancestor the control sticks out of, on which axis, and what that ancestor does with the excess.
    const events = ancestorsOf(element).flatMap((ancestor) => {
      const style = getComputedStyle(ancestor);
      return spans(box, ancestor.getBoundingClientRect()).map((axis) => ({ axis, ancestor, kind: kindOf(axis === "x" ? style.overflowX : style.overflowY) }));
    });
    const scrolls = (axis: string, before: number): boolean => events.slice(0, before).some((event) => event.axis === axis && event.kind === "scroll");
    const cut = events.find((event, index) => event.kind === "clip" && !scrolls(event.axis, index));
    if (cut !== undefined) {
      return `clipped on ${cut.axis} by ${label(cut.ancestor)}`;
    }
    const past = spans(box, { left: 0, right: innerWidth, top: 0, bottom: innerHeight }).filter((axis) => !scrolls(axis, events.length));
    return past.length === 0 ? null : `past the viewport edge on ${past.join("")}`;
  };
  const coveredBy = (element: Element, box: DOMRect): Element | null => {
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const top = x >= 0 && x < innerWidth && y >= 0 && y < innerHeight ? document.elementFromPoint(x, y) : element;
    return top !== null && element.contains(top) ? null : top;
  };
  const verdict = (element: Element): string | null => {
    const box = element.getBoundingClientRect();
    const at = `[${String(Math.round(box.left))},${String(Math.round(box.top))} ${String(Math.round(box.width))}x${String(Math.round(box.height))}]`;
    const clipped = clipAxis(element, box);
    if (clipped !== null) {
      return `${label(element)} ${at} ${clipped}`;
    }
    const cover = coveredBy(element, box);
    return cover === null ? null : `${label(element)} ${at} is covered at its centre by ${label(cover)} ${cover.className}`;
  };
  return [...subject.querySelectorAll(reachable)]
    .filter(
      (element) =>
        element.checkVisibility({ visibilityProperty: true }) &&
        element.closest("[inert]") === null &&
        getComputedStyle(element).pointerEvents !== "none" &&
        element.getBoundingClientRect().width > subpixel,
    )
    .map(verdict)
    .filter((found): found is string => found !== null);
}

/** Single-line text cut by `overflow: hidden` with no ellipsis to say so. */
function cutOffText(subject: Element, { subpixel }: { readonly subpixel: number }): string[] {
  const paintsText = (element: Element): boolean =>
    [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
  const cuts = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const clips = style.overflowX === "hidden" || style.overflowX === "clip";
    return clips && style.textOverflow !== "ellipsis" && style.whiteSpace === "nowrap" && element.scrollWidth > element.clientWidth + subpixel;
  };
  return [...subject.querySelectorAll("*")]
    .filter(
      (element) =>
        paintsText(element) && element.getBoundingClientRect().width > subpixel && element.checkVisibility({ visibilityProperty: true }) && cuts(element),
    )
    .map((element) => `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 40)}"`);
}

async function findings(scope: Locator): Promise<string[]> {
  const controls = await scope.evaluate(clippedControls, { reachable: REACHABLE, subpixel: SUBPIXEL });
  const text = await scope.evaluate(cutOffText, { subpixel: SUBPIXEL });
  return [...controls, ...text];
}

async function scaleRoot(page: Page, factor: number): Promise<void> {
  // !important: the appearance writer owns the inline value and rewrites it after boot.
  await page.addStyleTag({ content: `:root { ${FONT_SCALE_PROPERTY}: ${String(factor)} !important; }` });
  await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThanOrEqual(16 * factor);
}

const documentOverflow = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

for (const [viewport, scale] of QUALIFIED.topbar) {
  test.describe(`topbar at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps every control reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(page.locator(".shell-topbar")).toBeVisible();
      await scaleRoot(page, scale.factor);
      await expect.poll(() => findings(page.locator(".shell-topbar"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.room) {
  test.describe(`room at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("keeps the transcript, the message field and Send reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellStory>(STORY, {});
      await page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS["chats"], exact: true }).click();
      await page.getByRole("list", { name: "Chats list", exact: true }).getByRole("button").first().click();
      const input = page.getByRole("textbox", { name: "Message", exact: true });
      await expect(input).toBeVisible();
      await scaleRoot(page, scale.factor);
      await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
      for (const control of [input, page.getByRole("button", { name: "Send message", exact: true })]) {
        await expect(control).toBeInViewport({ ratio: 1 });
      }
      await expect.poll(() => findings(page.locator(".shell-content"))).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const [viewport, scale] of QUALIFIED.importDialog) {
  test.describe(`character Import dialog at ${scale.name} on the ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch });

    test("fits its frame and keeps both exits reachable", async ({ mount, page }) => {
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await page.getByRole("button", { name: "Import a character card", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Import a character card", exact: true });
      await expect(dialog).toBeVisible();
      await scaleRoot(page, scale.factor);
      // The popup is its own scroller on a short viewport, so an exit is reachable once scrolled to.
      for (const name of ["Cancel", "Close"]) {
        const exit = dialog.getByRole("button", { name, exact: true });
        await exit.scrollIntoViewIfNeeded();
        await expect(exit).toBeInViewport({ ratio: 1 });
      }
      const frame = await dialog.boundingBox();
      expect(frame?.x ?? -1).toBeGreaterThanOrEqual(-SUBPIXEL);
      expect((frame?.x ?? 0) + (frame?.width ?? 0)).toBeLessThanOrEqual(viewport.size.width + SUBPIXEL);
      await expect.poll(() => findings(dialog)).toEqual([]);
      expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
