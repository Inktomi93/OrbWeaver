// useUserBus CT (data/bus/use-user-bus.ts) — the (re)connect GAP-HEAL cadence, driven through the real
// production path: EventSource → httpSubscriptionLink → useUserBus → the live invalidation seam → real
// wire refetches. Only the network is stubbed.
//
// The invariant under test: the heal is a RECONNECT instrument, never a page-load one. Firing it on the
// FIRST connect cost a second wire fetch of every mounted user root on every page load (measured live on
// the snap stage at 23c00bdf: persona.list / character.list / settings.getUserSettings / chat.listChats
// each ×2, the heal wave landing after the mount wave had already RESOLVED). The mount's own reads ARE
// that page's fresh state; only a connect that FOLLOWS a live connection can have missed a write.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../support/ct/route-trpc";
import { routeUserStream } from "../../../support/ct/route-trpc-subscription";
import { UserBusGapHealStory } from "./_ct-stories";

const ROUTES = {
  "persona.list": (): readonly { id: string }[] => [{ id: "persona_ctuserbus" }],
  "tag.listTags": (): readonly { id: string }[] => [{ id: "tag_ctuserbus" }],
};

test("the FIRST connect does not gap-heal — a page load fetches each user root exactly once", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ROUTES);
  await routeUserStream(page, { events: [{ type: "tagsChanged" }] });

  await mount(<UserBusGapHealStory />);
  await expect(page.getByTestId("user-bus-state")).toContainText("personas=1");

  // The barrier: the scripted `tagsChanged` frame refetches the tag root. Its arrival is strictly after
  // the connection went live, so once it lands, any heal the connect could have caused is already counted.
  await expect.poll(() => trpc.count("tag.listTags")).toBe(2);
  // Still the mount's single fetch — the connect healed NOTHING (pre-fix this was 2).
  // ONESHOT-OK: settled by the barrier above — the tag refetch is driven by an `onData` frame, which the
  // link delivers strictly AFTER the `pending` connection-state transition, so a heal would already have
  // issued (and been recorded) by the time that refetch landed.
  expect(trpc.count("persona.list")).toBe(1);
});

test("a RECONNECT gap-heals — every user root refetches after the stream drops and re-attaches", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, ROUTES);
  const stream = await routeUserStream(page, { events: [], dropFirstConnection: true });

  await mount(<UserBusGapHealStory />);
  await expect(page.getByTestId("user-bus-state")).toContainText("personas=1");

  await expect.poll(() => stream.count(), { timeout: 15_000 }).toBeGreaterThan(1);
  await expect.poll(() => trpc.count("persona.list")).toBe(2);
  // ONESHOT-OK: settled by the persona poll above — ONE heal invalidates every user root in the same
  // synchronous pass, so once persona's refetch is recorded, tag's already is too.
  expect(trpc.count("tag.listTags")).toBe(2);
});
