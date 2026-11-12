// Enlarged-text geometry probes: controls a user cannot press, text cut with no ellipsis, overlapping controls,
// columns that scroll sideways and collapsed scrollers. The platform text-scale suites and the surface walk share them.
import { OVERLAY_RELATION_ATTRIBUTE } from "@orb/ui/lib";
import type { Locator, Page } from "@playwright/test";

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
// A Base UI part that is animating out carries `data-ending-style` until it unmounts or rests closed: the backdrop of a dialog closed a
// moment ago is portaled outside any scope and still takes the hit tests over it. The probes wait for every leaving part to go.
const LEAVING_LAYER = "[data-ending-style]";
// The text a control carries that the design truncates on purpose: a row's title and subtitle (the row's accessible name keeps the whole of
// it) and a facet row's one-line preview. A control in a row's actions slot, or any other text in the row, is judged.
const TRUNCATED_BY_DESIGN = [
  '[data-slot="list-row-title"]',
  '[data-slot="list-row-subtitle"]',
  '[data-slot="list-row-subtitle-stack"]',
  '[data-slot="member-name"]',
  '[data-slot="facet-preview"]',
].join(", ");
const SIDEWAYS_STRIPS = 'input, textarea, [role="tablist"], [role="toolbar"], [data-slot="character-context-band"] > * > *, [data-sideways-strip]';

interface ControlGeometry {
  readonly clipped: string[];
  readonly overlaps: string[];
  readonly declared: string[];
}

/**
 * Two probes over the reachable controls that paint. Clipped: a control painted past the viewport or past a clipping
 * ancestor on either axis (a scroller keeps its children reachable on its own axis), or covered at its centre by
 * something that is not the control. Overlapping: pairs inside one scroller, which a centre hit test misses when one
 * lies over a neighbour's edge; a pair whose two boxes declare one designed overlay is listed apart, by its relation's name.
 */
function controlGeometry(
  subject: Element,
  {
    reachable,
    subpixel,
    transient,
    relation,
  }: { readonly reachable: string; readonly subpixel: number; readonly transient: string; readonly relation: string },
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
  // A designed overlay is declared on both sides: each control sits in its own box declaring the same relation, and one box's
  // parent holds the other box. Any other pair, two controls of one box or a declared control over an undeclared one, is a finding.
  const declaredRelation = (inside: Element, across: Element): string | null => {
    const declarer = inside.closest(`[${relation}]`);
    const partner = across.closest(`[${relation}]`);
    const parent = declarer?.parentElement ?? null;
    if (declarer === null || partner === null || parent === null || declarer.contains(partner) || partner.contains(declarer) || !parent.contains(partner)) {
      return null;
    }
    const named = declarer.getAttribute(relation);
    return named === partner.getAttribute(relation) ? named : null;
  };
  const overlaps: string[] = [];
  const declared: string[] = [];
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
      const pair = `${label(element)} ${boxText(a)} overlaps ${label(other)} ${boxText(b)}`;
      const design = declaredRelation(element, other) ?? declaredRelation(other, element);
      if (design === null) {
        overlaps.push(pair);
      } else {
        declared.push(`${pair}, declared ${design}`);
      }
    }
  });
  return { clipped, overlaps, declared };
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
 * control says, and the reader chose the control for that text. Text the design truncates on purpose (`TRUNCATED_BY_DESIGN`) and text that only
 * describes the control are excluded; any other text of the control, a visible label included, is judged.
 */
function cutControlValues(
  subject: Element,
  { reachable, byDesign, subpixel }: { readonly reachable: string; readonly byDesign: string; readonly subpixel: number },
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
    .filter((control) => control.checkVisibility({ visibilityProperty: true }) && control.closest("[inert]") === null)
    .flatMap((control) => {
      const descriptions = (control.getAttribute("aria-describedby") ?? "").split(/\s+/u).flatMap((id) => document.getElementById(id) ?? []);
      const isValue = (element: Element): boolean => element.closest(byDesign) === null && !descriptions.some((description) => description.contains(element));
      return [control, ...control.querySelectorAll("*")]
        .filter((element) => element.checkVisibility({ visibilityProperty: true }) && isValue(element) && cut(element))
        .map(
          (element) =>
            `${control.tagName.toLowerCase()} "${nameOf(control)}" has its value cut: ${element.tagName.toLowerCase()} ${element.scrollWidth}/${element.clientWidth}`,
        );
    });
}

// How far one box or run of text overshoots its scroller's end edge, found at a structural path from the scroller.
interface SidewaysReach {
  readonly path: string;
  readonly overshoot: number;
  readonly depth: number;
  // The element the box is, or the element whose own text the run is.
  readonly owner: Element;
}

/**
 * A column that scrolls sideways has stopped reflowing; a strip of tabs or chips is built to scroll that way. The finding names the box
 * whose border box, or the run of text, reaches furthest past the scroller's unscrolled end edge (the left edge in a right-to-left
 * scroller), as a structural path from the scroller. On a tie the shallowest box is named: a box that fills a fixed-width parent only
 * carries the width its parent sets. Text directly in an element is measured with a range, so one unbreakable word names its paragraph's
 * text, or the scroller's own text. Content inside a box that clips or scrolls on x never widens the scroller, so it is passed over. A
 * pseudo-element's generated content has no node to measure, so a scroller widened only by one reads as having no descendant past its edge.
 *
 * A scroller whose sole content is one tablist or toolbar, and which that strip widens, is the strip degraded to a scroll: it lets the list
 * keep its measured width and its focus halo, and is not a finding.
 *
 * `sidewaysReach` in `tests/support/browser/sideways-reach.ts` is a second measure on purpose: it lists every leaf widener with its text
 * for a CT's failure message over fixture content, where this one names a single cause with no owner text in a walk finding.
 */
function sidewaysColumns(subject: Element, { strips, subpixel }: { readonly strips: string; readonly subpixel: number }): string[] {
  const clipsX = (element: Element): boolean => getComputedStyle(element).overflowX !== "visible";
  const step = (element: Element): string => {
    const slot = element.getAttribute("data-slot");
    const index = element.parentElement === null ? 1 : [...element.parentElement.children].indexOf(element) + 1;
    return `${element.tagName.toLowerCase()}:nth-child(${String(index)})${slot === null ? "" : `[data-slot="${slot}"]`}`;
  };
  const textOf = (element: Element): Text[] =>
    [...element.childNodes].filter((node): node is Text => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
  const cause = (scroller: Element): SidewaysReach | undefined => {
    const box = scroller.getBoundingClientRect();
    const rtl = getComputedStyle(scroller).direction === "rtl";
    // The edge of the unscrolled padding box, so a checkpoint read at a scroll position names the same cause.
    const edge = rtl ? box.left + scroller.clientLeft - scroller.scrollLeft : box.left + scroller.clientLeft + scroller.clientWidth - scroller.scrollLeft;
    const overshoot = ({ left, right }: DOMRect): number => (rtl ? edge - left : right - edge);
    const texts = (element: Element, path: string, depth: number): SidewaysReach[] =>
      textOf(element).map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return { path: element === scroller ? "its own text" : `${path} text`, overshoot: overshoot(range.getBoundingClientRect()), depth, owner: element };
      });
    const reaches = (element: Element, path: string, depth: number): SidewaysReach[] =>
      [...element.children].flatMap((child) => {
        const at = `${path} > ${step(child)}`;
        const own = { path: at, overshoot: overshoot(child.getBoundingClientRect()), depth, owner: child };
        return clipsX(child) ? [own] : [own, ...texts(child, at, depth + 0.5), ...reaches(child, at, depth + 1)];
      });
    const past = [...texts(scroller, ":scope", 0), ...reaches(scroller, ":scope", 1)].filter((reach) => reach.overshoot > subpixel);
    const furthest = Math.max(...past.map((reach) => reach.overshoot));
    return past.filter((reach) => reach.overshoot >= furthest - subpixel).toSorted((left, right) => left.depth - right.depth)[0];
  };
  const noGenerated = (element: Element): boolean =>
    ["::before", "::after"].every((pseudo) => ["none", "normal"].includes(getComputedStyle(element, pseudo).content));
  const degradedStrip = (scroller: Element, found: SidewaysReach | undefined): boolean => {
    const [only, ...rest] = [...scroller.childNodes].filter((node) => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim() !== "");
    return (
      found !== undefined &&
      rest.length === 0 &&
      only instanceof Element &&
      only.matches('[role="tablist"], [role="toolbar"]') &&
      only.contains(found.owner) &&
      noGenerated(scroller)
    );
  };
  return [subject, ...subject.querySelectorAll("*")]
    .filter((element) => {
      const scrolls = /auto|scroll/u.test(getComputedStyle(element).overflowX);
      return (
        scrolls && !element.matches(strips) && element.checkVisibility({ visibilityProperty: true }) && element.scrollWidth > element.clientWidth + subpixel
      );
    })
    .flatMap((element) => {
      const found = cause(element);
      if (degradedStrip(element, found)) {
        return [];
      }
      const widened = found === undefined ? "no descendant past its edge" : `${found.path} by ${String(Math.round(found.overshoot))}`;
      return [
        `${element.tagName.toLowerCase()} ${element.getAttribute("data-slot") ?? element.className} scrolls sideways by ${String(element.scrollWidth - element.clientWidth)}, widened by ${widened}`,
      ];
    });
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

/** The enlarged-text geometry of a scope: its findings, and the overlapping pairs a production declaration names as design. */
export interface EnlargedTextGeometry {
  /** An empty list is a clean scope. */
  readonly findings: readonly string[];
  /** Each declared pair, with the relation that declares it; never a finding. */
  readonly declaredOverlays: readonly string[];
}

// Each leaving part as a structural path from the body, so a failure names it without carrying the owner's text.
function leavingPaths(leaving: string): string[] {
  const step = (element: Element): string => {
    const slot = element.getAttribute("data-slot");
    const index = element.parentElement === null ? 1 : [...element.parentElement.children].indexOf(element) + 1;
    return `${element.tagName.toLowerCase()}:nth-child(${String(index)})${slot === null ? "" : `[data-slot="${slot}"]`}`;
  };
  return [...document.querySelectorAll(leaving)].map((element) => {
    const steps: string[] = [];
    for (let at: Element | null = element; at !== null && at !== document.body; at = at.parentElement) {
      steps.unshift(step(at));
    }
    return `body > ${steps.join(" > ")}`;
  });
}

/** Every Base UI part still carrying `data-ending-style`, as a structural path from the body. */
export async function leavingLayers(page: Page): Promise<string[]> {
  return await page.evaluate(leavingPaths, LEAVING_LAYER);
}

async function waitOutLeavingLayers(page: Page): Promise<void> {
  try {
    await page.waitForFunction((leaving) => document.querySelector(leaving) === null, LEAVING_LAYER);
  } catch (error) {
    // A part whose close is held and never released keeps its attribute; the bare timeout would name neither the part nor the wait.
    const stuck = await leavingLayers(page);
    if (stuck.length === 0) {
      throw error;
    }
    throw new Error(`enlarged-text geometry: a part never finished leaving: ${stuck.join("; ")}`, { cause: error });
  }
}

/**
 * @throws When a part carrying `data-ending-style` stays past the page's timeout; the message names each one by structural path.
 */
export async function enlargedTextGeometry(scope: Locator): Promise<EnlargedTextGeometry> {
  await scope.page().locator(BOOT_VEIL).waitFor({ state: "detached" });
  await waitOutLeavingLayers(scope.page());
  const controls = await scope.evaluate(controlGeometry, {
    reachable: REACHABLE,
    subpixel: LAYOUT_SUBPIXEL_PX,
    transient: TRANSIENT_CHROME,
    relation: OVERLAY_RELATION_ATTRIBUTE,
  });
  const text = await scope.evaluate(cutOffText, { subpixel: LAYOUT_SUBPIXEL_PX });
  const values = await scope.evaluate(cutControlValues, { reachable: REACHABLE, byDesign: TRUNCATED_BY_DESIGN, subpixel: LAYOUT_SUBPIXEL_PX });
  const columns = await scope.evaluate(sidewaysColumns, { strips: SIDEWAYS_STRIPS, subpixel: LAYOUT_SUBPIXEL_PX });
  const collapsed = await scope.evaluate(collapsedScrollers, { subpixel: LAYOUT_SUBPIXEL_PX });
  return { findings: [...controls.clipped, ...controls.overlaps, ...text, ...values, ...columns, ...collapsed], declaredOverlays: controls.declared };
}

/** Every enlarged-text geometry finding inside `scope`; an empty list is a clean scope. */
export async function enlargedTextFindings(scope: Locator): Promise<string[]> {
  return [...(await enlargedTextGeometry(scope)).findings];
}
