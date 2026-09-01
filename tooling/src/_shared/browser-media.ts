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

export function resolveProbeMedia(opts: ProbeMediaOptions): ProbeMedia {
  return {
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
    reducedTransparency: opts.reducedTransparency ?? false,
    ...(opts.colorScheme === null ? {} : { colorScheme: opts.colorScheme }),
    ...(opts.contrast === undefined || opts.contrast === null ? {} : { contrast: opts.contrast }),
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
