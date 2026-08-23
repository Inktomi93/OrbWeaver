// settings-scroll-spy — the settings shell's three PURE DOM helpers, extracted from the surface (it hit
// the component-size cap when the narrow push-detail arm landed; pure logic goes to a lib, per the gate).
// The host owns the WHEN (which listener, which suppression window); this file owns the WHAT: where the
// reader is, how a jumped-to section announces itself, and the one-frame wait every scroll here needs.

import { prefersReducedMotionNow, scrollBehavior } from "@orb/ui/lib";

// The flash ring is an inset box-shadow (not outline) so it clips to the section's border-box; applied
// via a class toggle (not inline style) so the token radius/transition still apply.
const FLASH_MS = 1200;
const FLASH_BASE_CLASS = "settings-flash-anchor";
const FLASH_LIT_CLASS = "settings-flash-anchor--lit";
/** How far down the pane the spy line sits — the section crossing it is the one you are reading. */
const SPY_LINE_RATIO = 0.3;
/** Sub-pixel slack when comparing scroll extents (a fractional scrollHeight is not a scroll). */
const SPY_BOTTOM_EPS = 2;

/** Run after the browser has laid out the current commit. Every programmatic scroll in the settings shell
 *  goes through it: the narrow arm's push makes the pane column visible only in the render the click
 *  schedules, and a `scrollTo`/`scrollIntoView` against a still-`display:none` element is a silent no-op. */
export function afterPaint(run: () => void): void {
  requestAnimationFrame(run);
}

/** The subcategory id currently "active" under scroll-spy — the last section past the spy line, or the last section at the very bottom. */
export function computeActiveSub(container: HTMLElement, prefix: string): string | null {
  const sections = [...container.querySelectorAll<HTMLElement>(`[id^="${prefix}"]`)];
  if (sections.length === 0) {
    return null;
  }
  const last = sections.at(-1);
  // A pane that FITS (or is not painted at all, the narrow arm's hidden column: 0 === 0) is at its bottom
  // and at its top simultaneously. The bottom arm below would then light the LAST section while the reader
  // is looking at the first — a nav that lies about where you are. No scroll ⇒ you are at the first section.
  if (container.scrollHeight - container.clientHeight <= SPY_BOTTOM_EPS) {
    return sections[0]?.id.slice(prefix.length) ?? null;
  }
  // NOT SCROLLED ⇒ THE FIRST SECTION, unconditionally (#549). The same argument as the fits-arm above, for
  // the case where the pane DOES scroll: at `scrollTop === 0` nothing is above the reader, so the section
  // they are looking at is the first one — no geometry can make that false. The line-crossing loop below
  // agrees whenever layout has SETTLED, and disagrees exactly while it has not: measured live on
  // `openSettingsTo("workloads")` (aria-current on "Analysis tuning", the LAST of three, on direct entry —
  // the shell's own deep-link effect now suppresses the spy through the landing, but a spy that can compute
  // a lie from a transient frame will find another one). A pane measured mid-mount — or mid-dialog-enter,
  // where the popup's transform compresses every rect — stacks all its anchors inside the top 30%, and the
  // loop then walks past every one of them and lights the last.
  if (container.scrollTop <= SPY_BOTTOM_EPS) {
    return sections[0]?.id.slice(prefix.length) ?? null;
  }
  const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - SPY_BOTTOM_EPS;
  if (atBottom && last !== undefined) {
    return last.id.slice(prefix.length);
  }
  const line = container.getBoundingClientRect().top + container.clientHeight * SPY_LINE_RATIO;
  let current = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= line) {
      current = section;
    } else {
      break;
    }
  }
  return current === undefined ? null : current.id.slice(prefix.length);
}

/** Scroll a jumped-to section to the top of the pane and flash its inset ring, so the eye lands on the
 *  thing the jump named instead of hunting a silently-repositioned page. */
export function flashAnchor(el: HTMLElement): void {
  el.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  el.classList.add(FLASH_BASE_CLASS, FLASH_LIT_CLASS);
  globalThis.setTimeout(() => {
    el.classList.remove(FLASH_LIT_CLASS);
    // Reduced motion REMOVES the transition (the globals.css floor sets `transition-property: none`),
    // so `transitionend` never arrives — and the base class carries the ring's padding/margin pair, so
    // leaving it on would permanently re-pad the section. Drop it with the light instead.
    if (prefersReducedMotionNow()) {
      el.classList.remove(FLASH_BASE_CLASS);
      return;
    }
    el.addEventListener("transitionend", () => el.classList.remove(FLASH_BASE_CLASS), {
      once: true,
    });
  }, FLASH_MS);
}
