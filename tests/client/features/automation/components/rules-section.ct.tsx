// CT: the B2 Rules SECTION (rules-section.tsx + rule-preset-picker.tsx + rule-fire-log.tsx) — the host-only
// automation surface. Drives the REAL tRPC path over the stubbed network (routeTrpc): the rule list renders,
// the enable toggle / Test / Run-now fire the right procs with the right inputs, the preset picker mints via
// createRuleFromPreset, the auto-add-lore card's `entityRef` knob renders as a PICKER over this chat's books
// (#630 — it used to be a text field asking for a TypeID), and the per-rule fire log shows a fire. Fixtures
// are plain wire literals (routeTrpc responders are `unknown`; the wire SHAPE is pinned by the router +
// domain tests, not re-typed here).
//
// The SIDE-EYE #621 pins are the second half of this file: they assert through what a HOST sees — the row
// says what the rule does and when it last ran, the spending action is marked and demoted, the irreversible
// one needs a confirm, the fire log renders the answer the toast promises, and the popover does not clip its
// own copy. Every one of them was RED against the pre-fix source (measured 2026-08-24, cb-rules-section).
// The mount is 384px — the narrowest REAL host (the docked CONTEXT pane), never a roomy story width.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { hitExtent, touchFloorPx } from "../../../../support/ct/touch-floor.ts";
import { RulesInThisChatTabStory, RulesSectionStory, RulesSectionToastStory } from "../_ct-stories.tsx";

const CHAT = castId<ChatId>("chat_ct_rules_0001");

// A FIXED epoch, never `Date.now()` (test-determinism): the row and the log both render relative time.
const A_PAST_INSTANT = 1_760_000_000_000;

/** The viewer's settings row (#649) — spread FIRST into every `routeTrpc` call here. Not this file's subject
 *  (the rules surface is), but unfed it resolved `routeTrpc`'s null, so every appearance/tier reader in this
 *  384px mount fell to its default branch and the settings-driven presentation path never ran. Production
 *  defaults, so no assertion here moves. */
const VIEWER_SETTINGS_ROUTE: Readonly<Record<string, unknown>> = {
  "settings.getUserSettings": { userId: "user_ct_rules", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: A_PAST_INSTANT },
};
const RUN_NOW_ITEM = /Run now/u;
const LAST_RAN_LINE = /^Last ran /u;
/** The defect this row killed: a TEXT BOX asking for a lorebook id. Any textbox named for the lorebook knob. */
const LOREBOOK_TEXTBOX = /Lorebook/u;
/** WCAG 2.5.5's coarse-pointer target floor — asserted on the RESOLVED token before it is trusted, so a
 *  fine-pointer run (where the token answers 28) cannot read as a pass. */
const WCAG_TOUCH_FLOOR_PX = 44;
/** #655: the SPEND sentence the catalogue owed and did not have. */
const SPEND_LINE = "Costs a model call each time it fires.";
/** #655: a real prompt-length `text` knob default — the shape a one-line `Input` showed 44% of. */
const CLOCK_PROMPT_DEFAULT = "The pressure that has been building finally breaks into the scene, and nobody in the room is ready for it.";

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
  // #655: its arm is a `trigger_turn` — a full model call, every 8 beats, forever, once enabled. The
  // catalogue said nothing about that until this field existed.
  spends: true,
  knobs: [
    { key: "everyN", kind: "number", label: "Every N beats", default: 8, min: 2, max: 200 },
    { key: "steer", kind: "text", label: "Nudge", default: "Shift the pacing.", maxLength: 600 },
  ],
};

// The book-requiring rule preset (auto-add lore). Its `bookId` is the `entityRef` knob kind (#630): it
// carries NO default at all — the picker renders it as a chooser over THIS CHAT's attached books, and the
// mint is blocked until one is chosen. The old shape (a `text` knob with an empty default asking the host
// to type a TypeID from memory) is what this row replaced.
const LORE_PRESET = {
  id: "autoAddLore",
  title: "Auto-add lore entries",
  summary: "Every so often, offer to write what has happened into one of this room's lorebooks.",
  ruleCount: 1,
  confirmFirst: true,
  // #655: its only arm writes a lore entry — free. The contrast that proves the spend line is DERIVED from
  // the preset's arms rather than pasted onto every row.
  spends: false,
  knobs: [
    { key: "bookId", kind: "entityRef", entity: "worldInfoBook", label: "Lorebook", help: "The book to write into — one of this room's own." },
    { key: "everyN", kind: "number", label: "Every N messages", default: 10, min: 2, max: 200 },
  ],
};

/** The CHOICE + long-TEXT rule preset (the clock). It carries the two knob shapes #655 fixed on the form
 *  side: a `choice` whose options are wire values (`narrate`/`notify`) and now carry their own host labels,
 *  and a `text` knob holding a whole PROMPT SENTENCE, which a single-line `Input` clipped. */
const CLOCK_PRESET = {
  id: "clockFires",
  title: "Clock fires when full",
  summary: "A countdown fills one step per beat; when it is full, something happens and it resets.",
  ruleCount: 2,
  confirmFirst: false,
  spends: true,
  knobs: [
    { key: "n", kind: "number", label: "Beats to fill", default: 4, min: 1, max: 100 },
    {
      key: "firedArm",
      kind: "choice",
      label: "When it fills",
      help: "Narrate it in the room (this asks for a reply, so it costs a model call), or just notify you.",
      options: ["narrate", "notify"],
      optionLabels: { narrate: "Narrate it in the room", notify: "Notify me" },
      default: "narrate",
    },
    { key: "firedText", kind: "text", label: "What happens", default: CLOCK_PROMPT_DEFAULT, maxLength: 600 },
  ],
};

/** Named because the #640 end-to-end drives the picker BY this name — an index read into `ROOM_BOOKS` is
 *  `possibly undefined` under the tests program's `noUncheckedIndexedAccess`, while biome's type service
 *  disagrees and calls the guarding optional chain useless, so neither `?.` nor `[0]` is spellable there. */
const ATTACHABLE_BOOK_NAME = "Ashfall Canon";

// The two books this room has attached — what `worldInfo.listForChat` answers, and therefore exactly the
// set the picker may offer (the same set `substrate/validate.ts` accepts at mint).
const ROOM_BOOKS = [
  { id: "worldbook_ct_lore_0001", name: ATTACHABLE_BOOK_NAME, description: null, createdAt: 2, role: null },
  { id: "worldbook_ct_lore_0002", name: "Session Notes", description: null, createdAt: 1, role: null },
];

interface StubOverrides {
  readonly rules?: readonly unknown[];
  readonly fires?: readonly unknown[];
  readonly presets?: readonly unknown[];
  readonly books?: readonly unknown[];
  readonly mint?: TrpcResponder;
}

function stub(page: Page, overrides: StubOverrides = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    ...VIEWER_SETTINGS_ROUTE,
    "automation.listRules": () => overrides.rules ?? [RULE],
    "automation.listFires": () => overrides.fires ?? [],
    "automation.listRulePresets": () => overrides.presets ?? [PACING_PRESET],
    "automation.setRuleEnabled": () => ({}),
    "automation.testRule": () => ({ predicate: true, arms: [{ type: "generate_image", renderedPreview: "a moody scenario shot" }] }),
    "automation.runRuleNow": () => ({ outcome: "fired" }),
    "automation.createRuleFromPreset": overrides.mint ?? ((): unknown => [RULE]),
    "automation.deleteRule": () => undefined,
    "worldInfo.listForChat": () => overrides.books ?? ROOM_BOOKS,
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

// ── #630: the entityRef knob — the catalogue's "natural first card" is completable ────────────────────
// The row's whole defect: `bookId` was a TEXT field with an empty default, so minting the stated
// natural-first card required knowing a lorebook TypeID by heart. These four pin the replacement.

test("#630: the lorebook knob is a PICKER over this chat's books — minting needs no typed id", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [], presets: [LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();

  // The defect, stated as an assertion: no text box asks for an id (this was `getByRole("textbox",
  // { name: "Lorebook id" }).fill(…)` against the old source).
  await expect(page.getByRole("textbox", { name: LOREBOOK_TEXTBOX })).toHaveCount(0);

  // P1-4 still holds: the form does NOT open accusing before the host has touched anything.
  await expect(page.getByText("Choose a lorebook.")).toHaveCount(0);

  // The chooser lists THIS ROOM's attached books, by name, and the read was scoped to this chat.
  const chooser = page.getByRole("combobox", { name: "Lorebook" });
  await expect(chooser).toBeVisible();
  await expect.poll(() => trpc.lastInput("worldInfo.listForChat")).toMatchObject({ chatId: CHAT });
  await chooser.click();
  await expect(page.getByRole("option", { name: "Ashfall Canon", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Session Notes", exact: true })).toBeVisible();
  // The rendered receipt for the row (reports/ is ephemera, never a committed artifact).
  await page.screenshot({ path: "reports/snaps/cb-lorebook-picker-open.png" });

  // Picking a book by NAME sends its id — the host never saw, let alone typed, a TypeID.
  await page.getByRole("option", { name: "Ashfall Canon", exact: true }).click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(1);
  await expect
    .poll(() => trpc.lastInput("automation.createRuleFromPreset"))
    .toMatchObject({ presetId: "autoAddLore", knobs: { bookId: "worldbook_ct_lore_0001", everyN: 10 } });
});

test("#630: an unchosen lorebook blocks the mint and says so in PICKING words, not typing ones", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [], presets: [LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();
  await expect(page.getByRole("combobox", { name: "Lorebook" })).toBeVisible();

  // Pressing Add says what is missing and mints NOTHING. "Fill in" would be a small lie over a chooser.
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(page.getByText("Choose a lorebook to add this rule.")).toBeVisible();
  await expect(page.getByText("Choose a lorebook.")).toBeVisible();
  // ONESHOT-OK: the two barriers above are the RENDERED result of this very click, so the press is
  // provably processed; the recorder only grows on a request that would already have been sent.
  expect(trpc.count("automation.createRuleFromPreset")).toBe(0);
});

test("#630: a room with NO attached books says so — an empty dropdown would be a dead end again", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [LORE_PRESET], books: [] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();

  await expect(page.getByText("This room has no lorebooks attached yet, so there is nothing for this rule to write into.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Lorebook" })).toHaveCount(0);
  // #640: …and it now POINTS somewhere. The copy deliberately prescribed nothing while no client affordance
  // attached a book to a chat; the "This chat" tab's Lorebooks section is that affordance, and it is the SAME
  // attachment `substrate/validate.ts` gates this mint on — so the sentence names the one place that makes
  // this card completable instead of leaving the host at a dead end.
  await expect(page.getByText("Attach one under Lorebooks", { exact: false })).toBeVisible();
});

test("#630: the typed mint refusal stays reachable — a listed book that stopped qualifying is SAID", async ({ mount, page }) => {
  // Attachment is a LIVE fact the picker cannot pre-empt: the server refuses at mint, and the host must
  // read the reason rather than watch a card quietly do nothing.
  await stub(page, {
    rules: [],
    presets: [LORE_PRESET],
    mint: () => trpcError({ code: "BAD_REQUEST", message: "book 'worldbook_ct_lore_0001' is not attached to this chat" }),
  });
  await mount(<RulesSectionToastStory chatId={CHAT} />);

  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();
  await page.getByRole("combobox", { name: "Lorebook" }).click();
  await page.getByRole("option", { name: "Ashfall Canon", exact: true }).click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();

  // Scoped to the live region: the toast paints its title AND an aria mirror of it, so a bare getByText
  // is a strict-mode violation rather than a signal.
  await expect(page.getByLabel("Alerts")).toContainText("book 'worldbook_ct_lore_0001' is not attached to this chat");
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
    ...VIEWER_SETTINGS_ROUTE,
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
    // The Macro-picks section reads TWO procs; stubbing only the first leaves its boundary in the error
    // arm (which is what the chat tab's own CT does today — reported, not fixed here).
    "chat.getVariablePicks": () => ({ variables: [], values: {} }),
    "chat.getChat": () => ({ id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] }),
    "databank.listActiveForChat": () => [],
    // #640: the tab now carries a Lorebooks section too, and its read must be fed or that boundary
    // error-arms silently inside this composition.
    "worldInfo.listForChat": () => ROOM_BOOKS,
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
    ...VIEWER_SETTINGS_ROUTE,
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
    // The Macro-picks section reads TWO procs; stubbing only the first leaves its boundary in the error
    // arm (which is what the chat tab's own CT does today — reported, not fixed here).
    "chat.getVariablePicks": () => ({ variables: [], values: {} }),
    "databank.listActiveForChat": () => [],
    "worldInfo.listForChat": () => ROOM_BOOKS,
  });

  const component = await mount(<RulesInThisChatTabStory chatId={CHAT} isHost={false} />);

  await expect(component.getByRole("heading", { name: "Macro picks", exact: true, level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Rules", exact: true, level: 3 })).toHaveCount(0);
});

// ── #640: THE END-TO-END — attach a lorebook in the room, and the auto-add-lore card becomes completable ──
// This is the row's whole point. The catalogue's "natural first card" was uncompletable in every fresh room
// because `chat_books` had no client writer at all, so the picker's honest empty state had nowhere to send
// the host. Both halves now live in ONE pane, so ONE mount can walk the whole path.
//
// WHAT THE REMOUNT IS AND IS NOT. The app runs `staleTime: Infinity` — the bus, not a refetch, is every
// read's freshness driver, and `worldInfo.attachToChat` emits `worldInfoChanged`, whose USER_BUS_FILTERS arm
// path-invalidates `worldInfo` (data/invalidation.ts:221) and therefore this very read. A CT has no socket,
// so the remount below stands in for that tick — a fresh QueryClient per `mount()` (ct-data-providers.tsx).
// The claim it proves is the one that matters and could not be checked before: the write the rack sends is
// the write that makes the picker offer the book. The bus leg is the persona-lorebook wire, already pinned.
test("#640 END-TO-END: a room with no books → attach in Lorebooks → the auto-add-lore card can be completed", async ({ mount, page }) => {
  // The room's attachment list, MUTABLE — the stub answers what the server would after the write lands.
  const attached: unknown[] = [];
  const trpc = await routeTrpc(page, {
    ...VIEWER_SETTINGS_ROUTE,
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
    "chat.getVariablePicks": () => ({ variables: [], values: {} }),
    "chat.getChat": () => ({ id: CHAT, viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] }),
    "databank.listActiveForChat": () => [],
    "automation.listRules": () => [],
    "automation.listFires": () => [],
    "automation.listRulePresets": () => [LORE_PRESET],
    "worldInfo.listForChat": () => [...attached],
    "worldInfo.listBooks": () => ROOM_BOOKS,
    "worldInfo.attachToChat": () => {
      attached.push({ id: "worldbook_ct_lore_0001", name: ATTACHABLE_BOOK_NAME, description: null, createdAt: 2, role: null });
      return null;
    },
  });

  const before = await mount(<RulesInThisChatTabStory chatId={CHAT} />);

  // ① The dead end, as reported: no books, so the card says so — and now names the way out.
  await before.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();
  await expect(page.getByText("This room has no lorebooks attached yet", { exact: false })).toBeVisible();
  await expect(page.getByText("Attach one under Lorebooks", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");

  // ② The way out, taken — in the same pane the sentence points at.
  await before.getByRole("button", { name: "Attach a lorebook" }).click();
  await page.getByRole("button", { name: `Attach ${ATTACHABLE_BOOK_NAME} to this chat` }).click();
  await expect.poll(() => trpc.lastInput("worldInfo.attachToChat"), { intervals: [20, 50, 100] }).toMatchObject({ chatId: CHAT });
  await before.unmount();

  // ③ The room now carries the book — and the card that was uncompletable can be completed.
  const after = await mount(<RulesInThisChatTabStory chatId={CHAT} />);
  await expect(after.getByText(ATTACHABLE_BOOK_NAME, { exact: true }).first()).toBeVisible();
  await after.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();
  await expect(page.getByText("This room has no lorebooks attached yet", { exact: false })).toHaveCount(0);
  const chooser = page.getByRole("combobox", { name: "Lorebook" });
  await expect(chooser).toBeVisible();
  await chooser.click();
  await expect(page.getByRole("option", { name: ATTACHABLE_BOOK_NAME, exact: true })).toBeVisible();

  // The rendered receipt of the whole row (reports/ is ephemera, never a committed artifact).
  await page.screenshot({ path: "reports/snaps/cb-aa-attach-then-pick.png" });
});

// ── #655: the spend signal, the readable form, and the door that can be opened ────────────────────────
// The surface's remaining defects after #621/#630/#640, all of them at the DECISION point: a host could not
// tell what a rule preset would COST before minting it, could not read the prompt they were minting, chose
// between raw wire values, and was told to make a choice the surface could not offer. Every pin below was
// RED against the pre-fix client source (measured by reverting the four client files to HEAD).

/** The type step a resolved `--text-*` token computes to in THIS document — never a px literal, so a token
 *  retune moves the assertion instead of breaking it. */
function stepPx(page: Page, token: string): Promise<string> {
  return page.evaluate((name: string) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    probe.style.fontSize = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const px = getComputedStyle(probe).fontSize;
    probe.remove();
    return px;
  }, token);
}

/** Open the picker and return its popup. */
async function openPicker(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  const popup = page.getByRole("dialog");
  await expect(popup).toBeVisible();
  return popup;
}

test("#655: the catalogue names the recurring CHARGE before the mint, and stays silent on a free preset", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [PACING_PRESET, LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  const popup = await openPicker(page);

  // The spending preset says so IN ITS OWN ROW — not two clicks deep in an overflow menu after the rule
  // already exists, which is where the only mention of spend used to live.
  await expect(popup.getByRole("button", { name: "Periodic pacing nudge" })).toContainText(SPEND_LINE);
  // …and the free one does not, which is what makes the marker mean anything.
  await expect(popup.getByRole("button", { name: "Auto-add lore entries" })).not.toContainText(SPEND_LINE);
  await expect(popup.getByText(SPEND_LINE)).toHaveCount(1);

  // The rendered receipt for the row (reports/ is ephemera, never a committed artifact).
  await page.screenshot({ path: "reports/snaps/cb-rules-spend-catalogue.png" });

  // It survives the step change: the knob form is where Add is actually pressed.
  await popup.getByRole("button", { name: "Periodic pacing nudge" }).click();
  await expect(popup.getByText(SPEND_LINE)).toBeVisible();
});

test("#655: the catalogue's decision sentence reads at the label step, above the 10.5px functional floor", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [PACING_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  const popup = await openPicker(page);

  const [micro, label, title] = await Promise.all([stepPx(page, "--text-micro"), stepPx(page, "--text-label"), stepPx(page, "--text-title")]);
  expect(micro).not.toBe(label);
  const summary = popup.getByText("Every few beats, quietly ask the narrator to shift the pacing.", { exact: false });
  await expect.poll(() => summary.evaluate((el) => getComputedStyle(el).fontSize), { intervals: [20, 50, 100, 200] }).toBe(label);
  // …and the title stays a step ABOVE it, or lifting the summary would just have flattened the row into
  // two identical 13px lines.
  await expect
    .poll(() => popup.getByText("Periodic pacing nudge", { exact: true }).evaluate((el) => getComputedStyle(el).fontSize), {
      intervals: [20, 50, 100, 200],
    })
    .toBe(title);
});

test("#655: a prompt knob is a TEXTAREA showing the whole prompt, and a choice offers host words", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [CLOCK_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  const popup = await openPicker(page);
  await popup.getByRole("button", { name: "Clock fires when full" }).click();

  // The `text` knob carries the literal sentence the rule sends to the model. A single-line Input showed
  // 44% of it (measured `value.len=93 clientWidth=291 scrollWidth=663 tag=INPUT`).
  const prompt = page.getByRole("textbox", { name: "What happens" });
  await expect(prompt).toHaveValue(CLOCK_PROMPT_DEFAULT);
  // ONESHOT-OK: the settled `toHaveValue` above is this control's own rendered state, and an element's
  // TAG NAME is not mutable async state — a retry could only re-read the same node.
  expect(await prompt.evaluate((el) => el.tagName)).toBe("TEXTAREA");
  await expect.poll(() => prompt.evaluate((el) => el.scrollHeight - el.clientHeight), { intervals: [20, 50, 100, 200] }).toBeLessThanOrEqual(1);

  // The `choice` knob's options were the WIRE values — `narrate`/`notify` as user-facing words.
  await page.getByRole("combobox", { name: "When it fills" }).click();
  await expect(page.getByRole("option", { name: "Narrate it in the room", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Notify me", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "narrate", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "notify", exact: true })).toHaveCount(0);
});

test("#655: with no lorebook attached, the blocking line names the DOOR, not an impossible choice", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [LORE_PRESET], books: [] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  const popup = await openPicker(page);
  await popup.getByRole("button", { name: "Auto-add lore entries" }).click();
  await expect(page.getByText("This room has no lorebooks attached yet", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  // The line above Add used to say "Choose a lorebook to add this rule." — directly contradicting the field
  // three lines up, in the position a host reads LAST, and naming an action this surface cannot perform.
  await expect(page.getByText("Attach a lorebook under Lorebooks, higher up this tab", { exact: false })).toBeVisible();
  await expect(page.getByText("Choose a lorebook to add this rule.")).toHaveCount(0);
});

test("#655: with a book attached, the blocking line still asks for the CHOICE (the fix did not swallow the old arm)", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  const popup = await openPicker(page);
  await popup.getByRole("button", { name: "Auto-add lore entries" }).click();
  await expect(page.getByRole("combobox", { name: "Lorebook" })).toBeVisible();

  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(page.getByText("Choose a lorebook to add this rule.")).toBeVisible();
  await expect(page.getByText("Attach a lorebook under Lorebooks", { exact: false })).toHaveCount(0);
});

// The reported two-step defect had two halves and only ONE of them is fixed here. This pins that half: the
// popover speaks with ONE heading and the heading names the step. The GEOMETRIC half (the frame's width and
// anchor moving between steps) is NOT pinned, because both call-site levers were tried and measured wrong —
// `min-w-cq-sm` overflowed the positioner's available width at the 384px docked pane, and `side`/`align`
// only re-anchored a genuinely different box. It needs a `PopoverPopup` width variant in `@orb/ui` and a
// real-host receipt; an assertion here would either encode this CT's short page as the spec or, worse,
// pass while the real surface still jumps. (cb-rules-spend, 2026-08-24 — receipts in the picker's comment.)
test("#655: the picker speaks with ONE heading, and the heading names the step", async ({ mount, page }) => {
  await stub(page, { rules: [], presets: [PACING_PRESET, LORE_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  const popup = await openPicker(page);

  // Step 2 used to render a SECOND title inside the body while this one still said "Add a rule", so the
  // dialog's accessible name never changed and a sighted host read two titles in reversed order.
  await expect(popup.getByRole("heading", { name: "Add a rule" })).toBeVisible();

  await popup.getByRole("button", { name: "Periodic pacing nudge" }).click();
  await expect(popup.getByRole("heading", { name: "Periodic pacing nudge" })).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Add a rule" })).toHaveCount(0);
  await expect(popup.getByRole("heading")).toHaveCount(1);

  // Back returns the heading to the catalogue's — and closing forgets the pick entirely, so re-opening does
  // not land on a form the host already walked away from.
  await popup.getByRole("button", { name: "Back" }).click();
  await expect(popup.getByRole("heading", { name: "Add a rule" })).toBeVisible();
  await popup.getByRole("button", { name: "Periodic pacing nudge" }).click();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  const reopened = await openPicker(page);
  await expect(reopened.getByRole("heading", { name: "Add a rule" })).toBeVisible();
});

// The fire log is the "why didn't my rule fire" surface and this disclosure is its ONLY door. It shipped
// `inline` — text-height, with `::after` resolving `content: none`, so no touch layer was in play at all.
// A NARROW VIEWPORT WOULD NOT SEE THIS: pointer class is a browser-context flag, and at a fine pointer the
// floor token answers 28px, which the 16px box still fails but by a quarter of the real margin.
test.describe("#655: coarse pointer — the fire-log door meets the touch floor", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 900 } });

  test("the Recent activity disclosure is reachable with a finger", async ({ mount, page }) => {
    // ONESHOT-OK: pointer class is fixed when the browser CONTEXT is created (`hasTouch` above), not page
    // state — there is nothing async for a poll to wait out, and a poll would only mask a config miss.
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page);
    await mount(<RulesSectionStory chatId={CHAT} width={430} />);

    const floor = await touchFloorPx(page);
    expect(floor).toBeGreaterThanOrEqual(WCAG_TOUCH_FLOOR_PX);
    const disclosure = page.getByRole("button", { name: "Recent activity for Illustrate the scene" });
    await expect(disclosure).toBeVisible();
    // THE BOX, not `hitExtent`, and the choice is measured rather than preferred. This trigger's fix is a
    // REAL min-height (`size="control"`), not an overflowing `::after`, so its box IS its target — and
    // `hitExtent` is structurally incapable of failing here: its `owns()` counts a point as owned when
    // `elementFromPoint` returns an ANCESTOR (`hit.contains(el)`), which is how it sees a pseudo the DOM
    // has no node for. Walking out of a 16px trigger lands on the Stack that wraps it, so the sweep ran to
    // its 80-step ceiling. Proven, not asserted: this test PASSED against the reverted 413×16 source while
    // the other five #655 pins went red (cb-rules-spend, 2026-08-24) — reported as an instrument finding.
    await expect.poll(async () => (await disclosure.boundingBox())?.height, { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
  });
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
