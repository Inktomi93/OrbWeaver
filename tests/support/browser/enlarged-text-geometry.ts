// Enlarged-text geometry probes: controls a user cannot press, text cut with no ellipsis, overlapping controls,
// columns that scroll sideways and collapsed scrollers. The platform text-scale suites and the surface walk share them.
import type { Locator } from "@playwright/test";

/** Layout rounding can read a box a fraction past its container with nothing clipped; a one-pixel box is a screen-reader span. */
export const LAYOUT_SUBPIXEL_PX = 1;
const REACHABLE =
  'button, a[href], input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"]';
// The character band's chip row scrolls by ruling: it keeps each chip whole rather than wrap into a ragged void.
const SIDEWAYS_STRIPS = 'input, textarea, [role="tablist"], [role="toolbar"], [data-slot="character-context-band"] > * > *';

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
    // Content before a scroller's start edge has no scroll position that reaches it.
    const beforeStart = ancestorsOf(element)
      .filter((ancestor) => kindOf(getComputedStyle(ancestor).overflowX) !== "free")
      .slice(0, 1)
      .find((ancestor) => box.left < ancestor.getBoundingClientRect().left - ancestor.scrollLeft - subpixel);
    if (beforeStart !== undefined) {
      return `past the start of ${label(beforeStart)}`;
    }
    const scrolls = (axis: string, before: number): boolean => events.slice(0, before).some((event) => event.axis === axis && event.kind === "scroll");
    const cut = events.find((event, index) => event.kind === "clip" && !scrolls(event.axis, index));
    if (cut !== undefined) {
      return `clipped on ${cut.axis} by ${label(cut.ancestor)}`;
    }
    const past = spans(box, { left: 0, right: innerWidth, top: 0, bottom: innerHeight }).filter((axis) => !scrolls(axis, events.length));
    return past.length === 0 ? null : `past the viewport edge on ${past.join("")}`;
  };
  const Disabled = '[aria-disabled="true"], :disabled, [data-disabled]';
  const coveredBy = (element: Element, box: DOMRect): Element | null => {
    if (element.matches(Disabled)) {
      return null;
    }
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
    // A control the user reaches by scrolling its own scroller is not covered by what sits where it would be unscrolled.
    const reachedByScrolling = ancestorsOf(element).some((ancestor) => {
      const style = getComputedStyle(ancestor);
      return spans(box, ancestor.getBoundingClientRect()).some((axis) => kindOf(axis === "x" ? style.overflowX : style.overflowY) === "scroll");
    });
    if (reachedByScrolling) {
      return null;
    }
    const cover = coveredBy(element, box);
    // A pinned footer lies over the rows scrolling under it by design.
    return cover === null || cover.closest('[class*="sticky"]') !== null
      ? null
      : `${label(element)} ${at} is covered at its centre by ${label(cover)} ${cover.className}`;
  };
  return [...subject.querySelectorAll(reachable)]
    .filter(
      (element) =>
        element.checkVisibility({ visibilityProperty: true }) &&
        element.closest("[inert]") === null &&
        // A disabled control takes no press, and its words still have to fit on screen.
        (getComputedStyle(element).pointerEvents !== "none" || element.matches(Disabled)) &&
        element.getBoundingClientRect().width > subpixel,
    )
    .map(verdict)
    .filter((found): found is string => found !== null);
}

/** Text cut with no ellipsis to say so: a single line past its box, or lines past a box that does not scroll. */
function cutOffText(subject: Element, { subpixel }: { readonly subpixel: number }): string[] {
  const paintsText = (element: Element): boolean =>
    [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
  const cuts = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const clipsLine = style.overflowX === "hidden" || style.overflowX === "clip";
    const clipsLines = style.overflowY === "hidden" || style.overflowY === "clip";
    const cutInline = clipsLine && style.textOverflow !== "ellipsis" && style.whiteSpace === "nowrap" && element.scrollWidth > element.clientWidth + subpixel;
    return cutInline || (clipsLines && style.webkitLineClamp === "none" && element.scrollHeight > element.clientHeight + subpixel);
  };
  return [...subject.querySelectorAll("*")]
    .filter(
      (element) =>
        paintsText(element) && element.getBoundingClientRect().width > subpixel && element.checkVisibility({ visibilityProperty: true }) && cuts(element),
    )
    .map((element) => `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 40)}"`);
}

/** Pairs of controls overlapping inside one scroller: a centre hit test misses one that lies over a neighbour's edge. */
function overlappingControls(subject: Element, { reachable, subpixel }: { readonly reachable: string; readonly subpixel: number }): string[] {
  const name = (element: Element): string => (element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 40);
  const scrollerOf = (element: Element): Element | null => {
    for (let up = element.parentElement; up !== null; up = up.parentElement) {
      if (/auto|scroll/u.test(getComputedStyle(up).overflowY)) {
        return up;
      }
    }
    return null;
  };
  const painted = [...subject.querySelectorAll(reachable)].filter(
    (element) =>
      element.checkVisibility({ visibilityProperty: true }) &&
      element.closest("[inert]") === null &&
      getComputedStyle(element).pointerEvents !== "none" &&
      // A dropzone's file input is a transparent sheet over its own zone, and it passes under a dialog's pinned footer.
      !element.matches('input[type="file"]') &&
      element.getBoundingClientRect().width > subpixel,
  );
  // A pinned footer lies over the rows scrolling under it by design.
  const pinned = (element: Element): boolean => {
    for (let up: Element | null = element; up !== null; up = up.parentElement) {
      if (getComputedStyle(up).position === "sticky") {
        return true;
      }
    }
    return false;
  };
  return painted.flatMap((element, index) =>
    painted.slice(index + 1).flatMap((other) => {
      const [a, b] = [element.getBoundingClientRect(), other.getBoundingClientRect()];
      const inline = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const block = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const overlap = inline > subpixel && block > subpixel && !element.contains(other) && !other.contains(element);
      return overlap && !pinned(element) && !pinned(other) && scrollerOf(element) === scrollerOf(other) ? [`"${name(element)}" overlaps "${name(other)}"`] : [];
    }),
  );
}

/** A column that scrolls sideways has stopped reflowing; a strip of tabs or chips is built to scroll that way. */
function sidewaysColumns(subject: Element, { strips, subpixel }: { readonly strips: string; readonly subpixel: number }): string[] {
  return [subject, ...subject.querySelectorAll("*")]
    .filter((element) => {
      const scrolls = /auto|scroll/u.test(getComputedStyle(element).overflowX);
      return (
        scrolls && !element.matches(strips) && element.checkVisibility({ visibilityProperty: true }) && element.scrollWidth > element.clientWidth + subpixel
      );
    })
    .map(
      (element) =>
        `${element.tagName.toLowerCase()} ${element.getAttribute("data-slot") ?? element.className} scrolls sideways by ${String(element.scrollWidth - element.clientWidth)}`,
    );
}

/** A scroller holding content in a box shorter than one line of it: touch cannot reach what it holds. */
function collapsedScrollers(subject: Element, { subpixel }: { readonly subpixel: number }): string[] {
  const line = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return [subject, ...subject.querySelectorAll("*")]
    .filter((element) => {
      const scrolls = /auto|scroll/u.test(getComputedStyle(element).overflowY);
      const painted = element.checkVisibility({ visibilityProperty: true }) && element.getBoundingClientRect().width > subpixel;
      return scrolls && painted && !element.matches("textarea") && element.clientHeight < line && element.scrollHeight > element.clientHeight + subpixel;
    })
    .map(
      (element) =>
        `${element.getAttribute("data-slot") ?? element.tagName.toLowerCase()} is ${String(element.clientHeight)} tall over ${String(element.scrollHeight)}`,
    );
}

/** Every enlarged-text geometry finding inside `scope`; an empty list is a clean scope. */
export async function enlargedTextFindings(scope: Locator): Promise<string[]> {
  const controls = await scope.evaluate(clippedControls, { reachable: REACHABLE, subpixel: LAYOUT_SUBPIXEL_PX });
  const overlaps = await scope.evaluate(overlappingControls, { reachable: REACHABLE, subpixel: LAYOUT_SUBPIXEL_PX });
  const text = await scope.evaluate(cutOffText, { subpixel: LAYOUT_SUBPIXEL_PX });
  const columns = await scope.evaluate(sidewaysColumns, { strips: SIDEWAYS_STRIPS, subpixel: LAYOUT_SUBPIXEL_PX });
  const collapsed = await scope.evaluate(collapsedScrollers, { subpixel: LAYOUT_SUBPIXEL_PX });
  return [...controls, ...overlaps, ...text, ...columns, ...collapsed];
}
