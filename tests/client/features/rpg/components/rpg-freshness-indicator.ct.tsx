// CT: `<RpgFreshnessIndicator>` — the takeover's honest state-freshness hint (the 2026-07-27 owner ruling:
// a post-commit round's lag is ACCEPTED as long as an indicator surfaces it; a mode with NO post-commit call
// must NOT show a fake lag). Mounted in isolation (a pure component — no providers/network), so every honest
// state is deterministically assertable without driving a live turn over SSE. Asserts the LABEL datum per state
// (the tracker-kit a11y model: text is the datum) + that the FOLDED path ignores `pending` (no "Updating…").
//
// EFF-3: the component now keys on the room's EFFECTIVE delivery, not the `extractionMode` knob. The two tests
// that exist BECAUSE of that change are the guarded arm (a `folded` game that cannot fold reads the lag label,
// not "Live" — D112 (4)'s KNOWN GAP was exactly this pill lying) and the no-write-path arm (nothing delivers
// state, so the pill renders nothing rather than a freshness claim beside the Read-only pill).

import { expect, test } from "@playwright/experimental-ct-react";
import {
  RpgFreshnessCheapIdleStory,
  RpgFreshnessCheapStory,
  RpgFreshnessFoldedStory,
  RpgFreshnessGuardedStory,
  RpgFreshnessNoneStory,
} from "../_ct-stories.tsx";

// The two title phrases that separate "the host chose the two-call arm" from "this room was downgraded" — the
// whole point of the EFF-3 arm is that those are different sentences.
const HOST_CHOSE_RE = /the delivery model you picked/u;
const GUARD_REASON_RE = /goes silent when it's asked to record state inside the reply/u;

test("post-commit round + idle: surfaces the accepted one-beat lag ('As of last beat')", async ({ mount }) => {
  const component = await mount(<RpgFreshnessCheapIdleStory />);
  await expect(component.getByText("As of last beat")).toBeVisible();
  // Not the transient, and never the folded-mode label.
  await expect(component.getByText("Updating…")).toHaveCount(0);
  await expect(component.getByText("Live")).toHaveCount(0);
  // The host chose this arm — the title says so and names no downgrade cause.
  await expect(component).toHaveAttribute("title", HOST_CHOSE_RE);
});

test("post-commit round + pending: the round's window shows the transient 'Updating…' (pulse aria-hidden), never a false 'Live'", async ({ mount }) => {
  const component = await mount(<RpgFreshnessCheapStory />);
  await expect(component.getByText("Updating…")).toBeVisible();
  await expect(component.getByText("As of last beat")).toHaveCount(0);
  await expect(component.getByText("Live")).toHaveCount(0);
  // The decorative pulse mark carries no accessible name — the label IS the datum (the pill root carries the
  // `rpg-freshness` slot; the pulse glyph is its aria-hidden descendant).
  await expect(component).toHaveAttribute("data-slot", "rpg-freshness");
  await expect(component.locator(".animate-pulse")).toHaveAttribute("aria-hidden", "true");
});

test("folded: a minimal 'Live' affordance — no fake lag label", async ({ mount }) => {
  const component = await mount(<RpgFreshnessFoldedStory />);
  await expect(component.getByText("Live")).toBeVisible();
  await expect(component.getByText("As of last beat")).toHaveCount(0);
  await expect(component.getByText("Updating…")).toHaveCount(0);
});

test("EFF-3: a folded game that CANNOT fold reads the lag label with the reason — never 'Live'", async ({ mount }) => {
  const component = await mount(<RpgFreshnessGuardedStory />);
  await expect(component.getByText("As of last beat")).toBeVisible();
  // The lie this arm exists to kill.
  await expect(component.getByText("Live")).toHaveCount(0);
  // …and the WHY is carried, not just the lag: the local-engine guard's own explanation, not the
  // host-chose-this line the plain two-call arm gets.
  await expect(component).toHaveAttribute("title", GUARD_REASON_RE);
  await expect(component).not.toHaveAttribute("title", HOST_CHOSE_RE);
});

test("no model write path: the pill renders NOTHING (the Read-only pill is the honest word)", async ({ mount }) => {
  const component = await mount(<RpgFreshnessNoneStory />);
  await expect(component).toHaveAttribute("data-testid", "freshness-slot");
  await expect(component.locator('[data-slot="rpg-freshness"]')).toHaveCount(0);
  await expect(component.getByText("As of last beat")).toHaveCount(0);
  await expect(component.getByText("Live")).toHaveCount(0);
  await expect(component.getByText("Updating…")).toHaveCount(0);
});
