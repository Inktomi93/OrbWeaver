// The CONTAINING-BLOCK invariant for scroll containers — the general form of the settings phantom-scroll
// pin (`settings-geometry.ts::readEscapedAbsolutes`, owner dogfood 2026-08-13: "the settings screen scrolls
// past the end of its results").
//
// THE MECHANISM. An `overflow` scroller only clips — and only absorbs the scrollable overflow of — a
// `position:absolute` descendant whose CONTAINING BLOCK is inside it. A scroller that is itself
// `position:static` establishes no containing block, so every absolutely-positioned box under it resolves
// its containing block further up and contributes its STATIC POSITION (which can be thousands of px down a
// scrolled pane) to that ANCESTOR's scrollable area instead. The user sees a card that scrolls far past its
// last row into blank space.
//
// WHY IT IS A CLASS AND NOT ONE SURFACE. `sr-only` IS `position:absolute` (the Tailwind utility), and this
// app puts sr-only boxes everywhere a Base UI form primitive goes — NumberField's bounds announcer,
// Switch/Checkbox's hidden input, the combobox/command/autocomplete status lines, `AriaAnnouncer`, Spinner
// labels, the chart figures' datum text. None of the client's layout primitives establish a containing block
// (`Stack`/`Row`/`Container` base classes are `flex …`/`@container` only), so any feature scroller written
// as a bare `overflow-y-auto` is a candidate. The fix is one class: `relative` on the scroller.
//
// These readers are the INSTRUMENT for that class. `readEscapedAbsolutes` (settings-geometry.ts) answers the
// question for ONE named selector; `readPhantomScrollers` answers it for the WHOLE document, which is what a
// sweep needs — a surface's defect can live in a scroller nobody named.

import type { Page } from "@playwright/test";

/** One scroll container that fails the containing-block invariant, with the geometry that says whether the
 *  failure is currently VISIBLE (an inflated scrollable area) or merely latent. */
export interface PhantomScroller {
  /** `data-slot` / `data-testid` / `aria-label` / `role` / tag of the scroller, plus its first classes. */
  readonly scroller: string;
  /** Its computed `position` — `static` is the defect; anything else means the escapees came from a
   *  DIFFERENT static scroller nested inside it. */
  readonly position: string;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  /** `scrollHeight - clientHeight`: the px a user can scroll. Large with nothing rendered down there is the
   *  owner's "blank space below the last row". */
  readonly overflowPx: number;
  /** How many absolutely-positioned descendants resolved their containing block OUTSIDE this scroller. */
  readonly escapees: number;
  /** A de-duplicated sample of `<what> -> <where it landed>` for diagnosis. */
  readonly sample: readonly string[];
}

/**
 * Every scroll container in the document that holds at least one ESCAPED absolutely-positioned descendant.
 *
 * `offsetParent` IS the containing-block question for a `position:absolute` box (it returns the nearest
 * POSITIONED ancestor), which is exactly what decides whether a scroller clips it and counts it. A clean
 * document returns `[]`; anything else names the scroller that needs `relative`.
 */
export function readPhantomScrollers(page: Page): Promise<readonly PhantomScroller[]> {
  // Everything below runs INSIDE the page: `page.evaluate` ships this arrow's source, so it can reference
  // nothing from this module's scope — the helpers and the class-name join (`classList`, deliberately not a
  // `/\s+/` split) are declared in here for that reason, not by preference.
  return page.evaluate((): readonly PhantomScroller[] => {
    const nameOf = (el: Element | null): string => {
      if (el === null) {
        return "«initial containing block»";
      }
      const slot = el.getAttribute("data-slot") ?? el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.getAttribute("role");
      const classes = el.classList.length === 0 ? "" : `.${[...el.classList].slice(0, 4).join(".")}`;
      return `${el.tagName.toLowerCase()}${slot === null ? "" : `[${slot}]`}${classes}`;
    };
    /** `<what> -> <where its containing block landed>` for every absolute descendant that escaped `scroller`. */
    const escapeesOf = (scroller: HTMLElement): string[] => {
      const escaped: string[] = [];
      for (const descendant of scroller.querySelectorAll<HTMLElement>("*")) {
        const containingBlock = descendant.offsetParent;
        const escapes = containingBlock === null || !scroller.contains(containingBlock);
        if (escapes && getComputedStyle(descendant).position === "absolute") {
          escaped.push(`${nameOf(descendant)} -> ${nameOf(containingBlock)}`);
        }
      }
      return escaped;
    };
    const isScroller = (style: CSSStyleDeclaration): boolean => style.overflowY === "auto" || style.overflowY === "scroll";
    const out: PhantomScroller[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      const style = getComputedStyle(el);
      const escaped = isScroller(style) ? escapeesOf(el) : [];
      if (escaped.length > 0) {
        out.push({
          scroller: nameOf(el),
          position: style.position,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          overflowPx: el.scrollHeight - el.clientHeight,
          escapees: escaped.length,
          sample: [...new Set(escaped)].slice(0, 4),
        });
      }
    }
    return out;
  });
}
