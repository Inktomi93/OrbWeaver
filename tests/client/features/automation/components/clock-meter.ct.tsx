// CT: §4 #7's CLOCK METER (clock-meter.tsx) — the room-facing half of the `clockFires` preset, driven over
// the REAL tRPC path with a stubbed network (`routeTrpc`). What is asserted is what a MEMBER SEES: a segmented
// ring that names itself and reads its own fill/threshold, a readable numeric datum beside it (colour is never
// the sole signal), and — the property the flank column depends on — NOTHING AT ALL in a room with no clock.
//
// THE MAX IS WHAT GATES THE RENDER, not the fill. The threshold is a published variable (`clockMax`), and a
// ring with no known size is a broken gauge — so an absent/invalid max renders nothing, while a present max
// with an absent fill draws an honest EMPTY ring (the state right after a fire, which deletes only the fill).
// The layout-neutral-when-absent arm is the point of the file: this widget mounts in EVERY committed room
// (its `when` is sync and cannot see query data), so "renders nothing" is its behaviour in most rooms.

import { CLOCK_MAX_VAR_KEY, CLOCK_VAR_KEY } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ClockMeterStory } from "../_ct-stories.tsx";

const CHAT = castId<ChatId>("chat_ct_clock_00000001");

/** Stub the room's runtime variable fold. */
async function routeVariables(page: Page, variables: Readonly<Record<string, string>>): Promise<void> {
  await routeTrpc(page, { "chat.getRuntimeVariables": variables });
}

test("a clocked room renders the ring, named on its OWN fill/threshold with a readable datum", async ({ mount, page }) => {
  await routeVariables(page, { [CLOCK_VAR_KEY]: "3", [CLOCK_MAX_VAR_KEY]: "4" });

  const component = await mount(<ClockMeterStory chatId={CHAT} />);

  const meter = component.getByRole("meter", { name: "Clock: 3 of 4" });
  await expect(meter).toBeVisible();
  await expect(meter).toHaveAttribute("aria-valuenow", "3");
  await expect(meter).toHaveAttribute("aria-valuemax", "4");
  // The datum in WORDS, not colour alone — a filled-segment count is unreadable to a colour-blind reader and
  // invisible to a screen reader looking at the label row.
  await expect(component.getByText("3 / 4")).toBeVisible();
});

test("a room with NO clockMax renders nothing at all — no ring, no card, no chrome (layout-neutral)", async ({ mount, page }) => {
  // The overwhelmingly common case: the preset was never added, or its first beat has not landed. Only the
  // FILL is meaningless without a size, so even a present `clock` value alone must draw nothing.
  await routeVariables(page, { [CLOCK_VAR_KEY]: "2" });

  const component = await mount(<ClockMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter")).toHaveCount(0);
  // The whole mount paints nothing — the property the flank column's `empty:hidden` collapse depends on.
  expect((await component.innerHTML()).trim()).toBe("");
});

test("a present max with an ABSENT fill draws an honest empty ring — the post-fire reset state", async ({ mount, page }) => {
  // R2 deletes only the fill when it fires; `clockMax` survives. "0 of N" is a real reading, not "absent".
  await routeVariables(page, { [CLOCK_MAX_VAR_KEY]: "4" });

  const component = await mount(<ClockMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter", { name: "Clock: 0 of 4" })).toHaveAttribute("aria-valuenow", "0");
  await expect(component.getByText("0 / 4")).toBeVisible();
});

test("a NON-NUMERIC max renders nothing rather than a broken gauge", async ({ mount, page }) => {
  // The vars plane is shared: a member's `{{setvar}}` or another rule can put words in any key.
  await routeVariables(page, { [CLOCK_VAR_KEY]: "2", [CLOCK_MAX_VAR_KEY]: "soon" });

  const component = await mount(<ClockMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter")).toHaveCount(0);
});

test("a max below two renders nothing — a segmented ring needs at least two wedges", async ({ mount, page }) => {
  await routeVariables(page, { [CLOCK_VAR_KEY]: "0", [CLOCK_MAX_VAR_KEY]: "1" });

  const component = await mount(<ClockMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter")).toHaveCount(0);
});

test("an OFF-SCALE fill is clamped to the ring, never drawn past its own arc", async ({ mount, page }) => {
  // The preset writes a bounded fill, but the same variable is hand-writable — so the reader clamps too.
  await routeVariables(page, { [CLOCK_VAR_KEY]: "99", [CLOCK_MAX_VAR_KEY]: "4" });

  const component = await mount(<ClockMeterStory chatId={CHAT} />);

  await expect(component.getByRole("meter", { name: "Clock: 4 of 4" })).toHaveAttribute("aria-valuenow", "4");
  await expect(component.getByText("4 / 4")).toBeVisible();
});
