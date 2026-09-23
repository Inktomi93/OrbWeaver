// `--expect-no-overflow`: the two arms of "nothing escapes this box".
//
// WHY TWO ARMS (#444, paid by #439). `scrollWidth - clientWidth` is a POSITIVE-ONLY measure. Content
// pushed off the LEFT or TOP edge of a box does not grow the scroll box at all, so the delta reads 0 on
// a frame where a control is painted outside its container and cut. Measured: a `nowrap` `justify-end`
// footer put "Blank chat" 35px left of a dialog's edge while this assertion printed `PASS overflow=0x0`
// (2026-08-22). A whole defect class — every left/top clip,
// which is what `justify-end`, `items-end`, `margin-left:auto` and RTL produce — was invisible.
//
// So the scroll arm stays (the honest measure of reachable spill) and a per-descendant rect sweep joins
// it: every descendant's border box against the clip boundary, all four sides.
//
// PER SIDE, NEVER PER AXIS — do not "simplify" this back. Scrolling sanctions only the POSITIVE side:
// content past the right/bottom edge of a scrolling axis is reachable, and the scroll delta measures it.
// There is NO negative scroll offset, so content before the content origin is unreachable and cut
// whatever the overflow value says. An axis-level decline re-blinds every `overflow: auto` surface —
// and the live new-chat dialog #439 was found on is `overflow: auto` on both axes with a zero scroll
// delta (measured on :5173), i.e. exactly the surface an axis-level fence would have skipped.
//
// THE REST OF THE PREDICATE (a naive sweep false-positives on every scroll container):
//   • the clip boundary is the root's PADDING box (`clientLeft`/`clientWidth`) — that is exactly where
//     `overflow: hidden` cuts, so a full-bleed child sitting in the container's padding is not a finding.
//     On a SCROLLED container the left/top boundary is the content ORIGIN (children have already moved
//     by `scrollLeft`/`scrollTop`); the document element is the exception, since its own box moves with
//     the page scroll;
//   • a descendant is skipped when it paints nothing (`display:none`, `visibility:hidden`, zero opacity,
//     a sub-2px box — which is also every `sr-only` stub), when it is `aria-hidden`, when it is
//     `position: fixed` (viewport-anchored; this box does not own its geometry), and when an ancestor
//     BETWEEN it and the root scrolls or clips (that inner box owns the cut, and is judged on its own);
//   • only the OUTERMOST escaper is reported — a broken row is one line, not one per icon and label.
//
// WHY A FUNCTION AND NOT A SCRIPT STRING. The fleet's init scripts ship as raw strings because the
// tooling tsconfig is DOM-less (`_shared/browser.ts` header), and the in-page CENSUSES that need no
// arguments are self-contained script strings (ops/contrast.ts). Neither shape fits here: measured
// against playwright 1.5x, the STRING form of `evaluate` receives neither the matched element nor the
// arg — it returns `undefined` silently — so a string sweep would have to re-resolve the selector
// in-page and re-implement the visibility filter the locator already applied. The function form keeps
// the element the assertion actually matched, and the DOM-less program is answered the way this very
// file already answered it before: by declaring the structural surface the body touches.
import type { Locator } from "@playwright/test";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { OverflowProbe } from "../contract/overflow.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Sub-pixel layout puts a rounded child a fraction outside its box constantly; the historical scroll
 *  arm's own tolerance is 1px and this is its rect-side twin. #439 spilled 27-35px. */
export const OVERFLOW_TOLERANCE_PX = 2;

/** One broken container is one finding. Past a handful the surface is structurally wrong and the
 *  operator needs the first offenders, not a census. */
export const OVERFLOW_MAX_ESCAPES = 5;

// The slice of the DOM this sweep touches, declared locally because `tooling/tsconfig.json` is
// `types: ["node"]` on purpose — tools are node-context and no tooling file may assume a document.
interface SweepStyle {
  readonly display: string;
  readonly visibility: string;
  readonly opacity: string;
  readonly position: string;
  readonly overflowX: string;
  readonly overflowY: string;
}
interface SweepRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}
interface SweepElement {
  readonly tagName: string;
  readonly textContent: string | null;
  readonly parentElement: SweepElement | null;
  readonly clientLeft: number;
  readonly clientTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly getAttribute: (name: string) => string | null;
  readonly getBoundingClientRect: () => SweepRect;
  readonly querySelectorAll: (selector: string) => readonly SweepElement[];
}
interface SweepGlobals {
  readonly getComputedStyle: (element: SweepElement) => SweepStyle;
  readonly document: { readonly documentElement: SweepElement };
}

/** The in-page half, exported so a browser test can run the SHIPPED body over a mounted frame instead
 *  of a re-typed paraphrase of it. Self-contained by contract: Playwright serializes this into the
 *  page, so it may not close over anything at module scope — every helper and constant is declared
 *  inside it. */
export function sweepOverflowEscapes(element: unknown, options: { readonly tolerancePx: number; readonly maxEscapes: number }): OverflowProbe {
  const root = element as SweepElement;
  const { getComputedStyle, document } = globalThis as unknown as SweepGlobals;
  const anchorMaxSteps = 4;
  const textHintMax = 24;
  /** Sub-2px boxes are plumbing and `sr-only` stubs — a 1x1 clipped box paints nothing to cut. */
  const paintedMinPx = 2;

  const scrollX = root.scrollWidth - root.clientWidth;
  const scrollY = root.scrollHeight - root.clientHeight;
  const axisScrolls = (value: string): boolean => value === "auto" || value === "scroll";
  const axisClips = (value: string): boolean => value === "hidden" || value === "clip";
  const rootStyle = getComputedStyle(root);
  // Left/top are judged always (no negative scroll offset exists); right/bottom only where the axis
  // does not scroll, because content there is reachable and the scroll delta is its measure.
  const sideScrolls = {
    left: false,
    top: false,
    right: axisScrolls(rootStyle.overflowX) || scrollX > options.tolerancePx,
    bottom: axisScrolls(rootStyle.overflowY) || scrollY > options.tolerancePx,
  };
  const judged = (["left", "top", "right", "bottom"] as const).filter((side) => !sideScrolls[side]);
  // The document element's own box moves with the page scroll, so its offset is already in the rect;
  // any other scroller keeps its box still while its children move.
  const origin = root === document.documentElement ? { x: 0, y: 0 } : { x: root.scrollLeft, y: root.scrollTop };
  const rootRect = root.getBoundingClientRect();
  const boxLeft = rootRect.left + root.clientLeft;
  const boxTop = rootRect.top + root.clientTop;
  const clip = { left: boxLeft - origin.x, top: boxTop - origin.y, right: boxLeft + root.clientWidth, bottom: boxTop + root.clientHeight };

  /** One locatable step of the anchor path: an `id`/`data-testid` ends the climb, anything else
   *  contributes its tag (qualified by `data-slot` when it carries one). */
  const anchorStep = (node: SweepElement): { readonly step: string; readonly final: boolean } => {
    const id = node.getAttribute("id");
    if (id !== null && id !== "") {
      return { step: `#${id}`, final: true };
    }
    const testId = node.getAttribute("data-testid");
    if (testId !== null && testId !== "") {
      return { step: `[data-testid=${testId}]`, final: true };
    }
    const slot = node.getAttribute("data-slot");
    return { step: node.tagName.toLowerCase() + (slot === null ? "" : `[data-slot=${slot}]`), final: node === root };
  };

  /** A finding nobody can locate is not a finding: climb to the nearest stable anchor, then name the
   *  element by its text so the operator recognises the control in the screenshot. */
  const locate = (el: SweepElement): string => {
    const steps: string[] = [];
    let node: SweepElement | null = el;
    for (let depth = 0; node !== null && depth < anchorMaxSteps; depth += 1) {
      const { step, final } = anchorStep(node);
      steps.unshift(step);
      if (final) {
        break;
      }
      node = node.parentElement;
    }
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, textHintMax);
    return text === "" ? steps.join(">") : `${steps.join(">")} "${text}"`;
  };

  /** The worst JUDGED side this box exits by, or null when it is inside the clip on every judged side.
   *  A box under the paint floor is plumbing (or an `sr-only` stub) and cuts nothing. */
  const worstSpill = (rect: SweepRect): { readonly side: OverflowProbe["judged"][number]; readonly px: number } | null => {
    if (rect.width <= paintedMinPx && rect.height <= paintedMinPx) {
      return null;
    }
    const bySide = { left: clip.left - rect.left, top: clip.top - rect.top, right: rect.right - clip.right, bottom: rect.bottom - clip.bottom };
    const spills = judged.map((side) => ({ side, px: bySide[side] }));
    spills.sort((a, b) => b.px - a.px);
    const worst = spills[0];
    return worst !== undefined && worst.px > options.tolerancePx ? { side: worst.side, px: Math.round(worst.px) } : null;
  };

  const escapes: Array<{ selector: string; side: OverflowProbe["judged"][number]; px: number }> = [];
  // Document order, so an element's ancestors are always decided before it is: `blocked` carries the
  // inherited verdict (hidden / scroll-managed / inner-clipped / already-reported) down the tree in O(1).
  const blocked = new Map<SweepElement, boolean>();
  // A live NodeList is iterable in every browser this fleet drives; the local type says array.
  for (const el of root.querySelectorAll("*")) {
    const parent = el.parentElement;
    const inherited = parent !== null && parent !== root && blocked.get(parent) === true;
    const style = getComputedStyle(el);
    const paints = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && el.getAttribute("aria-hidden") !== "true";
    const ownsOverflow = axisScrolls(style.overflowX) || axisScrolls(style.overflowY) || axisClips(style.overflowX) || axisClips(style.overflowY);
    // `position: fixed` is viewport-anchored — this box does not own its geometry and cannot be said
    // to be cutting it.
    const measurable = !inherited && paints && style.position !== "fixed" && escapes.length < options.maxEscapes;
    const spill = measurable ? worstSpill(el.getBoundingClientRect()) : null;
    if (spill !== null) {
      escapes.push({ selector: locate(el), side: spill.side, px: spill.px });
    }
    blocked.set(el, inherited || !paints || ownsOverflow || spill !== null);
  }
  return { scrollX, scrollY, judged, escapes };
}

/** Measure one matched element: the scroll deltas AND the child-rect sweep, in one page round-trip. */
export async function probeOverflow(target: Locator): Promise<OverflowProbe> {
  return await target.evaluate(sweepOverflowEscapes, { tolerancePx: OVERFLOW_TOLERANCE_PX, maxEscapes: OVERFLOW_MAX_ESCAPES });
}
