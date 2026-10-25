// CDP media emulation for specs that need a feature Playwright does not model (reduced transparency), stated whole in one call.

import type { CDPSession, Page } from "@playwright/test";

/** The user media preferences a case states; each one it leaves out is emulated as `no-preference`. */
export interface MediaState {
  readonly contrast?: "more" | "no-preference";
  readonly transparency?: "reduce" | "no-preference";
  readonly motion?: "reduce" | "no-preference";
}

const mediaSessions = new WeakMap<Page, CDPSession>();

/**
 * State the whole emulated media list in one CDP call. Playwright models no reduced-transparency, and its own
 * `emulateMedia` replaces the CDP feature list, so a spec using this emulates media only here. The session stays
 * attached until {@link releaseEmulatedMedia}: its overrides end when it detaches.
 */
export async function emulateMedia(page: Page, media: MediaState): Promise<void> {
  const session = mediaSessions.get(page) ?? (await page.context().newCDPSession(page));
  mediaSessions.set(page, session);
  const features = [
    { name: "prefers-color-scheme", value: "dark" },
    { name: "prefers-reduced-motion", value: media.motion ?? "no-preference" },
    { name: "prefers-contrast", value: media.contrast ?? "no-preference" },
    { name: "prefers-reduced-transparency", value: media.transparency ?? "no-preference" },
  ];
  await session.send("Emulation.setEmulatedMedia", { features });
  const missed = await page.evaluate((list) => list.filter(({ name, value }) => !matchMedia(`(${name}: ${value})`).matches), features);
  if (missed.length > 0) {
    throw new Error(`Chromium did not take the emulated media ${JSON.stringify(missed)}`);
  }
}

/**
 * Detach the media session, ending its overrides. The gallery keeps one page per worker, so a session left attached
 * outlives its test and overrides a later spec's own `page.emulateMedia` (a print case stays on screen media).
 */
export async function releaseEmulatedMedia(page: Page): Promise<void> {
  const session = mediaSessions.get(page);
  mediaSessions.delete(page);
  await session?.detach();
}
