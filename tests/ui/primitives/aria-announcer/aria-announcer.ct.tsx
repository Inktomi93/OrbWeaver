// CT: AriaAnnouncer (packages/ui/src/primitives/aria-announcer) — the visually-hidden `role="status"`
// live region SPA route/section-change announcements mount into. Covers the announcement lifecycle:
// mounted empty (never inserted already containing text — an inserted-with-text live region is not
// reliably announced) → a `message` prop change re-announces (the text appears) → politeness/atomicity
// as declared (`aria-live="polite"`, `aria-atomic="true"`) → a second distinct message replaces
// (coalesces to) the first, never appends.
import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import { expect, test } from "@playwright/experimental-ct-react";

test("mounts empty, visually hidden, with the declared politeness + atomicity", async ({ mount }) => {
  const component = await mount(<AriaAnnouncer message="" />);
  await expect(component).toHaveAttribute("role", "status");
  await expect(component).toHaveAttribute("aria-live", "polite");
  await expect(component).toHaveAttribute("aria-atomic", "true");
  await expect(component).toHaveText("");
  // sr-only: present in the AX tree (role="status"), clipped off-screen (the standard 1×1 clip
  // technique) rather than display:none — display:none would drop it from the accessibility tree too.
  await expect(component).toHaveCSS("overflow", "hidden");
  const box = await component.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(1);
  expect(box?.height ?? 0).toBeLessThanOrEqual(1);
});

test("a message-prop change re-announces: the live region's text updates to the new value", async ({ mount }) => {
  const component = await mount(<AriaAnnouncer message="" />);
  await component.update(<AriaAnnouncer message="Navigated to Settings" />);
  await expect(component).toHaveText("Navigated to Settings");
});

test("a second distinct message REPLACES the first — coalesces, never appends", async ({ mount }) => {
  const component = await mount(<AriaAnnouncer message="Navigated to Settings" />);
  await component.update(<AriaAnnouncer message="Navigated to Chat" />);
  await expect(component).toHaveText("Navigated to Chat");
  await expect(component).not.toContainText("Settings");
});
