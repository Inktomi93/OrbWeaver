// CT: the header memory-recall brain-icon (#313). Drives the chat-stream recall axis in-browser (idle →
// recalling → recalled) and asserts the three rendered states on the STABLE trigger — its accessible name
// carries the state, `data-recall-phase` carries the phase, and the recalled arm shows a count digit — plus
// a reduced-motion-SAFE pulse (the `motion-safe:animate-pulse` class, never a spin) only while recalling.
// Clicking the trigger opens the popover; its live summary copy is asserted per state. `viewerIsHost={false}`
// keeps the popover to the summary (no host-only detail read), so the mount needs no data layer.
//
// The popover content PORTALS to the document body, so its text is asserted through `page`, not the mounted
// `component` root (the portalled-surface rule).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { PAID_RUN_ROUTES } from "../../../../support/node/utility-role.ts";
import { RecallIndicatorHostStory, RecallIndicatorStory } from "../_ct-stories.tsx";

const TRIGGER = /^Memory/u;
const MOTION_SAFE_PULSE = /motion-safe:animate-pulse/u;
const ANIMATE_PULSE = /animate-pulse/u;
const RECALLING_COPY = /Recalling memories…/u;

test("the trigger reflects idle → recalling → retrieved:N, with a motion-safe pulse only while recalling", async ({ mount }) => {
  const component = await mount(<RecallIndicatorStory />);
  const trigger = component.getByRole("button", { name: TRIGGER });

  // Idle by default — memory off / no recall this turn. No count digit, muted, never a lying "0".
  await expect(trigger).toHaveAttribute("data-recall-phase", "idle");
  await expect(trigger).toHaveAccessibleName("Memory — idle");

  // Recalling — the pre-provider window (the "is it hanging?" tell). The glyph pulses, but ONLY under
  // motion-safe (a quiet breath, never a spin — the class itself proves the reduced-motion gate).
  await component.getByTestId("recall-recalling").click();
  await expect(trigger).toHaveAttribute("data-recall-phase", "recalling");
  await expect(trigger).toHaveAccessibleName("Memory — recalling");
  await expect(component.locator('[data-recall-phase="recalling"] svg')).toHaveClass(MOTION_SAFE_PULSE);

  // Retrieved:N — the count is in the accessible NAME (the visible digit is aria-hidden) and rendered.
  await component.getByTestId("recall-recalled").click();
  await expect(trigger).toHaveAttribute("data-recall-phase", "recalled");
  await expect(trigger).toHaveAccessibleName("Memory — 3 recalled");
  await expect(trigger).toContainText("3");
  // The pulse is gone once recall settles.
  await expect(component.locator('[data-recall-phase="recalled"] svg')).not.toHaveClass(ANIMATE_PULSE);

  // Back to idle clears the count (a memory-off turn never shows the prior turn's stale number).
  await component.getByTestId("recall-idle").click();
  await expect(trigger).toHaveAttribute("data-recall-phase", "idle");
  await expect(trigger).not.toContainText("3");
});

test("clicking the trigger opens the popover with the current state's live summary", async ({ mount, page }) => {
  const component = await mount(<RecallIndicatorStory />);
  const trigger = component.getByRole("button", { name: TRIGGER });

  // Idle summary.
  await trigger.click();
  await expect(page.getByText("No memories recalled this turn.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Recalling summary.
  await component.getByTestId("recall-recalling").click();
  await trigger.click();
  await expect(page.getByText(RECALLING_COPY)).toBeVisible();
  await page.keyboard.press("Escape");

  // Retrieved:N summary.
  await component.getByTestId("recall-recalled").click();
  await trigger.click();
  await expect(page.getByText("Retrieved 3 memories for this turn.")).toBeVisible();
});

// With Memory off for the account, "no memories recalled" is the wrong answer: nothing can be recalled until it
// is on. The host's popover offers the switch behind the same cost confirm Settings uses, and writes the same patch.
test("host: with Memory off the popover offers to turn it on through the cost confirm", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...PAID_RUN_ROUTES,
    "settings.getUserSettings": () => userSettingsView(),
    "settings.updateUserSettingsSection": () => userSettingsView({ memory: { enabled: true } }),
    "workloads.estimateModelCalls": { calls: 0 },
  });
  const component = await mount(<RecallIndicatorHostStory />);

  await component.getByRole("button", { name: TRIGGER }).click();
  await expect(page.getByText("No memories recalled this turn.")).toHaveCount(0);
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await page.getByRole("button", { name: "Turn on Memory" }).click();
  await expect
    .poll(() => trpc.lastInput("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] })
    .toMatchObject({ section: "memory", patch: { enabled: true } });
});

test("host: with Memory on the popover keeps the recall summary and offers no switch", async ({ mount, page }) => {
  await routeTrpc(page, { ...PAID_RUN_ROUTES, "settings.getUserSettings": () => userSettingsView({ memory: { enabled: true } }) });
  const component = await mount(<RecallIndicatorHostStory />);

  await component.getByRole("button", { name: TRIGGER }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toHaveCount(0);
});
