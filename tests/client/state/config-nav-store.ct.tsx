// config-nav store CT — the Settings section's GROUP NAVIGATION (config-revamp-design.md §3.2/§6.2, #866
// S1). A CT, not a unit test, because every read surface is a reactive hook (useSyncExternalStore needs a
// real browser — the config-selection-store posture).
//
// What it pins: `openConfigTo` is the ONE deep-link intent for every kind of group (a settings group, a
// section inside it, a leaf, a COLLECTION) and it arrives with the rail switched, the group EXPANDED and any
// stale member selection cleared; a LIST band click names the FIRST section current immediately (#549 — the
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
