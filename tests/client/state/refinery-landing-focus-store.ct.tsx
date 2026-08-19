// refinery-landing-FOCUS store CT (#307) — the desktop landing CTA's cross-surface focus signal: the
// roster empty-state CTA and the CONTENT landing picker are two shell surfaces with no ref between them,
// so the CTA asks the mounted picker to take focus via a monotonic nonce. `requestRefineryLandingFocus`
// (no args — a single global nonce, unlike the room-scoped composer signal) bumps it;
// `useRefineryLandingFocusRequest` reads it reactively. A CT (not a unit test) because the read surface is
// the reactive hook — useSyncExternalStore needs a browser render (the composer-focus-store.ct posture).
// Proves: each request BUMPS the nonce (a repeat is a distinct signal, not a no-op — the picker must
// re-focus on every CTA click).

import { expect, test } from "@playwright/experimental-ct-react";
import { RefineryLandingFocusProbe } from "./_ct-stories.tsx";

test("each requestRefineryLandingFocus bumps the nonce (a repeat is a fresh signal)", async ({ mount }) => {
  const probe = await mount(<RefineryLandingFocusProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("nonce=0");

  await probe.getByRole("button", { name: "request focus" }).click();
  await expect(state).toHaveText("nonce=1");

  // A second request bumps again — the picker must re-focus on every CTA click, so a repeat is a distinct
  // signal (a boolean flag would have coalesced two clicks into one focus).
  await probe.getByRole("button", { name: "request focus" }).click();
  await expect(state).toHaveText("nonce=2");
});
