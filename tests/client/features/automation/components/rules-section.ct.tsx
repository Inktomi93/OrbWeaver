// CT: the B2 Rules SECTION (rules-section.tsx + rule-preset-picker.tsx + rule-fire-log.tsx) — the host-only
// automation surface. Drives the REAL tRPC path over the stubbed network (routeTrpc): the rule list renders,
// the enable toggle / Test / Run-now fire the right procs with the right inputs, the preset picker mints via
// createRuleFromPreset, a book-requiring rule preset blocks the mint until its lorebook id is filled, and the
// per-rule fire log shows a fire. Fixtures are plain wire literals (routeTrpc responders are `unknown`; the
// wire SHAPE is pinned by the router + domain tests, not re-typed here).
//
// The SIDE-EYE #621 pins are the second half of this file: they assert through what a HOST sees — the row
// says what the rule does and when it last ran, the spending action is marked and demoted, the irreversible
// one needs a confirm, the fire log renders the answer the toast promises, and the popover does not clip its
// own copy. Every one of them was RED against the pre-fix source (measured 2026-08-24, cb-rules-section).
// The mount is 384px — the narrowest REAL host (the docked CONTEXT pane), never a roomy story width.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { hitExtent, touchFloorPx } from "../../../../support/ct/touch-floor.ts";
import { RulesInThisChatTabStory, RulesSectionStory } from "../_ct-stories.tsx";

const CHAT = castId<ChatId>("chat_ct_rules_0001");

// A FIXED epoch, never `Date.now()` (test-determinism): the row and the log both render relative time.
const A_PAST_INSTANT = 1_760_000_000_000;
const RUN_NOW_ITEM = /Run now/u;
const LAST_RAN_LINE = /^Last ran /u;

// One rule minted from the §4 catalogue — born disabled, carrying the catalogue entry's own summary as its
// `description` (what `createRuleFromPreset` stores) and a SPEND arm (`generate_image`).
const RULE = {
  id: "automationrule_ct1",
  chatId: CHAT,
  name: "Illustrate the scene",
  description: "Generate a picture of the current scene on a cadence, and post it into the room.",
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

// A rule whose only arm is FREE (`set_variable`) — the contrast that proves the spend marker is driven by
// SPEND_ARM_TYPES rather than pasted onto every Run-now.
const FREE_RULE = {
  ...RULE,
  id: "automationrule_ct2",
  name: "Count the beats",
  description: null,
  actions: [{ type: "set_variable", scope: "chat", key: "beats", op: "inc", value: "1" }],
  lastFiredAt: A_PAST_INSTANT,
};

// A single-rule, no-book rule preset (pacing nudge) — every knob has a usable default, so it mints on first
// click.
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

// The book-requiring rule preset (auto-add lore): its `bookId` text knob has an EMPTY default, so the mint
// must block until a host fills it (the A3-verify "pick a book" refusal, surfaced client-side).
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

/** Open one rule's overflow menu — where Run-now (it spends) and Delete (irreversible) live. */
async function openRuleMenu(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${name}` }).click();
}

test("renders the chat's rules and toggles one — setRuleEnabled fires with the ruleId + enabled", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await expect(page.getByText("Illustrate the scene", { exact: true })).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Enable Illustrate the scene" });
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect.poll(() => trpc.count("automation.setRuleEnabled")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.setRuleEnabled")).toMatchObject({ ruleId: "automationrule_ct1", enabled: true });
});

test("Test runs the dry-run — testRule fires and the predicate verdict + arm preview render", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Test Illustrate the scene" }).click();

  await expect.poll(() => trpc.count("automation.testRule")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.testRule")).toMatchObject({ ruleId: "automationrule_ct1" });
  await expect(page.getByText("Condition would match.")).toBeVisible();
  await expect(page.getByText("a moody scenario shot")).toBeVisible();
});

test("Run now dispatches the rule — runRuleNow fires with the ruleId", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await openRuleMenu(page, "Illustrate the scene");
  await page.getByRole("menuitem", { name: RUN_NOW_ITEM }).click();

  await expect.poll(() => trpc.count("automation.runRuleNow")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.runRuleNow")).toMatchObject({ ruleId: "automationrule_ct1" });
});

test("the picker mints a rule from a rule preset — createRuleFromPreset fires with the id + resolved knobs", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [], presets: [PACING_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Periodic pacing nudge").click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();

  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(1);
  await expect
    .poll(() => trpc.lastInput("automation.createRuleFromPreset"))
    .toMatchObject({
      chatId: CHAT,
      presetId: "pacingNudge",
      knobs: { everyN: 8, steer: "Shift the pacing." },
    });
});

test("a book-requiring rule preset blocks the mint until its lorebook id is filled", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [], presets: [LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();

  // P1-4: the form does NOT open accusing — no red field, no "Required." before the host has typed.
  await expect(page.getByText("Required.")).toHaveCount(0);

  // Pressing Add says what is missing and mints NOTHING (a dead disabled button said neither).
  const add = page.getByRole("button", { name: "Add rule", exact: true });
  await add.click();
  await expect(page.getByText('Fill in "Lorebook id" to add this rule.')).toBeVisible();
  await expect(page.getByText("Required.")).toBeVisible();
  // ONESHOT-OK: the two barriers above are the RENDERED result of this very click, so the press is
  // provably processed; the recorder only grows on a request that would already have been sent.
  expect(trpc.count("automation.createRuleFromPreset")).toBe(0);

  // Filling the lorebook id unblocks the mint, which then carries the typed book id.
  await page.getByRole("textbox", { name: "Lorebook id" }).fill("worldbook_ct_attached");
  await expect(page.getByText('Fill in "Lorebook id" to add this rule.')).toHaveCount(0);
  await add.click();
  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(1);
  await expect
    .poll(() => trpc.lastInput("automation.createRuleFromPreset"))
    .toMatchObject({ presetId: "autoAddLore", knobs: { bookId: "worldbook_ct_attached" } });
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
        firedAt: A_PAST_INSTANT,
      },
    ],
  });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Recent activity for Illustrate the scene" }).click();
  await expect(page.getByText("Fired")).toBeVisible();
});

// ── SIDE-EYE #621 ─────────────────────────────────────────────────────────────────────────────────────

test("#621 P1-7: the row says what the rule DOES and when it last ran — never a wire discriminator", async ({ mount, page }) => {
  await stub(page, { rules: [RULE, FREE_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  // The minted rule carries the catalogue's own sentence; the hand-authored one gets WHEN + WHAT.
  await expect(page.getByText("Generate a picture of the current scene on a cadence, and post it into the room.")).toBeVisible();
  await expect(page.getByText("Runs after each reply — set a variable.")).toBeVisible();
  // `lastFiredAt` was on the view and rendered nowhere: two rules could be byte-identical rows.
  await expect(page.getByText("Hasn't run yet.")).toBeVisible();
  await expect(page.getByText(LAST_RAN_LINE)).toBeVisible();
  // The raw camelCase discriminator + arm COUNT subtitle is gone.
  await expect(page.getByText("turnCompleted", { exact: false })).toHaveCount(0);
  await expect(page.getByText("1 action", { exact: false })).toHaveCount(0);
});

test("#621 P1-7: the rule NAME owns the row — it reads at a heading step, not the datum-label step", async ({ mount, page }) => {
  await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  const name = page.getByText("Illustrate the scene", { exact: true });
  await expect(name).toBeVisible();
  // COMPUTED against the tokens resolved in THIS document — never a px literal (a token retune must move
  // the assertion with it, not break it). `promoted` is the --text-title step; `label` was the old voice.
  const [title, label] = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const root = getComputedStyle(document.documentElement);
    const out = [px(root.getPropertyValue("--text-title").trim()), px(root.getPropertyValue("--text-label").trim())];
    probe.remove();
    return out;
  });
  await expect.poll(() => name.evaluate((el) => getComputedStyle(el).fontSize), { intervals: [20, 50, 100, 200] }).toBe(title);
  expect(title).not.toBe(label);
});

test("#621 P1-1/P1-2: the SPEND action is marked and demoted; the free one is not marked", async ({ mount, page }) => {
  await stub(page, { rules: [RULE, FREE_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  // The spending rule's Run-now names its cost, in the overflow — not a ghost button 12px from Delete.
  await openRuleMenu(page, "Illustrate the scene");
  await expect(page.getByRole("menuitem", { name: "Run now — spends a model call" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The free rule's Run-now says nothing about spending (SPEND_ARM_TYPES drives it, not the button).
  await openRuleMenu(page, "Count the beats");
  await expect(page.getByRole("menuitem", { name: "Run now", exact: true })).toBeVisible();
});

test("#621 P1-1/P1-2: Test and the overflow trigger no longer compute the same colour", async ({ mount, page }) => {
  await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  // Measured live pre-fix: Test / Run now / Delete were all `intent="ghost" size="sm"` and computed the
  // IDENTICAL `oklch(0.74 0.008 65)`. The free primary action now carries the secondary skin (foreground
  // ink + an edge); the overflow trigger stays ghost.
  const testAction = page.getByRole("button", { name: "Test Illustrate the scene" });
  const more = page.getByRole("button", { name: "More actions for Illustrate the scene" });
  const colourOf = (locator: typeof more): Promise<string> => locator.evaluate((el) => getComputedStyle(el).color);
  await expect.poll(() => colourOf(testAction), { intervals: [20, 50, 100, 200] }).not.toBe(await colourOf(more));
  // …and Test carries a painted edge, which is the non-colour half of the distinction.
  await expect.poll(() => testAction.evaluate((el) => getComputedStyle(el).borderTopWidth)).not.toBe("0px");
});

test("#621 P1-1/P1-2: Delete needs a confirm — one click no longer destroys the rule", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await openRuleMenu(page, "Illustrate the scene");
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Nothing has been deleted yet — the confirm names the rule and can be walked away from.
  await expect(page.getByRole("alertdialog")).toContainText('Delete "Illustrate the scene"?');
  // ONESHOT-OK: the settled alertdialog above IS this click's rendered result, so the press is provably
  // processed — a delete request, had the item fired one, would already be recorded.
  expect(trpc.count("automation.deleteRule")).toBe(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  // ONESHOT-OK: the dialog is gone — the cancel is settled, and cancelling issues no request.
  expect(trpc.count("automation.deleteRule")).toBe(0);

  // Confirming does delete it, with the right id.
  await openRuleMenu(page, "Illustrate the scene");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete rule" }).click();
  await expect.poll(() => trpc.count("automation.deleteRule")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.deleteRule")).toMatchObject({ ruleId: "automationrule_ct1" });
});

test("#621 P1-5: the fire log renders `detail` — the answer the Run-now toast points at", async ({ mount, page }) => {
  await stub(page, {
    fires: [
      {
        id: "automationfire_ct_err",
        ruleId: "automationrule_ct1",
        chatId: CHAT,
        triggerType: "turnCompleted",
        outcome: "action_error",
        detail: { armIndex: 0, armType: "generate_image", error: "no image connection is configured" },
        automationDepth: 0,
        firedAt: A_PAST_INSTANT,
      },
      {
        id: "automationfire_ct_cap",
        ruleId: "automationrule_ct1",
        chatId: CHAT,
        triggerType: "turnCompleted",
        outcome: "budget_refused",
        detail: { limit: "rule_hourly" },
        automationDepth: 0,
        firedAt: A_PAST_INSTANT,
      },
    ],
  });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Recent activity for Illustrate the scene" }).click();
  await expect(page.getByText("Couldn't generate an image (step 1): no image connection is configured")).toBeVisible();
  // "Rate-capped" without the number is a label, not an answer.
  await expect(page.getByText("It had already run 30 times this hour — its own cap.")).toBeVisible();
  // The middle column speaks English, not the wire discriminator.
  await expect(page.getByText("after each reply").first()).toBeVisible();
  await expect(page.getByText("turnCompleted", { exact: false })).toHaveCount(0);
});

test("#621 ARIA: the Test verdict is announced and carries its meaning as a WORD", async ({ mount, page }) => {
  await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Test Illustrate the scene" }).click();
  const status = page.getByRole("status", { name: "Test result for Illustrate the scene" });
  await expect(status).toBeVisible();
  // The badge said "Test" and carried its verdict in intent COLOUR alone.
  await expect(status).toContainText("Would match");
});

test("#621 P1-3 re-derivation: the rule catalogue's summaries are not clipped by the popover", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [PACING_PRESET, LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  const popup = page.getByRole("dialog");
  await expect(popup).toBeVisible();
  await expect(popup.getByText("Every few beats, quietly ask the narrator to shift the pacing.")).toBeVisible();

  // The whole summary is INSIDE the popup — the measured defect was a row whose scrollWidth ran 184px past
  // the popover with `text-overflow: clip`, so nothing even signalled the truncation.
  await expect
    .poll(
      () =>
        popup.evaluate((el) => {
          const rows = [...el.querySelectorAll("button")];
          return rows.map((row) => row.scrollWidth - row.clientWidth).reduce((max, delta) => Math.max(max, delta), 0);
        }),
      { intervals: [20, 50, 100, 200] },
    )
    .toBeLessThanOrEqual(1);
});

// ── #616: the SECTION graft (the retired "Rules" tab's replacement) ───────────────────────────────────

test("#616: the host's 'This chat' tab renders the grafted Rules section in the host-controls band", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
    // The Macro-picks section reads TWO procs; stubbing only the first leaves its boundary in the error
    // arm (which is what the chat tab's own CT does today — reported, not fixed here).
    "chat.getVariablePicks": () => ({ variables: [], values: {} }),
    "chat.getChat": () => ({ id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] }),
    "databank.listActiveForChat": () => [],
    "automation.listRules": () => [RULE],
    "automation.listFires": () => [],
    "automation.listRulePresets": () => [PACING_PRESET],
  });

  const component = await mount(<RulesInThisChatTabStory chatId={CHAT} />);

  // A real h3 in the pane's own kicker grammar — the host spells the Section, the contributor only names it.
  await expect(component.getByRole("heading", { name: "Rules", exact: true, level: 3 })).toBeVisible();
  const band = component.locator("section").filter({ hasText: "Host controls" }).first();
  await expect(band.getByRole("heading", { name: "Rules", exact: true, level: 3 })).toBeVisible();
  // …and the section's real body is inside it.
  await expect(component.getByText("Illustrate the scene", { exact: true })).toBeVisible();
  // The rendered receipt of the #616 graft (reports/ is ephemera, never a committed artifact).
  await component.screenshot({ path: "reports/snaps/cb-rules-in-this-chat-tab.png" });
});

test("#616: a MEMBER's tab has no Rules section (host-only by MOUNT, not by a predicate)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
    // The Macro-picks section reads TWO procs; stubbing only the first leaves its boundary in the error
    // arm (which is what the chat tab's own CT does today — reported, not fixed here).
    "chat.getVariablePicks": () => ({ variables: [], values: {} }),
    "databank.listActiveForChat": () => [],
  });

  const component = await mount(<RulesInThisChatTabStory chatId={CHAT} isHost={false} />);

  await expect(component.getByRole("heading", { name: "Macro picks", exact: true, level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Rules", exact: true, level: 3 })).toHaveCount(0);
});

// ── The RESTYLE's own floor: geometry + contrast + tap targets, at every real width, in both themes ────
// The a11y floor this surface shipped with was MEASURED and PASSING (landmark, switch names, focus order,
// 4px ring, 44px targets, 8.34:1 / 6.41:1 contrast), so the redesign owes a re-measurement rather than an
// assumption (#621 hazards). Contrast is read out of the FRAMEBUFFER — computed style passes `oklch(...)`
// through verbatim, so an `rgb()` regex is dead on this tree by construction.

const WIDTHS = [384, 430, 1024] as const;
const THEMES = ["dark", "light"] as const;
/** WCAG AA for the body/gloss steps this row uses. The shipped surface measured far above it. */
const CONTRAST_AA = 4.5;
/** The share of the row the NAME COLUMN must own — the reviewer's ">=55% at 384px", made a range property. */
const NAME_COLUMN_SHARE = 0.55;
const TRANSPARENT_BG = "rgba(0, 0, 0, 0)";

/** WCAG contrast between two CSS colours, computed IN THE PAGE by painting each into a 2d canvas (the
 *  framebuffer resolves `oklch()` to sRGB; nothing here parses a colour string). */
function contrastBetween(page: Page, foreground: string, background: string): Promise<number> {
  return page.evaluate(
    ([fg, bg]: readonly [string, string]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("contrastBetween: no 2d context");
      }
      const channel = (value: number): number => {
        const v = value / 255;
        return v <= 0.039_28 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (colour: string): number => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = colour;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
    },
    [foreground, background] as const,
  );
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`#621 restyle floor: ${theme} @ ${width}px \u2014 the name owns the row, nothing overflows, contrast and tap targets hold`, async ({
      mount,
      page,
    }) => {
      await stub(page, { rules: [RULE, FREE_RULE] });
      const component = await mount(<RulesSectionStory chatId={CHAT} width={width} />);
      await page.evaluate((next: string) => {
        document.documentElement.dataset["theme"] = next;
      }, theme);
      const name = page.getByText("Illustrate the scene", { exact: true });
      await expect(name).toBeVisible();

      // 1. The name column owns its share of the row — the trailing cluster never squeezes the identity.
      const share = await name.evaluate((el) => {
        const column = el.parentElement as HTMLElement;
        const row = column.parentElement as HTMLElement;
        return column.getBoundingClientRect().width / row.getBoundingClientRect().width;
      });
      expect(share).toBeGreaterThanOrEqual(NAME_COLUMN_SHARE);

      // 2. Nothing paints outside the pane at any real width (the 1024px tab-strip overflow this surface
      //    caused is gone with the tab; the section itself must not reintroduce one).
      const overflow = await component.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);

      // 3. Contrast of the row's gloss (its description line) against the surface behind it.
      const gloss = await page
        .getByText("Generate a picture of the current scene on a cadence, and post it into the room.")
        .evaluate((el, transparent: string) => {
          const ink = getComputedStyle(el).color;
          let node: HTMLElement | null = el as HTMLElement;
          let backdrop = transparent;
          while (node !== null && backdrop === transparent) {
            backdrop = getComputedStyle(node).backgroundColor;
            node = node.parentElement;
          }
          return [ink, backdrop === transparent ? getComputedStyle(document.body).backgroundColor : backdrop] as const;
        }, TRANSPARENT_BG);
      expect(await contrastBetween(page, gloss[0], gloss[1])).toBeGreaterThanOrEqual(CONTRAST_AA);

      // 4. Both row controls still clear the pointer's own touch floor (the RESOLVED token, never a 44).
      const floor = await touchFloorPx(page);
      const testAction = page.getByRole("button", { name: "Test Illustrate the scene" });
      const more = page.getByRole("button", { name: "More actions for Illustrate the scene" });
      expect(await hitExtent(testAction, "y")).toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(more, "y")).toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(more, "x")).toBeGreaterThanOrEqual(floor);

      // The rendered receipt for the side-eye re-pass (reports/ is ephemera, never a committed artifact).
      await component.screenshot({ path: `reports/snaps/cb-rules-${theme}-${width}.png` });
    });
  }
}
