// The saved-cast EDITOR (the library's content half) — the side-eye 2026-08-29 pins (#812/#813): the
// MEMBERS/RULES groupings are real headings (the editor had exactly ONE heading, so heading navigation
// gave an SR user one stop in a two-section surface), a member's talkativeness is spelled the way the
// ROOM's own Members tab spells it (`0.5` here vs "talks at level 50 of 100" there was one concept with
// two scales and two vocabularies), each stored rule shows the resolved KNOBS that distinguish two casts
// carrying the same preset, and the editor's Start door reports what it applied + names the room.
//
// The write semantics (full-replace rename echoing members AND rules) are the server tier's —
// tests/server/domain/roster-preset — a CT fixture cannot honestly reach them.

import type { RulePresetView } from "@orb/contracts/automation";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CastMemberEditorStory } from "../_ct-stories.tsx";

/** `rosterPreset.get`'s view, narrowed to what the editor reads. The stored rule carries a NON-DEFAULT
 *  `everyN` (the catalogue default is 8) — the datum every surface used to collapse to "2 rules". */
const CAST_VIEW = {
  id: "roster_preset_ct_a",
  name: "Adventuring Cast",
  description: "",
  anchorPersonaId: null,
  groupConfig: null,
  members: [
    { characterId: "character_ct_1", position: 0, talkativeness: 0.5, disabled: false, name: "Ash", avatarHash: null },
    { characterId: "character_ct_2", position: 1, talkativeness: null, disabled: true, name: "Brook", avatarHash: null },
  ],
  rules: [{ rulePresetId: "pacingNudge", position: 0, knobs: { everyN: 12, steer: "Take stock of the pacing." } }],
  updatedAt: 1,
};

const PACING_PRESET: RulePresetView = {
  id: "pacingNudge",
  scope: "chat",
  title: "Periodic pacing nudge",
  summary: "Every few beats, quietly ask the narrator to shift the pacing.",
  ruleCount: 1,
  confirmFirst: false,
  spends: true,
  knobs: [
    { key: "everyN", kind: "number", label: "Every N beats", help: "Counted over the chat's messages.", default: 8, min: 2, max: 40 },
    { key: "steer", kind: "text", label: "Nudge", default: "Take stock of the pacing.", maxLength: 400 },
  ],
};

test("the editor's groupings are real headings, its rules show their resolved knobs, and talkativeness is the room's own spelling", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.get": CAST_VIEW, "automation.listRulePresets": [PACING_PRESET] });

  await mount(<CastMemberEditorStory />);

  // Heading navigation: the cast name (h2) plus one heading per grouping.
  await expect(page.getByRole("heading", { level: 2, name: "Adventuring Cast" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Members" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Rules" })).toBeVisible();

  // ONE talkativeness spelling with the room's Members tab: the 0–100 dial, the word "Talks", no percent.
  await expect(page.getByText("Talks 50", { exact: true })).toBeVisible();
  await expect(page.getByText("0.5", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Muted", { exact: true })).toBeVisible();

  // The knob gloss — the stored bag, through the catalogue's OWN knob labels (no per-preset copy).
  await expect(page.getByText("Periodic pacing nudge", { exact: true })).toBeVisible();
  await expect(page.getByText(/Every N beats: 12/)).toBeVisible();
});

test("the editor's Start door reports what it applied and names the room after the cast", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "rosterPreset.get": CAST_VIEW,
    "automation.listRulePresets": [PACING_PRESET],
    "chat.startChat": { chat: { id: "chat_started_ct", viewerIsHost: true, participants: [] } },
    "rosterPreset.applyToChat": {
      added: ["character_ct_1", "character_ct_2"],
      alreadyPresent: [],
      skipped: [],
      configApplied: false,
      rulesMinted: ["pacingNudge"],
      rulesAlreadyPresent: [],
      rulesSkipped: [{ rulePresetId: "loreAutoAdd", reason: "this chat has no lorebook attached" }],
    },
  });

  await mount(<CastMemberEditorStory />);
  await page.getByRole("button", { name: "Start chat", exact: true }).click();

  const notice = page.getByTestId("cbcf-notice");
  await expect(notice).toContainText("Adventuring Cast:");
  await expect(notice).toContainText("1 rule on");
  await expect(notice).toContainText("this chat has no lorebook attached");
  await expect.poll(() => trpc.lastInput("chat.startChat")).toMatchObject({ title: "Adventuring Cast" });
});
