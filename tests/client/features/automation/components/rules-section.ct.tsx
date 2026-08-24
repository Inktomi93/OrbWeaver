// CT: the B2 Rules SECTION (rules-section.tsx + rule-preset-picker.tsx + rule-fire-log.tsx) — the host-only
// automation surface. Drives the REAL tRPC path over the stubbed network (routeTrpc): the rule list renders,
// the enable toggle / Test / Run-now fire the right procs with the right inputs, the preset picker mints via
// createRuleFromPreset, a book-requiring preset BLOCKS the mint until its lorebook id is filled, and the
// per-rule fire log shows a fire. Fixtures are plain wire literals (routeTrpc responders are `unknown`; the
// wire SHAPE is pinned by the router + domain tests, not re-typed here).

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { RulesSectionStory } from "../_ct-stories.tsx";

const CHAT = castId<ChatId>("chat_ct_rules_0001");

// One host-authored rule — the auto-illustrate row from the §4 catalogue, born disabled.
const RULE = {
  id: "automationrule_ct1",
  chatId: CHAT,
  name: "Illustrate the scene",
  description: null,
  enabled: false,
  position: 1,
  trigger: { bus: "chat", type: "turnCompleted" },
  predicateCel: "int(chat.messageCount) % 10 == 0",
  actions: [{ type: "generate_image", mode: "scenario", n: 1, useAvatarReference: false, reuse: "prefer", quiet: false }],
  matchAutomationEvents: false,
  cooldownSeconds: 0,
  maxFiresPerHour: 30,
  consecutiveErrors: 0,
  lastError: null,
  lastFiredAt: null,
  createdAt: 1,
  updatedAt: 1,
};

// A single-rule, no-book preset (pacing nudge) — every knob has a usable default, so it mints on first click.
const PACING_PRESET = {
  id: "pacingNudge",
  title: "Periodic pacing nudge",
  summary: "Every few beats, quietly ask the narrator to shift the pacing.",
  ruleCount: 1,
  confirmFirst: false,
  knobs: [
    { key: "everyN", kind: "number", label: "Every N beats", default: 8, min: 2, max: 200 },
    { key: "steer", kind: "text", label: "Nudge", default: "Shift the pacing.", maxLength: 600 },
  ],
};

// The book-requiring preset (auto-add lore): its `bookId` text knob has an EMPTY default, so the mint must
// block until a host fills it (the A3-verify "pick a book" refusal, surfaced client-side).
const LORE_PRESET = {
  id: "autoAddLore",
  title: "Auto-add lore entries",
  summary: "Every so often, offer to write what has happened into one of this room's lorebooks.",
  ruleCount: 1,
  confirmFirst: true,
  knobs: [
    { key: "bookId", kind: "text", label: "Lorebook id", help: "It must already be attached to this chat.", default: "", maxLength: 64 },
    { key: "everyN", kind: "number", label: "Every N messages", default: 10, min: 2, max: 200 },
  ],
};

interface StubOverrides {
  readonly rules?: readonly unknown[];
  readonly fires?: readonly unknown[];
  readonly presets?: readonly unknown[];
}

function stub(page: Page, overrides: StubOverrides = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "automation.listRules": () => overrides.rules ?? [RULE],
    "automation.listFires": () => overrides.fires ?? [],
    "automation.listRulePresets": () => overrides.presets ?? [PACING_PRESET],
    "automation.setRuleEnabled": () => ({}),
    "automation.testRule": () => ({ predicate: true, arms: [{ type: "generate_image", renderedPreview: "a moody scenario shot" }] }),
    "automation.runRuleNow": () => ({ outcome: "fired" }),
    "automation.createRuleFromPreset": () => [RULE],
    "automation.deleteRule": () => undefined,
  });
}

test("renders the chat's rules and toggles one — setRuleEnabled fires with the ruleId + enabled", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await expect(page.getByText("Illustrate the scene")).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Enable Illustrate the scene" });
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect.poll(() => trpc.count("automation.setRuleEnabled")).toBe(1);
  expect(trpc.lastInput("automation.setRuleEnabled")).toMatchObject({ ruleId: "automationrule_ct1", enabled: true });
});

test("Test runs the dry-run — testRule fires and the predicate verdict + arm preview render", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Test" }).click();

  await expect.poll(() => trpc.count("automation.testRule")).toBe(1);
  expect(trpc.lastInput("automation.testRule")).toMatchObject({ ruleId: "automationrule_ct1" });
  await expect(page.getByText("Condition would match.")).toBeVisible();
  await expect(page.getByText("a moody scenario shot")).toBeVisible();
});

test("Run now dispatches the rule — runRuleNow fires with the ruleId", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Run now" }).click();

  await expect.poll(() => trpc.count("automation.runRuleNow")).toBe(1);
  expect(trpc.lastInput("automation.runRuleNow")).toMatchObject({ ruleId: "automationrule_ct1" });
});

test("the picker mints a rule from a preset — createRuleFromPreset fires with the id + resolved knobs", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [], presets: [PACING_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add rule…", exact: true }).click();
  await page.getByText("Periodic pacing nudge").click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();

  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(1);
  expect(trpc.lastInput("automation.createRuleFromPreset")).toMatchObject({
    chatId: CHAT,
    presetId: "pacingNudge",
    knobs: { everyN: 8, steer: "Shift the pacing." },
  });
});

test("a book-requiring preset blocks the mint until its lorebook id is filled", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [], presets: [LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add rule…", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();

  // The empty book knob is Required — the Add button is disabled and nothing is minted.
  const add = page.getByRole("button", { name: "Add rule", exact: true });
  await expect(add).toBeDisabled();
  await expect(page.getByText("Required.")).toBeVisible();

  // Filling the lorebook id unblocks the mint, which then carries the typed book id.
  await page.getByRole("textbox", { name: "Lorebook id" }).fill("worldbook_ct_attached");
  await expect(add).toBeEnabled();
  await add.click();
  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(1);
  expect(trpc.lastInput("automation.createRuleFromPreset")).toMatchObject({ presetId: "autoAddLore", knobs: { bookId: "worldbook_ct_attached" } });
});

test("the fire log shows a rule's recent fire", async ({ mount, page }) => {
  await stub(page, {
    fires: [
      {
        id: "automationfire_ct1",
        ruleId: "automationrule_ct1",
        chatId: CHAT,
        triggerType: "turnCompleted",
        outcome: "fired",
        detail: null,
        automationDepth: 0,
        firedAt: Date.now() - 1000,
      },
    ],
  });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Recent activity" }).click();
  await expect(page.getByText("Fired")).toBeVisible();
});
