// THE EDITOR CONTENT-COLUMN ORACLE (#1664) — "is this editor's column centered, and does it take the
// width its token says it should at THIS container width?"
//
// `--width-content-col`'s own `$description` states a THREE-CLASS consumption, not a bare cap: the column
// is centered (`mx-auto w-full`), capped at `--width-content-col`, and BREATHES to
// `--width-content-col-wide` once its container clears `@5xl`. Four member editors (tag · regex · roster ·
// databank detail) spelled only the cap, so each hard-clamped at 720px, left-pinned, inside panes measured
// live at 869–1864px. This helper is what their CTs assert through, in ONE home, because the four
// assertions are the same three questions and a per-file re-spelling is how three of them would drift.
//
// TWO THINGS IT DERIVES RATHER THAN ASSUMES:
//  · THE QUERY CONTAINER IS FOUND BY WALKING, never assumed to be the parent. `@5xl` resolves against the
//    nearest ancestor with a `container-type`, and that is NOT the same element for all four: three
//    editors sit directly inside their own `<Container>`, while the databank detail's `<Surface>` is
//    `display: contents` and its container is the SHELL's `content` region. A helper that measured
//    `parentElement` would silently measure the wrong box on the one surface that differs.
//  · THE EXPECTED WIDTHS COME FROM THE TOKENS, resolved by a throwaway probe planted inside the very
//    container under test (`reading-measure.suite.ct.tsx`'s idiom), so a token change moves the
//    expectation instead of rotting the test, and no px literal is ever written down.
//
// The gutters are measured against the column's OWN containing block (its parent's content box), which is
// what `margin-inline: auto` divides — not against the query container, which can be a different element.

import type { Locator } from "@playwright/test";

/** A host pane WIDER than `--width-content-col` (so the cap binds and the centering is visible) but below
 *  the `@5xl` container step — the shell's list-only config pane measured 869px here. */
export const CONTENT_COLUMN_NARROW_PANE = 900;
/** A host pane past `@5xl` — the shell's focus-mode content pane measured 1176px at a 1280 viewport and
 *  1816px at 1920, so this is inside the real range, not a hypothetical monitor. */
export const CONTENT_COLUMN_WIDE_PANE = 1440;

export interface ContentColumnMeasurement {
  /** The nearest `container-type` ancestor's content width — the box `@5xl` actually asks about. */
  readonly containerWidth: number;
  /** `getComputedStyle().maxWidth` resolved to px: which of the two tokens won at this container width. */
  readonly maxWidthPx: number;
  readonly columnWidth: number;
  /** `--width-content-col` resolved in the container's own context. */
  readonly capPx: number;
  /** `--width-content-col-wide` — the breathe step. */
  readonly widePx: number;
  /** Free space on each side of the column inside its containing block. Equal ⇒ centered. */
  readonly leftGutter: number;
  readonly rightGutter: number;
}

/** Measure one editor's content column: its query container, the two token widths, what it took, and
 *  whether it is centered. The column must be visible and settled. */
export async function measureContentColumn(locator: Locator): Promise<ContentColumnMeasurement> {
  return await locator.evaluate((column: HTMLElement): ContentColumnMeasurement => {
    let container: HTMLElement | null = column.parentElement;
    while (container !== null && getComputedStyle(container).containerType === "normal") {
      container = container.parentElement;
    }
    if (container === null) {
      // A LOUD REFUSAL, never a quiet zero: with no container ancestor the `@5xl` arm can never match, so
      // every measurement below would read as "the cap won" and the breathe would be untestable.
      throw new Error("no container-type ancestor above the content column — the @5xl arm cannot resolve here");
    }
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    container.append(probe);
    probe.style.width = "var(--width-content-col)";
    const capPx = probe.getBoundingClientRect().width;
    probe.style.width = "var(--width-content-col-wide)";
    const widePx = probe.getBoundingClientRect().width;
    probe.remove();

    // The BOX the auto margins divide is the nearest ancestor that GENERATES one. `display: contents`
    // parents generate none — the databank detail's `<Surface tier="form">` is exactly that — and their
    // `getBoundingClientRect()` is all zeros, which reads as a 1600px gutter imbalance rather than as
    // "wrong element". Walking past them is the difference between measuring centering and measuring noise.
    let parent: HTMLElement | null = column.parentElement;
    while (parent !== null && getComputedStyle(parent).display === "contents") {
      parent = parent.parentElement;
    }
    if (parent === null) {
      throw new Error("the content column has no box-generating ancestor to be centered inside");
    }
    const box = column.getBoundingClientRect();
    const inner = parent.getBoundingClientRect();
    const parentStyle = getComputedStyle(parent);
    const padLeft = Number.parseFloat(parentStyle.paddingLeft) + Number.parseFloat(parentStyle.borderLeftWidth);
    const padRight = Number.parseFloat(parentStyle.paddingRight) + Number.parseFloat(parentStyle.borderRightWidth);
    return {
      containerWidth: container.clientWidth,
      maxWidthPx: Number.parseFloat(getComputedStyle(column).maxWidth),
      columnWidth: box.width,
      capPx,
      widePx,
      leftGutter: box.left - (inner.left + padLeft),
      rightGutter: inner.right - padRight - box.right,
    };
  });
}
