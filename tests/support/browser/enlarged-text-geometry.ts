// Enlarged-text geometry probes: controls a user cannot press, text cut with no ellipsis, overlapping controls,
// columns that scroll sideways and collapsed scrollers. The platform text-scale suites and the surface walk share them.
import type { Locator } from "@playwright/test";

/** Layout rounding can read a box a fraction past its container with nothing clipped; a one-pixel box is a screen-reader span. */
export const LAYOUT_SUBPIXEL_PX = 1;
const REACHABLE =
  'button, a[href], input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], [role="textbox"]';
// The character band's chip row scrolls by ruling: it keeps each chip whole rather than wrap into a ragged void. A strip built to scroll sideways
// declares it with the attribute.
// An open toast is transient chrome with its own close and timeout, so it lies over the controls beneath it the way pinned chrome does.
// So is the jump pill: it shows only while the reader is away from the tail, floats over the rows scrolling under it and goes with one press.
const TRANSIENT_CHROME = '[data-slot="toast-root"], [data-slot="jump-to-latest"]';
// The boot veil lies over everything while it holds and dissolves after the app is ready, so a probe that runs under it reads the veil as every
// control's cover. Its layout is not the resting one; the probes wait for it to leave.
const BOOT_VEIL = '[data-slot="weave-veil"]';
// A list row's door and a roster member's row truncate their title on purpose: the row's accessible name keeps the whole of it.
const ROW_DOORS = '[data-slot="list-row-root"], [data-slot="member-row"]';
const SIDEWAYS_STRIPS = 'input, textarea, [role="tablist"], [role="toolbar"], [data-slot="character-context-band"] > * > *, [data-sideways-strip]';

interface ControlGeometry {
  readonly clipped: string[];
  readonly overlaps: string[];
}

/**
 * Two probes over the reachable controls that paint. Clipped: a control painted past the viewport or past a clipping
 * ancestor on either axis (a scroller keeps its children reachable on its own axis), or covered at its centre by
 * something that is not the control. Overlapping: pairs inside one scroller, which a centre hit test misses when one
 * lies over a neighbour's edge.
 */
function controlGeometry(
  subject: Element,
  { reachable, subpixel, transient }: { readonly reachable: string; readonly subpixel: number; readonly transient: string },
): ControlGeometry {
  const labelsOf = (element: Element): HTMLLabelElement[] =>
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
      ? [...(element.labels ?? [])]
      : [];
  // The name sources the page states outright, in accessible-name order (text content only names a control that
  // takes its name from content, and an input has none); this is not an accessible-name engine.
  const nameOf = (element: Element): string => {
    const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/u)
      .map((id) => (id === "" ? "" : (document.getElementById(id)?.textContent ?? "")))
      .join(" ");
    const sources = [
      labelledBy,
      element.getAttribute("aria-label") ?? "",
      labelsOf(element)
        .map(({ textContent }) => textContent)
        .join(" "),
      element.textContent,
      element.getAttribute("title") ?? "",
      element.getAttribute("placeholder") ?? "",
    ];
    return (sources.map((source) => source.trim()).find((source) => source !== "") ?? "").slice(0, 40);
  };
  const label = (element: Element): string => `${element.tagName.toLowerCase()} "${nameOf(element)}"`;
  const boxText = (box: DOMRect): string =>
    `[${String(Math.round(box.left))},${String(Math.round(box.top))} ${String(Math.round(box.width))}x${String(Math.round(box.height))}]`;
  // A box with no area paints nothing, and neither does one its own clip-path insets away whatever its size: the
  // visually hidden pattern, which parks a range input over the whole viewport.
  const paints = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    if (box.width <= subpixel || box.height <= subpixel) {
      return false;
    }
    const inset = /^inset\((?<values>[^)]*?)(?: round [^)]*)?\)$/u.exec(getComputedStyle(element).clipPath)?.groups?.["values"];
    if (inset === undefined) {
      return true;
    }
    const [top = "0", right = top, bottom = top, left = right] = inset.split(" ");
    const px = (value: string, extent: number): number => (value.endsWith("%") ? (Number.parseFloat(value) / 100) * extent : Number.parseFloat(value));
    return px(top, box.height) + px(bottom, box.height) < box.height && px(left, box.width) + px(right, box.width) < box.width;
  };

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
    const at = boxText(box);
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
    // A pinned footer lies over the rows scrolling under it by design, and an open toast over the page.
    return cover === null || cover.closest('[class*="sticky"]') !== null || cover.closest(transient) !== null
      ? null
      : `${label(element)} ${at} is covered at its centre by ${label(cover)} ${cover.className}`;
  };
  const paintedControls = (keep: (element: Element) => boolean): Element[] =>
    [...subject.querySelectorAll(reachable)].filter(
      (element) => element.checkVisibility({ visibilityProperty: true }) && element.closest("[inert]") === null && keep(element) && paints(element),
    );
  const clipped = paintedControls(
    // A disabled control takes no press, and its words still have to fit on screen.
    (element) => getComputedStyle(element).pointerEvents !== "none" || element.matches(Disabled),
  )
    .map(verdict)
    .filter((found): found is string => found !== null);

  const scrollerOf = (element: Element): Element | null => {
    for (let up = element.parentElement; up !== null; up = up.parentElement) {
      if (/auto|scroll/u.test(getComputedStyle(up).overflowY)) {
        return up;
      }
    }
    return null;
  };
  // A pinned footer lies over the rows scrolling under it by design.
  const pinned = (element: Element): boolean => {
    for (let up: Element | null = element; up !== null; up = up.parentElement) {
      if (getComputedStyle(up).position === "sticky") {
        return true;
      }
    }
    return false;
  };
  const painted = paintedControls(
    (element) =>
      getComputedStyle(element).pointerEvents !== "none" &&
      // A dropzone's file input is a transparent sheet over its own zone, and it passes under a dialog's pinned footer.
      !element.matches('input[type="file"]'),
  );
  const overlaps: string[] = [];
  painted.forEach((element, index) => {
    for (const other of painted.slice(index + 1)) {
      const [a, b] = [element.getBoundingClientRect(), other.getBoundingClientRect()];
      const inline = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const block = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const overlap = inline > subpixel && block > subpixel && !element.contains(other) && !other.contains(element);
      if (!overlap || pinned(element) || pinned(other) || scrollerOf(element) !== scrollerOf(other)) {
        continue;
      }
      // The boxes attribute a pair whose controls carry no name.
      overlaps.push(`${label(element)} ${boxText(a)} overlaps ${label(other)} ${boxText(b)}`);
    }
  });
  return { clipped, overlaps };
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

/**
 * A control's own value cut with an ellipsis: the picker that reads "Sa…", a button label or an input value ended early. The cut hides what the
 * control says, and the reader chose the control for that text. Two cuts are excluded by name: a row door's title, truncated on purpose with the
 * row's accessible name keeping the whole of it, and text the control hides from the accessible tree or only describes.
 */
function cutControlValues(
  subject: Element,
  { reachable, rowDoors, subpixel }: { readonly reachable: string; readonly rowDoors: string; readonly subpixel: number },
): string[] {
  const paintsText = (element: Element): boolean =>
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value !== ""
      : [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
  const cut = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const clips = style.overflowX === "hidden" || style.overflowX === "clip";
    return clips && style.textOverflow === "ellipsis" && element.scrollWidth > element.clientWidth + subpixel && paintsText(element);
  };
  const nameOf = (control: Element): string => (control.getAttribute("aria-label") ?? control.textContent).trim().slice(0, 40);
  return [...subject.querySelectorAll(reachable)]
    .filter((control) => control.checkVisibility({ visibilityProperty: true }) && control.closest("[inert]") === null && control.closest(rowDoors) === null)
    .flatMap((control) => {
      // Text the control hides from the accessible tree or only describes (a facet row's one-line preview or gloss) is not its value.
      const descriptions = (control.getAttribute("aria-describedby") ?? "").split(/\s+/u).flatMap((id) => document.getElementById(id) ?? []);
      const isValue = (element: Element): boolean =>
        element.closest('[aria-hidden="true"]') === null && !descriptions.some((description) => description.contains(element));
      return [control, ...control.querySelectorAll("*")]
        .filter((element) => element.checkVisibility({ visibilityProperty: true }) && isValue(element) && cut(element))
        .map(
          (element) =>
            `${control.tagName.toLowerCase()} "${nameOf(control)}" has its value cut: ${element.tagName.toLowerCase()} ${element.scrollWidth}/${element.clientWidth}`,
        );
    });
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
  await scope.page().locator(BOOT_VEIL).waitFor({ state: "detached" });
  const controls = await scope.evaluate(controlGeometry, { reachable: REACHABLE, subpixel: LAYOUT_SUBPIXEL_PX, transient: TRANSIENT_CHROME });
  const text = await scope.evaluate(cutOffText, { subpixel: LAYOUT_SUBPIXEL_PX });
  const values = await scope.evaluate(cutControlValues, { reachable: REACHABLE, rowDoors: ROW_DOORS, subpixel: LAYOUT_SUBPIXEL_PX });
  const columns = await scope.evaluate(sidewaysColumns, { strips: SIDEWAYS_STRIPS, subpixel: LAYOUT_SUBPIXEL_PX });
  const collapsed = await scope.evaluate(collapsedScrollers, { subpixel: LAYOUT_SUBPIXEL_PX });
  return [...controls.clipped, ...controls.overlaps, ...text, ...values, ...columns, ...collapsed];
}
