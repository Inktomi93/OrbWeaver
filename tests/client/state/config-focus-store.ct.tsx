// config-focus store CT (#866 S3) — the TEACHER's focused-setting seam. A CT because the read is a
// reactive hook (the config-search-store posture). The load-bearing rules: KEEP-LAST (a blur never
// clears — nothing here clears but a navigation or an explicit clear), and a NAVIGATION resets it (the
// nav store's land fires `clearConfigFocus`: a lesson about a row that just left the screen is a lie).

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigFocusProbe } from "./_ct-stories.tsx";

test("writes are read reactively; a section-level focus carries a null setting", async ({ mount }) => {
  const probe = await mount(<ConfigFocusProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset focus" }).click();
  await expect(state).toHaveText("focus=none");

  await probe.getByRole("button", { name: "focus density" }).click();
  await expect(state).toHaveText("focus=appearance/sizing/density");

  await probe.getByRole("button", { name: "focus the section" }).click();
  await expect(state).toHaveText("focus=appearance/sizing/-");
});

test("a NAVIGATION clears the focus (the nav store's land is the horizon), and clear clears", async ({ mount }) => {
  const probe = await mount(<ConfigFocusProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset focus" }).click();

  await probe.getByRole("button", { name: "focus density" }).click();
  await expect(state).toHaveText("focus=appearance/sizing/density");
  await probe.getByRole("button", { name: "navigate away" }).click();
  await expect(state).toHaveText("focus=none");

  await probe.getByRole("button", { name: "focus density" }).click();
  await probe.getByRole("button", { name: "clear focus" }).click();
  await expect(state).toHaveText("focus=none");
});
