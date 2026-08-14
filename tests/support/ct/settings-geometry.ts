// The settings render-parity harness (SET-SEAMS §9) — the per-pane geometry assertion, generalized from
// the appearance pane's own CT so every stage can run it on the pane it decomposes, BEFORE and AFTER.
//
// The invariant (owner ruling — Discord grammar): a pane is a SINGLE COLUMN of section boxes. Every
// `[id^="settings-anchor-<pane>-"]` box shares one left edge, fills (nearly) the column width, and stacks
// in strictly increasing vertical order — never two sections side by side. A decomposition that changes the
// pixels is a defect (`done ≠ rendered`), and a green CT over stubbed tRPC can't see that on its own.

import type { Page } from "@playwright/test";

/** One section box, rounded to whole CSS px (sub-pixel layout noise is not a defect). */
export interface SettingsSectionBox {
  readonly id: string;
  readonly x: number;
  readonly top: number;
  readonly width: number;
}

export interface SettingsPaneGeometry {
  readonly count: number;
  /** The client width of the first section's parent — the column the sections must fill. */
  readonly parentWidth: number;
  readonly rows: readonly SettingsSectionBox[];
}

/** Measure every anchored section box in one pane, in DOM order. */
export function readSettingsPaneGeometry(page: Page, paneId: string): Promise<SettingsPaneGeometry> {
  return page.evaluate((pane: string): SettingsPaneGeometry => {
    const sections = [...document.querySelectorAll<HTMLElement>(`[id^="settings-anchor-${pane}-"]`)];
    const parent = sections[0]?.parentElement;
    return {
      count: sections.length,
      parentWidth: parent?.clientWidth ?? -1,
      rows: sections.map((s) => {
        const r = s.getBoundingClientRect();
        return { id: s.id, x: Math.round(r.x), top: Math.round(r.top), width: Math.round(r.width) };
      }),
    };
  }, paneId);
}

/** The single-column verdict for a measured pane: `null` when it holds, else the first violation. */
export function findSettingsColumnViolation(geometry: SettingsPaneGeometry, minSections: number): string | null {
  if (geometry.count < minSections) {
    return `expected ≥ ${minSections} anchored sections, measured ${geometry.count}`;
  }
  const firstX = geometry.rows[0]?.x ?? 0;
  for (const row of geometry.rows) {
    if (Math.abs(row.x - firstX) > 1) {
      return `${row.id} breaks the single column: left edge ${row.x} vs ${firstX}`;
    }
    if (row.width < geometry.parentWidth - 2) {
      return `${row.id} does not fill the column: width ${row.width} vs parent ${geometry.parentWidth}`;
    }
  }
  for (let i = 1; i < geometry.rows.length; i += 1) {
    const previous = geometry.rows[i - 1];
    const current = geometry.rows[i];
    if (previous !== undefined && current !== undefined && current.top <= previous.top) {
      return `${current.id} is not stacked below ${previous.id} (tops ${current.top} vs ${previous.top})`;
    }
  }
  return null;
}

/** Every settings-nav row label CLIPPED at the current column width, in DOM order (duplicates kept — the
 *  caller sweeps category by category and dedupes). `scrollWidth > clientWidth` on the title span is the
 *  honest truncation test: the row's `text-overflow: ellipsis` leaves the element's box unchanged, so
 *  nothing else in the DOM says the label is abbreviated. */
export function readClippedNavLabels(page: Page): Promise<readonly string[]> {
  return page.evaluate((): readonly string[] => {
    const nav = document.querySelector('[role="navigation"]');
    return nav === null
      ? []
      : [...nav.querySelectorAll<HTMLElement>('[data-slot="list-row-title"]')]
          .filter((el) => el.scrollWidth > el.clientWidth)
          .map((el) => el.textContent ?? "");
  });
}

/** One absolutely-positioned descendant that ESCAPED the scroll container it lives in: an
 *  `position:absolute` box whose containing block resolves OUTSIDE the scroller, so the scroller's
 *  `overflow-y:auto` neither clips it nor counts it — its static position (deep inside the scrolled
 *  content) is instead added to the ANCESTOR's scrollable area. */
export interface EscapedAbsoluteBox {
  /** `data-slot` (or tag name) of the escaping element. */
  readonly what: string;
  /** `data-slot` (or tag name) of the containing block it landed on. */
  readonly landedOn: string;
}

/**
 * Every absolutely-positioned descendant of `selector` whose containing block is outside it.
 *
 * `offsetParent` IS the containing-block question for an `position:absolute` box (it returns the nearest
 * POSITIONED ancestor), which is exactly what decides whether an `overflow` scroller clips it. A scroller
 * that is itself `position:static` clips nothing absolutely positioned inside it.
 */
export function readEscapedAbsolutes(page: Page, selector: string): Promise<readonly EscapedAbsoluteBox[]> {
  return page.evaluate((sel: string): readonly EscapedAbsoluteBox[] => {
    const scroller = document.querySelector<HTMLElement>(sel);
    if (scroller === null) {
      return [];
    }
    const name = (el: Element | null): string =>
      el === null ? "«initial containing block»" : (el.getAttribute("data-slot") ?? el.getAttribute("role") ?? el.tagName);
    const escaped: EscapedAbsoluteBox[] = [];
    for (const el of scroller.querySelectorAll<HTMLElement>("*")) {
      if (getComputedStyle(el).position !== "absolute") {
        continue;
      }
      const containingBlock = el.offsetParent;
      if (containingBlock === null || !scroller.contains(containingBlock)) {
        escaped.push({ what: name(el), landedOn: name(containingBlock) });
      }
    }
    return escaped;
  }, selector);
}

/** Which of the shell's two columns is PAINTED, and how wide, at the current container width. Below the
 *  `@md` step exactly one may paint (push-detail); above it, both. `width` is 0 for an unpainted column. */
export interface SettingsShellColumns {
  readonly navPainted: boolean;
  readonly navWidth: number;
  readonly contentPainted: boolean;
  readonly contentWidth: number;
  /** The row both columns live in — the width a full-pane column has to fill. */
  readonly rowWidth: number;
}

export function readSettingsShellColumns(page: Page): Promise<SettingsShellColumns> {
  return page.evaluate((): SettingsShellColumns => {
    const nav = document.querySelector<HTMLElement>('[role="navigation"]');
    const region = document.querySelector<HTMLElement>('[role="region"]');
    // The pane COLUMN (the scroll region's parent) is what the push-detail arm shows/hides — the region
    // itself is only its scroller.
    const content = region?.parentElement ?? null;
    // `display:none` boxes have no client rects at all — the honest "is it painted" test.
    const painted = (el: Element | null): boolean => el !== null && el.getClientRects().length > 0;
    const width = (el: Element | null): number => Math.round(el?.getBoundingClientRect().width ?? 0);
    return {
      navPainted: painted(nav),
      navWidth: width(nav),
      contentPainted: painted(content),
      contentWidth: width(content),
      rowWidth: Math.round(nav?.parentElement?.getBoundingClientRect().width ?? -1),
    };
  });
}
