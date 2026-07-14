// CT: the real Regex settings pane (regex-settings-surface.tsx — the owner-global D53 script library).
// Drives the production autosave path: `getUserSettings` seeds the list from `config.regex.scripts`; adding
// a script opens the shared RegexEditorDialog and, after the createAutosaveEntityForm debounce, fires
// `updateUserSettingsSection("regex")` with the grown `scripts` array. Assertions anchor to the real
// accessible names + the WIRE input (busDriven — the stubbed response doesn't refetch, so the check is the
// CALL, exactly like the Tags/System pane CTs).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { RegexSettingsStory } from "../_ct-stories";

const SCRIPT = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "strip ooc",
  findRegex: "\\(ooc\\)",
  replaceString: "",
  placement: [],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};

const SETTINGS_VIEW = {
  config: { ...DEFAULT_USER_SETTINGS, regex: { scripts: [SCRIPT] } },
};

const UPDATE_PROC = "settings.updateUserSettingsSection";

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => SETTINGS_VIEW,
  });
}

test("lists the owner-global scripts seeded from the regex section", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  await expect(page.getByText("strip ooc")).toBeVisible();
});

test("adding a script opens the shared editor and autosaves the regex section", async ({
  mount,
  page,
}) => {
  const trpc = await stub(page);
  await mount(<RegexSettingsStory />);
  await page.getByRole("button", { name: "Add script" }).click();
  // The shared RegexEditorDialog opens on the freshly-pushed row.
  await expect(page.getByRole("heading", { name: "Edit regex script" })).toBeVisible();
  // Autosave debounces, then fires the section patch on the `regex` namespace (busDriven, no refetch).
  await expect
    .poll(() => trpc.lastInput(UPDATE_PROC), { intervals: [100, 250, 500, 750] })
    .toMatchObject({ section: "regex" });
});
