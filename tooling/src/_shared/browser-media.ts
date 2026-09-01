// Browser media emulation shared by every probe page. Playwright owns the supported feature surface;
// reduced transparency stays on the same page through Chromium CDP because Playwright 1.61.1 does not
// expose it. Runtime truth is read separately by browser-environment.ts through matchMedia.

import type { Page } from "@playwright/test";

export interface ProbeMedia {
  readonly colorScheme?: "light" | "dark";
  readonly reducedMotion: "reduce" | "no-preference";
  readonly contrast?: "more" | "no-preference";
  readonly reducedTransparency: boolean;
}

export interface ProbeMediaOptions {
  readonly colorScheme: "light" | "dark" | null;
  readonly reducedMotion: boolean;
  readonly contrast?: "more" | "no-preference" | null;
  readonly reducedTransparency?: boolean;
}

interface ProbeMediaObservation {
  readonly dark: boolean;
  readonly light: boolean;
  readonly reducedMotion: boolean;
  readonly contrastMore: boolean;
  readonly reducedTransparency: boolean;
}

const READ_PROBE_MEDIA = `(() => ({
  dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  light: window.matchMedia("(prefers-color-scheme: light)").matches,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  contrastMore: window.matchMedia("(prefers-contrast: more)").matches,
  reducedTransparency: window.matchMedia("(prefers-reduced-transparency: reduce)").matches,
}))()`;

export function resolveProbeMedia(opts: ProbeMediaOptions): ProbeMedia {
  return {
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
    reducedTransparency: opts.reducedTransparency ?? false,
    ...(opts.colorScheme === null ? {} : { colorScheme: opts.colorScheme }),
    ...(opts.contrast === undefined || opts.contrast === null ? {} : { contrast: opts.contrast }),
  };
}

/** Snapshot the page's live media identity before a browser observer attaches. Chromium's DevTools
 *  frontend resets emulated media on the inspected target, so the observer must restore what it read. */
export async function readProbeMedia(page: Page): Promise<ProbeMedia> {
  const actual = (await page.evaluate(READ_PROBE_MEDIA)) as ProbeMediaObservation;
  let colorScheme: ProbeMedia["colorScheme"];
  if (actual.dark === true) {
    colorScheme = "dark";
  } else if (actual.light === true) {
    colorScheme = "light";
  }
  return {
    ...(colorScheme === undefined ? {} : { colorScheme }),
    reducedMotion: actual.reducedMotion === true ? "reduce" : "no-preference",
    contrast: actual.contrastMore === true ? "more" : "no-preference",
    reducedTransparency: actual.reducedTransparency === true,
  };
}

export async function applyProbeMedia(page: Page, media: ProbeMedia): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  // Every page starts from a stated feature slate. Without this reset, Chromium retains a prior
  // reduced-transparency override even after the supported Playwright media fields change.
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  await page.emulateMedia({
    ...(media.colorScheme === undefined ? {} : { colorScheme: media.colorScheme }),
    reducedMotion: media.reducedMotion,
    ...(media.contrast === undefined ? {} : { contrast: media.contrast }),
  });
  // Sending the complete slate after Playwright's supported call prevents CDP from erasing the other
  // features. The session stays attached for the override lifetime; page/context teardown owns it.
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      ...(media.colorScheme === undefined ? [] : [{ name: "prefers-color-scheme", value: media.colorScheme }]),
      { name: "prefers-reduced-motion", value: media.reducedMotion },
      ...(media.contrast === undefined ? [] : [{ name: "prefers-contrast", value: media.contrast }]),
      { name: "prefers-reduced-transparency", value: media.reducedTransparency ? "reduce" : "no-preference" },
    ],
  });
}
