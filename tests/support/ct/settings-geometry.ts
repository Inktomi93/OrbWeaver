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
