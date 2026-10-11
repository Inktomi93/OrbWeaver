// Pre-parser Appearance evidence. This is a separate shared seam because the init-script program is a
// complete browser instrument with its own lifecycle; keeping it in appearance.ts pushed the public
// settings-shim door past the tooling size cap. The settings shim still owns installation and re-exports
// the evidence types/read door, so callers do not gain a second Appearance API.

import type { BrowserContext, Page } from "@playwright/test";

const PREPAINT_RECORDER_KEY = "__orbAppearancePrepaint";

export interface AppearancePrepaintSample {
  readonly phase: "init" | "mutation";
  readonly dataTheme: string | null;
  readonly fontScale: string;
  readonly reducedMotion: string | null;
  readonly appReady: string | null;
}

export interface AppearancePrepaintEvidence {
  readonly samples: readonly AppearancePrepaintSample[];
  readonly overflow: number;
}

export async function installAppearancePrepaintRecorder(context: BrowserContext): Promise<void> {
  await context.addInitScript(`(() => {
    const key = ${JSON.stringify(PREPAINT_RECORDER_KEY)};
    const limit = 32;
    const state = { samples: [], overflow: 0 };
    const read = (phase) => {
      const root = document.documentElement;
      return {
        phase,
        dataTheme: root?.getAttribute("data-theme") ?? null,
        fontScale: root?.style.getPropertyValue("--font-scale") ?? "",
        reducedMotion: root?.getAttribute("data-reduced-motion") ?? null,
        appReady: root?.getAttribute("data-app-ready") ?? null,
      };
    };
    const retain = (sample) => {
      const previous = state.samples[state.samples.length - 1];
      if (previous && previous.dataTheme === sample.dataTheme && previous.fontScale === sample.fontScale && previous.reducedMotion === sample.reducedMotion && previous.appReady === sample.appReady) return;
      if (state.samples.length >= limit) { state.samples.shift(); state.overflow += 1; }
      state.samples.push(sample);
    };
    const styleFontScale = (value) => {
      const probe = document.createElement("span");
      if (value !== null) probe.setAttribute("style", value);
      return probe.style.getPropertyValue("--font-scale");
    };
    const valueAfter = (records, index, record) => {
      for (let next = index + 1; next < records.length; next += 1) {
        if (records[next].target === record.target && records[next].attributeName === record.attributeName) return records[next].oldValue;
      }
      return record.target.getAttribute(record.attributeName);
    };
    retain(read("init"));
    // Playwright installs this before the parser creates <html>. Observing the Document preserves that
    // genuinely prepaint init sample and also catches the root's insertion and subsequent carried-axis
    // mutations; waiting for documentElement would move the instrument after the transition it judges.
    new MutationObserver((records) => {
      let current = state.samples[state.samples.length - 1] ?? read("mutation");
      let changed = false;
      records.forEach((record, index) => {
        if (record.type !== "attributes" || record.target !== document.documentElement || record.attributeName === null) return;
        const value = valueAfter(records, index, record);
        if (record.attributeName === "data-theme") current = { ...current, phase: "mutation", dataTheme: value };
        if (record.attributeName === "style") current = { ...current, phase: "mutation", fontScale: styleFontScale(value) };
        if (record.attributeName === "data-reduced-motion") current = { ...current, phase: "mutation", reducedMotion: value };
        if (record.attributeName === "data-app-ready") current = { ...current, phase: "mutation", appReady: value };
        retain(current);
        changed = true;
      });
      if (!changed) retain(read("mutation"));
    }).observe(document, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-theme", "data-reduced-motion", "data-app-ready", "style"],
    });
    Object.defineProperty(globalThis, key, { value: state, configurable: false, enumerable: false, writable: false });
  })()`);
}

export async function readAppearancePrepaintEvidence(page: Page): Promise<AppearancePrepaintEvidence> {
  const value = await page.evaluate(`globalThis[${JSON.stringify(PREPAINT_RECORDER_KEY)}]`);
  if (typeof value !== "object" || value === null) {
    throw new Error("INSTRUMENT ERROR: appearance prepaint recorder is unavailable");
  }
  return value as AppearancePrepaintEvidence;
}
