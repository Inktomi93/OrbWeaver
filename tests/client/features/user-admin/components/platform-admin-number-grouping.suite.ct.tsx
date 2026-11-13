import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { ADMIN_MEMORY_MIN_MATCH_NAME } from "#client/features/user-admin/lib/user-admin-names.ts";
import type { AdminActionGroupsStory, AdminMemoryTuningStory } from "./_admin-action-groups-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-action-groups-stories/AdminActionGroupsStory";
const MEMORY_STORY = "tests/client/features/user-admin/components/_admin-action-groups-stories/AdminMemoryTuningStory";
const DEADLINE_LABEL = "Prompt-transform deadline (ms)";
const CAP_LABEL = "Databank upload cap (bytes)";
// A separator-free reading of a number over 999: the digits a person types, never a locale's grouping.
const RAW_DIGITS = /^\d{4,}$/u;

test("an editable count reads as the digits typed, and its bounds and default agree with the input", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const appearance = appearanceSettingsSchema.parse({});
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.getAppSettingsWithOverrides"]));
  await mount<typeof AdminActionGroupsStory>(STORY, { width: 960, appearance });
  const field = page.getByRole("textbox", { name: CAP_LABEL, exact: true });
  await expect(field).toHaveValue(RAW_DIGITS);
  const value = await field.inputValue();
  const description = (
    await field.evaluate((input) =>
      [...(input.getAttribute("aria-describedby") ?? "").split(" ")].map((id) => document.getElementById(id)?.textContent ?? "").join(" "),
    )
  ).trim();
  expect(description).toContain(`deployment default: ${value}.`);
  expect(description).toMatch(/Minimum \d{6,}(?!,)/u);
  expect(description).not.toMatch(/\d,\d{3}/u);
});

// A grouped number typed or pasted into a field reads as the whole number under the field's locale; the field shows it
// ungrouped. Base UI reads no group separator once grouping is off, so a typed "8,443" used to parse as 8.
const LOCALES = [
  {
    locale: "en-US",
    typed: [
      ["8,443", "8443"],
      ["2,592,000", "2592000"],
    ],
  },
  {
    locale: "de-DE",
    typed: [
      ["8.443", "8443"],
      ["2.592.000", "2592000"],
    ],
  },
] as const;

for (const { locale, typed } of LOCALES) {
  test.describe(`typing grouped digits in ${locale}`, () => {
    test.use({ locale });

    test("keeps the whole number, typed or pasted", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({});
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.getAppSettingsWithOverrides"]));
      await mount<typeof AdminActionGroupsStory>(STORY, { width: 960, appearance });
      const field = page.getByRole("textbox", { name: DEADLINE_LABEL, exact: true });
      for (const [text, digits] of typed) {
        await field.fill(text);
        await field.press("Tab");
        await expect(field).toHaveValue(digits);
      }
      await field.fill("");
      await field.focus();
      await field.evaluate((input, grouped) => {
        const data = new DataTransfer();
        data.setData("text/plain", grouped);
        input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }, typed[0][0]);
      await field.press("Tab");
      await expect(field).toHaveValue(typed[0][1]);
    });

    test("leaves a decimal alone", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({});
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.getAppSettingsWithOverrides"]));
      await mount<typeof AdminMemoryTuningStory>(MEMORY_STORY, { width: 960, appearance });
      const field = page.getByRole("textbox", { name: ADMIN_MEMORY_MIN_MATCH_NAME, exact: true });
      await field.fill(locale === "de-DE" ? "0,5" : "0.5");
      await field.press("Tab");
      await expect(field).toHaveValue(locale === "de-DE" ? "0,5" : "0.5");
    });
  });
}

// Real keystrokes, not `fill`: each keystroke is its own change, so a group stripped early must not stop the next one.
const KEYED = [
  {
    locale: "en-US",
    keyed: [
      ["2,592,000", "2592000"],
      ["1,234,567.5", "1234567.5"],
    ],
    pasted: [["  8,443 ", "8443"]],
  },
  { locale: "en-IN", keyed: [["1,00,000", "100000"]], pasted: [["1,00,000", "100000"]] },
  { locale: "de-DE", keyed: [["2.592.000", "2592000"]], pasted: [[" 8.443 ", "8443"]] },
] as const;

for (const { locale, keyed, pasted } of KEYED) {
  test.describe(`keystrokes and pastes in ${locale}`, () => {
    test.use({ locale });

    test("read the whole grouped number", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({});
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.getAppSettingsWithOverrides"]));
      await mount<typeof AdminActionGroupsStory>(STORY, { width: 960, appearance });
      const field = page.getByRole("textbox", { name: DEADLINE_LABEL, exact: true });
      for (const [text, digits] of keyed) {
        await field.fill("");
        await field.pressSequentially(text);
        await field.press("Tab");
        await expect(field).toHaveValue(digits);
      }
      for (const [text, digits] of pasted) {
        await field.fill("");
        await field.focus();
        await field.evaluate((input, clipboard) => {
          const data = new DataTransfer();
          data.setData("text/plain", clipboard);
          input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
        }, text);
        await field.press("Tab");
        await expect(field).toHaveValue(digits);
      }
    });
  });
}
