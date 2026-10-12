// composer-FOCUS store CT — the P5 CYOA compose-mode focus signal (a room-scoped nonce a non-composer
// surface bumps to focus the composer textarea). `requestComposerFocus` bumps a scope's nonce;
// `useComposerFocusRequest` reads it reactively (the composer focuses on every change). A CT (not a unit
// test) because the read surface is the reactive hook — useSyncExternalStore needs a browser render (the
// composer-draft-store.ct.tsx posture). Proves: each request BUMPS the nonce (a repeat is a distinct
// signal, not a no-op — the composer must re-focus on every pick), and the nonce is per-scope.

import { expect, test } from "@playwright/experimental-ct-react";
import { ComposerFocusProbe } from "./_ct-stories.tsx";

test("each requestComposerFocus bumps the scope's nonce (a repeat is a fresh signal), and scopes are independent", async ({ mount }) => {
  const probe = await mount(<ComposerFocusProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("nonce=0 other=0");

  await probe.getByRole("button", { name: "request focus" }).click();
  await expect(state).toHaveText("nonce=1 other=0");

  // A second request on the SAME scope bumps again — the composer must re-focus on every choice pick, so a
  // repeat is a distinct signal (a boolean flag would have coalesced two picks into one focus).
  await probe.getByRole("button", { name: "request focus" }).click();
  await expect(state).toHaveText("nonce=2 other=0");

  // A different scope's nonce is independent (per-room keying).
  await probe.getByRole("button", { name: "request other" }).click();
  await expect(state).toHaveText("nonce=2 other=1");
});
