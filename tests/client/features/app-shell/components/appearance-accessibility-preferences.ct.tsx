// @subject packages/client/src/features/app-shell/components/appearance-accessibility-section.tsx
// The two OS preferences that offer modes (reduced motion and increased contrast) each offer System, On and Off, and a pick saves that mode on the appearance section.
// The corpus root's settings verbs answer the section, so the merge that stores a pick is the server's own.
import { OS_PREFERENCE_MODES } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { APPEARANCE_ACCESSIBILITY_SUBCATEGORY } from "#client/features/app-shell/lib/appearance-accessibility-model.ts";
import { OS_PREFERENCE_ITEMS } from "#client/features/app-shell/lib/appearance-select-items.ts";
import type { AccessibilitySectionStory } from "./_appearance-sizing-stories.tsx";

const STORY = "tests/client/features/app-shell/components/_appearance-sizing-stories/AccessibilitySectionStory";
// The model's leaves that offer the OS preference modes: their labels name the groups, their keys are what a pick writes. The device's reduced
// transparency is a switch, not a mode, so it is not one of them.
const PREFERENCES = (APPEARANCE_ACCESSIBILITY_SUBCATEGORY.settings ?? []).flatMap((leaf) =>
  leaf.options === OS_PREFERENCE_ITEMS && leaf.key !== undefined ? [leaf] : [],
);
const OFF = OS_PREFERENCE_ITEMS.find((item) => item.value === "off");

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("each OS preference offers three modes and saves the one picked", async ({ mount, page }) => {
  if (OFF === undefined) {
    throw new Error("The OS preference items name no off mode");
  }
  expect(PREFERENCES).toHaveLength(2);
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "settings.updateUserSettingsSection"]));
  await mount<typeof AccessibilitySectionStory>(STORY, {});

  for (const { label, key } of PREFERENCES) {
    const group = page.getByRole("group", { name: label, exact: true });
    await expect(group.getByRole("button")).toHaveCount(OS_PREFERENCE_MODES.length);
    await group.getByRole("button", { name: OFF.label, exact: true }).click();
    await expect(group.getByRole("button", { pressed: true })).toHaveAccessibleName(OFF.label);
    await expect
      .poll(async () => Object.entries((await caller.settings.getUserSettings()).config.appearance).find(([name]) => name === key)?.[1])
      .toBe(OFF.value);
  }
});
