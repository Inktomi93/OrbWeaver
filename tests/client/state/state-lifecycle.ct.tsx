import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { expect, test } from "@playwright/test";
import type { MessageDraftStory, MessageSelectionStory, PresetSelectionStory, SteerRecoveryStory } from "./_state-lifecycle-stories.tsx";

test("edit drafts retain text and footprint across reader unmount, isolate rows and distinguish empty from cancelled", async ({ mount }) => {
  const ids = createSeededIds();
  const first = mintTypeId(ID_PREFIX.message, ids.next);
  const second = mintTypeId(ID_PREFIX.message, ids.next);
  const component = await mount<typeof MessageDraftStory>("tests/client/state/_state-lifecycle-stories/MessageDraftStory", { first, second });
  const firstRead = component.getByRole("status", { name: first, exact: true });
  const secondRead = component.getByRole("status", { name: second, exact: true });
  await expect(firstRead).toHaveText(JSON.stringify({ editing: false, text: "", inline: null, block: null }));
  await component.getByRole("button", { name: "Edit first", exact: true }).click();
  await component.getByRole("button", { name: "Edit second", exact: true }).click();
  await component.getByRole("button", { name: "Change first", exact: true }).click();
  const changed = JSON.stringify({ editing: true, text: "Changed", inline: 320, block: 160 });
  await expect(firstRead).toHaveText(changed);
  await component.getByRole("button", { name: "Toggle first observer", exact: true }).click();
  await expect(firstRead).toHaveCount(0);
  await component.getByRole("button", { name: "Toggle first observer", exact: true }).click();
  await expect(firstRead).toHaveText(changed);
  await component.getByRole("button", { name: "Empty first", exact: true }).click();
  await expect(firstRead).toHaveText(JSON.stringify({ editing: true, text: "", inline: 320, block: 160 }));
  await component.getByRole("button", { name: "Cancel first", exact: true }).click();
  await expect(firstRead).toHaveText(JSON.stringify({ editing: false, text: "", inline: null, block: null }));
  await expect(secondRead).toHaveText(JSON.stringify({ editing: true, text: "Other", inline: null, block: null }));
  await component.getByRole("button", { name: "Edit first", exact: true }).click();
  await expect(firstRead).toHaveText(JSON.stringify({ editing: true, text: "Original", inline: 320, block: 160 }));
  await component.getByRole("button", { name: "Change first", exact: true }).click();
  await component.getByRole("button", { name: "Edit first", exact: true }).click();
  await expect(firstRead).toHaveText(JSON.stringify({ editing: true, text: "Original", inline: 320, block: 160 }));
});

test("message selection toggles independently and enter or exit drops stale ids", async ({ mount }) => {
  const ids = createSeededIds();
  const component = await mount<typeof MessageSelectionStory>("tests/client/state/_state-lifecycle-stories/MessageSelectionStory", {
    first: mintTypeId(ID_PREFIX.message, ids.next),
    second: mintTypeId(ID_PREFIX.message, ids.next),
  });
  const state = component.getByRole("status");
  const empty = JSON.stringify({ active: true, count: 0, firstSelected: false, secondSelected: false });
  await component.getByRole("button", { name: "Enter selection", exact: true }).click();
  await expect(state).toHaveText(empty);
  await component.getByRole("button", { name: "Toggle first", exact: true }).click();
  await component.getByRole("button", { name: "Toggle second", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify({ active: true, count: 2, firstSelected: true, secondSelected: true }));
  await component.getByRole("button", { name: "Toggle first", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify({ active: true, count: 1, firstSelected: false, secondSelected: true }));
  await component.getByRole("button", { name: "Enter selection", exact: true }).click();
  await expect(state).toHaveText(empty);
  await component.getByRole("button", { name: "Toggle first", exact: true }).click();
  await component.getByRole("button", { name: "Exit selection", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify({ active: false, count: 0, firstSelected: false, secondSelected: false }));
});

test("preset selection clears stale sections and releases the list overlay through real selection and back actions", async ({ mount }) => {
  const ids = createSeededIds();
  const first = mintTypeId(ID_PREFIX.preset, ids.next);
  const second = mintTypeId(ID_PREFIX.preset, ids.next);
  const component = await mount<typeof PresetSelectionStory>("tests/client/state/_state-lifecycle-stories/PresetSelectionStory", { first, second });
  const state = component.getByRole("status");
  await component.getByRole("button", { name: "Select first preset", exact: true }).click();
  await component.getByRole("button", { name: "Select section", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify({ selected: first, section: "main", overlay: null }));
  await component.getByRole("button", { name: "Open list overlay", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify({ selected: first, section: "main", overlay: "list" }));
  await component.getByRole("button", { name: "Select second from list", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify({ selected: second, section: null, overlay: null }));
  await component.getByRole("button", { name: "Select section", exact: true }).click();
  await component.getByRole("button", { name: "Open list overlay", exact: true }).click();
  await component.getByRole("button", { name: "Back through section", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify({ selected: null, section: null, overlay: null }));
});

test("steer recovery trims, moves repeated text to the front and refuses blank input", async ({ mount }) => {
  const component = await mount<typeof SteerRecoveryStory>("tests/client/state/_state-lifecycle-stories/SteerRecoveryStory", {});
  const state = component.getByRole("status");
  await expect(state).toHaveText("[]");
  await component.getByRole("button", { name: "Fire first", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify(["First steer"]));
  await component.getByRole("button", { name: "Fire second", exact: true }).click();
  await component.getByRole("button", { name: "Fire first", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify(["First steer", "Second steer"]));
  await component.getByRole("button", { name: "Fire blank", exact: true }).click();
  await expect(state).toHaveText(JSON.stringify(["First steer", "Second steer"]));
});
