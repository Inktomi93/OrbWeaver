// @subject packages/client/src/features/app-shell/components/appearance-sizing-section.tsx
// The three OS preferences each offer System, On and Off, and a pick saves that mode on the appearance section.
import { OS_PREFERENCE_MODES } from "@orb/contracts/settings/appearance";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { SizingSectionStory } from "./_appearance-sizing-stories.tsx";

const STORY = "tests/client/features/app-shell/components/_appearance-sizing-stories/SizingSectionStory";
const PREFERENCES = [
  ["Reduce motion", "reducedMotion"],
  ["Reduce transparency", "reducedTransparency"],
  ["Increase contrast", "increasedContrast"],
] as const;

test("each OS preference offers three modes and saves the one picked", async ({ corpus, mount, page }) => {
  const settings = corpus.reads["settings.getUserSettings"][0]?.output;
  if (settings === undefined) {
    throw new Error("The committed corpus omitted the user settings read");
  }
  const saved: unknown[] = [];
  await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "settings.updateUserSettingsSection": (input) => {
      saved.push(input);
      return settings;
    },
  });
  await mount<typeof SizingSectionStory>(STORY, {});

  for (const [label, key] of PREFERENCES) {
    const group = page.getByRole("group", { name: label, exact: true });
    await expect(group.getByRole("button")).toHaveCount(OS_PREFERENCE_MODES.length);
    await group.getByRole("button", { name: "Off", exact: true }).click();
    await expect.poll(() => saved.at(-1)).toMatchObject({ section: "appearance", patch: { [key]: "off" } });
  }
});
