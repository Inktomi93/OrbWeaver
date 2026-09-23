// config-nav store CT — the Settings section's GROUP NAVIGATION (#866
// S1). A CT, not a unit test, because every read surface is a reactive hook (useSyncExternalStore needs a
// real browser — the config-selection-store posture).
//
// What it pins: `openConfigTo` is the ONE deep-link intent for every kind of group (a settings group, a
// section inside it, a leaf, a COLLECTION) and it arrives with the rail switched, the group EXPANDED and any
// stale member selection cleared; the spy's ONE write carries both the section and the VISIBLE ROWS (#926,
// the teacher roster's population), coalescing an identical membership and leaving the section on request; a LIST band click names the FIRST section current immediately (#549 — the
// row lights before the suppressed spy re-arms); the spy's write never moves the group; a repeated request
// mints a NEW landing (the nonce); and the EFFECTIVE active group is a derivation — an open member's kind
// wins over the explicitly activated group, which is what lets every owner's create hook stay one write.

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigNavProbe } from "./_ct-stories.tsx";

test("openConfigTo(group) lands the group at its top, expands it and switches the rail", async ({ mount }) => {
  const probe = await mount(<ConfigNavProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset nav" }).click();
  await probe.getByRole("button", { name: "go to chats" }).click();
  await expect(state).toContainText("group=none");
  await expect(state).toContainText("section=chats");

  await probe.getByRole("button", { name: "open appearance", exact: true }).click();
  await expect(state).toContainText("group=appearance seam=appearance sub=none target=appearance/-/-#");
  await expect(state).toContainText("section=config");
});

test("openConfigTo(group, sub, setting) carries the section AND the leaf into the target", async ({ mount }) => {
  const probe = await mount(<ConfigNavProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "open appearance motion" }).click();
  await expect(state).toContainText("group=appearance seam=appearance sub=motion target=appearance/motion/-#");

  await probe.getByRole("button", { name: "open prose leaf" }).click();
  await expect(state).toContainText("group=chat-behavior seam=chat-behavior sub=prose target=chat-behavior/prose/prose-arbiter#");
});

// ONE PASS, ONE REPORT (#926): the spy's write carries the section crossing its line AND the rows the
// reader can SEE, in one commit, so the LIST's lit row and the teacher's roster cannot disagree by a frame.
test("setActiveConfigSub reports the viewport's rows too — identical membership is a no-op, and `undefined` leaves the section", async ({ mount }) => {
  const probe = await mount(<ConfigNavProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset nav" }).click();
  await expect(state).toContainText("visible=none");

  await probe.getByRole("button", { name: "spy visible two", exact: true }).click();
  await expect(state).toContainText("visible=jobs/poll+jobs/retries");

  // A FRESH ARRAY WITH THE SAME MEMBERSHIP MUST NOT PUBLISH. The spy recomputes on every rAF of a scroll,
  // so an identity-only change would re-render the teacher per pixel; the store compares membership.
  await probe.getByRole("button", { name: "spy visible two again" }).click();
  await expect(state).toContainText("visible=jobs/poll+jobs/retries");

  // A REAL change does publish — the count tracking the viewport is the whole ruling.
  await probe.getByRole("button", { name: "spy visible one" }).click();
  await expect(state).toContainText("visible=jobs/retries");

  // THE LEAVE ARM: rows reported with `undefined` change the roster and leave the section standing — the
  // jump's named answer outranks the spy's guess, which is why a waited tick may report only the rows.
  await expect(state).toContainText("sub=jobs");
  await probe.getByRole("button", { name: "spy visible only" }).click();
  await expect(state).toContainText("visible=jobs/poll");
  await expect(state).toContainText("sub=jobs");

  // And a navigation to the welcome drops it with the rest of the nav facts.
  await probe.getByRole("button", { name: "clear group" }).click();
  await expect(state).toContainText("visible=none");
});

test("a repeated request is a NEW landing — the nonce advances", async ({ mount }) => {
  const probe = await mount(<ConfigNavProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "open appearance motion" }).click();
  const first = (await state.textContent()) ?? "";
  const firstNonce = Number(/#(\d+)/.exec(first)?.[1] ?? "-1");
  await probe.getByRole("button", { name: "open appearance motion" }).click();
  await expect(state).toContainText(`#${firstNonce + 1}`);
});

test('a COLLECTION is a config group too: openConfigTo("tags") expands the group and clears the open member', async ({ mount }) => {
  const probe = await mount(<ConfigNavProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select regex member" }).click();
  await expect(state).toContainText("selection=regex:regex_nav_probe");
  // The open member's KIND is the effective active group — a derivation, not a second write.
  await expect(state).toContainText("group=regex seam=none");

  await probe.getByRole("button", { name: "open tags" }).click();
  await expect(state).toContainText("selection=none");
  await expect(state).toContainText("group=tags seam=tags");
  await expect(state).toContainText("tagsOpen=true");
  await expect(state).toContainText("section=config");
});

test("a band click names the FIRST section current at once; a row click lands on its anchor; the spy only moves the sub", async ({ mount }) => {
  const probe = await mount(<ConfigNavProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "band click workloads" }).click();
  await expect(state).toContainText("group=workloads seam=workloads sub=jobs target=workloads/-/-#");

  await probe.getByRole("button", { name: "row click schedules" }).click();
  await expect(state).toContainText("group=workloads seam=workloads sub=schedules target=workloads/schedules/-#");

  await probe.getByRole("button", { name: "spy analysis" }).click();
  await expect(state).toContainText("group=workloads seam=workloads sub=analysis");

  await probe.getByRole("button", { name: "clear group" }).click();
  await expect(state).toContainText("group=none seam=none sub=none target=none");
});
