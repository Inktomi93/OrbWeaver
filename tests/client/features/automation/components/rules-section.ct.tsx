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
import { HOST_BAND, openContextSections } from "../../../../support/ct/open-context-sections.ts";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { ctSnapPath } from "../../../../support/ct/snap-out.ts";
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
  // B4 — RULED F4's per-rule opt-out, at its shipped default (the rule OFFERS to run when rate-capped).
  suggestOnRefusal: true,
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
    { key: "steer", kind: "text", label: "Nudge", default: "Shift the pacing.", minLength: 1, maxLength: 600 },
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
    { key: "firedText", kind: "text", label: "What happens", default: CLOCK_PROMPT_DEFAULT, minLength: 1, maxLength: 600 },
  ],
};

/** Named because the #640 end-to-end drives the picker BY this name — an index read into `ROOM_BOOKS` is
 *  `possibly undefined` under the tests program's `noUncheckedIndexedAccess`, while biome's type service
 *  disagrees and calls the guarding optional chain useless, so neither `?.` nor `[0]` is spellable there. */
// PRE-EXISTING RED, FED HERE (found 2026-09-05 by cb-injections-idiom, reproduced against a clean
// ca853697c with all three files at HEAD): the Regex section (#1742) landed in the "This chat" tab with two
// new reads, and the tab-mounting tests in THIS file were never swept — both `#616` and `#640` timed out
// waiting for the host band that never rendered, and the #629 unfed-read census flagged both procs. The
// section is closed by default here, so the disabled-and-empty projection is all these mounts need: they
// are about the AUTOMATION graft, and a regex claim belongs to `regex-section.ct.tsx`.
const EMPTY_REGEX_READS = {
  "chat.listEffectiveRegex": () => ({
    enabled: false,
    tiers: [
      { scope: "global", allowed: true, rows: [] },
      { scope: "preset", allowed: true, rows: [] },
      { scope: "chat", allowed: true, rows: [] },
    ],
    effective: [],
  }),
  "regex.listForChat": () => [],
  "regex.listScripts": () => [],
  "regex.listRoomDisplayScripts": () => [],
} as const;

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
  readonly setEnabled?: TrpcResponder;
  readonly testRule?: TrpcResponder;
}

function stub(page: Page, overrides: StubOverrides = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    ...VIEWER_SETTINGS_ROUTE,
    "automation.listRules": () => overrides.rules ?? [RULE],
    "automation.listFires": () => overrides.fires ?? [],
    "automation.listRulePresets": () => overrides.presets ?? [PACING_PRESET],
    "automation.setRuleEnabled": overrides.setEnabled ?? (() => ({})),
    "automation.setRuleSuggestOnRefusal": () => ({}),
    "automation.testRule": overrides.testRule ?? (() => ({ predicate: true, arms: [{ type: "generate_image", renderedPreview: "a moody scenario shot" }] })),
    "automation.runRuleNow": () => ({ outcome: "fired" }),
    "automation.createRuleFromPreset": overrides.mint ?? ((): unknown => [RULE]),
    "automation.deleteRule": () => undefined,
    "worldInfo.listForChat": () => overrides.books ?? ROOM_BOOKS,
  });
}

/** One rule's own collapse trigger (#886). Located through the trigger STAMP filtered by the rule's visible
 *  name rather than by an accessible name: the trigger's name COMPUTES from its content (summary + gloss +
 *  state line), so it is not a stable string, and the fire-log disclosure nested inside the panel never
 *  carries the rule's name in its visible text. `.first()` is the row's own trigger in DOM order. */
function ruleDisclosure(page: Page, name: string): Locator {
  return page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: name }).first();
}

/** Open one rule's row (#886 — Test, the overflow menu, the B4 switch and the fire-log door all moved behind
 *  the disclosure; only the name/gloss/state summary and the enable switch stay on the closed face).
 *  IDEMPOTENT: a plain click on an already-open row would close it, and two tests below open two rows in
 *  sequence with an Escape between them. */
async function openRule(page: Page, name: string): Promise<void> {
  const trigger = ruleDisclosure(page, name);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

/** Open one rule's overflow menu — where Run-now (it spends) and Delete (irreversible) live. Behind the
 *  row's own disclosure since #886, so the row is opened first. */
async function openRuleMenu(page: Page, name: string): Promise<void> {
  await openRule(page, name);
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

// ── B4, the per-rule F4 opt-out (#804). Asserted through the AFFORDANCE, never the prop: the switch is
//    found by its ACCESSIBLE NAME, which must CONTAIN the visible label verbatim (WCAG 2.5.3 label-in-name
//    — a voice-control user says what they read), and the flip is proven by the proc + input the host's
//    click actually sent. Both were RED against the pre-#804 source: the switch did not exist. ──
const OFFER_LABEL = "Offer to run it when rate-capped";

test("B4 — a SPEND rule shows the rate-capped OFFER switch, named so the visible label is speakable", async ({ mount, page }) => {
  await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);
  await openRule(page, "Illustrate the scene");

  // The visible label is on the row itself, in the host's words — not "suggestOnRefusal", not "F4".
  await expect(page.getByText(OFFER_LABEL, { exact: true })).toBeVisible();
  // …and the switch's accessible name CONTAINS that exact string, plus the rule name to tell N rows apart.
  const offer = page.getByRole("switch", { name: `${OFFER_LABEL} — Illustrate the scene` });
  await expect(offer).toBeVisible();
  // Shipped default: the rule offers. The opt-OUT is the host turning this off.
  await expect(offer).toBeChecked();
});

test("B4 — flipping the offer off sends setRuleSuggestOnRefusal with the ruleId and `false`", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await openRule(page, "Illustrate the scene");
  await page.getByRole("switch", { name: `${OFFER_LABEL} — Illustrate the scene` }).click();

  await expect.poll(() => trpc.count("automation.setRuleSuggestOnRefusal")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.setRuleSuggestOnRefusal")).toMatchObject({ ruleId: "automationrule_ct1", suggestOnRefusal: false });
  // The rule PUT is NOT how this travels — routing it there would clear the rule's mint provenance. Both
  // calls would come from the SAME click handler, so the polls above are the settle: once the flip is
  // recorded WITH its input, an updateRule from that handler is already issued and recorded too.
  // ONESHOT-OK: settled by the two `expect.poll`s directly above — same click handler, no later emitter.
  expect(trpc.count("automation.updateRule")).toBe(0);
});

test("B4 — a FREE rule shows no offer switch at all: it can never raise the invitation the switch governs", async ({ mount, page }) => {
  await stub(page, { rules: [FREE_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await expect(page.getByText("Count the beats", { exact: true })).toBeVisible(); // the row rendered…
  // OPENED, because since #886 the switch would be behind the disclosure — asserting its absence on a
  // closed row would pass for the wrong reason on every rule, spending or not.
  await openRule(page, "Count the beats");
  await expect(page.getByText(OFFER_LABEL, { exact: true })).toHaveCount(0); // …without the switch.
});

test("a same-task repeat admits one enable write, owns only its rule row, and rejection releases retry", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stub(page, { rules: [RULE, FREE_RULE], setEnabled: held });
  await mount(<RulesSectionStory chatId={CHAT} />);

  const first = page.getByRole("switch", { name: "Enable Illustrate the scene" });
  const sibling = page.getByRole("switch", { name: "Enable Count the beats" });
  await first.evaluate((element) => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await held.requested;

  await expect(first).toBeDisabled();
  await expect(sibling).toBeEnabled();
  await expect.poll(() => trpc.count("automation.setRuleEnabled")).toBe(1);

  held.release(trpcError());
  await expect(first).toBeEnabled();
  await first.click();
  await expect.poll(() => trpc.count("automation.setRuleEnabled")).toBe(2);
});

test("the existing Test loading state owns only its rule row while the dry run is held", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stub(page, { rules: [RULE, FREE_RULE], testRule: held });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await openRule(page, "Illustrate the scene");
  await openRule(page, "Count the beats");
  const first = page.getByRole("button", { name: "Test Illustrate the scene" });
  const sibling = page.getByRole("button", { name: "Test Count the beats" });
  await first.click();
  await held.requested;

  await expect(first).toBeDisabled();
  await expect(sibling).toBeEnabled();
  await expect.poll(() => trpc.count("automation.testRule")).toBe(1);
  held.release({ predicate: true, arms: [] });
  await expect(first).toBeEnabled();
});

test("Test runs the dry-run — testRule fires and the predicate verdict + arm preview render", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await openRule(page, "Illustrate the scene");
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
  await page.screenshot({ path: ctSnapPath("cb-lorebook-picker-open") });

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
  // Settled snapshot: the two barriers above are the RENDERED result of this very click, so the press is
  // provably processed; the recorder only grows on a request that would already have been sent.
  await expect.poll(async () => trpc.count("automation.createRuleFromPreset")).toBe(0);
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

  await openRule(page, "Illustrate the scene");
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
  await openRule(page, "Illustrate the scene");
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
  // Settled snapshot: the settled alertdialog above IS this click's rendered result, so the press is provably
  // processed — a delete request, had the item fired one, would already be recorded.
  await expect.poll(async () => trpc.count("automation.deleteRule")).toBe(0);
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

  await openRule(page, "Illustrate the scene");
  await page.getByRole("button", { name: "Recent activity for Illustrate the scene" }).click();
  await expect(page.getByText("Couldn't generate an image (step 1): no image connection is configured")).toBeVisible();
  // "Rate-capped" without the number is a label, not an answer.
  await expect(page.getByText("It had already hit its own hourly cap — now 30 per hour.")).toBeVisible();
  // The middle column speaks English, not the wire discriminator.
  await expect(page.getByText("after each reply").first()).toBeVisible();
  await expect(page.getByText("turnCompleted", { exact: false })).toHaveCount(0);
});

test("#621 ARIA: the Test verdict is announced and carries its meaning as a WORD", async ({ mount, page }) => {
  await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  await openRule(page, "Illustrate the scene");
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
    ...EMPTY_REGEX_READS,
  });

  const component = await mount(<RulesInThisChatTabStory chatId={CHAT} />);

  // #830 — the host band and the grafted section are both disclosures now, and a graft starts CLOSED (its
  // body is data-driven; Rules measured 704px desktop / 1,296px mobile with three rules). Two presses is
  // the host's real path, and it is what makes the body assertion below non-vacuous.
  await openContextSections(component, HOST_BAND, "Rules");

  // A real h3 in the pane's own kicker grammar — the host spells the Section, the contributor only names it.
  await expect(component.getByRole("heading", { name: "Rules", exact: true, level: 3 })).toBeVisible();
  const band = component.locator("section").filter({ hasText: "Host controls" }).first();
  await expect(band.getByRole("heading", { name: "Rules", exact: true, level: 3 })).toBeVisible();
  // …and the section's real body is inside it.
  await expect(component.getByText("Illustrate the scene", { exact: true })).toBeVisible();
  // The rendered receipt of the #616 graft (reports/ is ephemera, never a committed artifact).
  await component.screenshot({ path: ctSnapPath("cb-rules-in-this-chat-tab") });
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
    ...EMPTY_REGEX_READS,
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
    ...EMPTY_REGEX_READS,
    "worldInfo.attachToChat": () => {
      attached.push({ id: "worldbook_ct_lore_0001", name: ATTACHABLE_BOOK_NAME, description: null, createdAt: 2, role: null });
      return null;
    },
  });

  const before = await mount(<RulesInThisChatTabStory chatId={CHAT} />);
  // #830 — both halves of this walk live behind disclosures now (Lorebooks is a closed rack, Rules a closed
  // graft inside the closed host band). `openContextSections` is idempotent, so the same line is correct
  // after the remount below, where the posture is already remembered.
  await openContextSections(before, "Lorebooks", HOST_BAND, "Rules");

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
  await openContextSections(after, "Lorebooks", HOST_BAND, "Rules");
  await expect(after.getByText(ATTACHABLE_BOOK_NAME, { exact: true }).first()).toBeVisible();
  await after.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByText("Auto-add lore entries").click();
  await expect(page.getByText("This room has no lorebooks attached yet", { exact: false })).toHaveCount(0);
  const chooser = page.getByRole("combobox", { name: "Lorebook" });
  await expect(chooser).toBeVisible();
  await chooser.click();
  await expect(page.getByRole("option", { name: ATTACHABLE_BOOK_NAME, exact: true })).toBeVisible();

  // The rendered receipt of the whole row (reports/ is ephemera, never a committed artifact).
  await page.screenshot({ path: ctSnapPath("cb-aa-attach-then-pick") });
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
  await page.screenshot({ path: ctSnapPath("cb-rules-spend-catalogue") });

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
  // Settled snapshot: the settled `toHaveValue` above is this control's own rendered state, and an element's
  // TAG NAME is not mutable async state — a retry could only re-read the same node.
  await expect.poll(async () => await prompt.evaluate((el) => el.tagName)).toBe("TEXTAREA");
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

// The reported two-step defect had two halves. This pins the heading half: the popover speaks with ONE
// heading and the heading names the step. The GEOMETRIC half is pinned separately below, at the real
// docked-pane geometry (#663) — this CT's default 1280px viewport has room to spare either way, so it
// cannot tell a stable frame from a resizing one; that receipt needs the narrow viewport.
// (cb-rules-spend, 2026-08-24 — receipts in the picker's comment; cb-popup-width, #663, closed the fork.)
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

// #814: the OTHER close path. The reset above rides `onOpenChange`, which Base UI fires only for a
// USER-driven close (Escape, outside press) — a successful mint closes the popover by setting the
// controlled `open` itself, so the reset never ran for the one close a host reaches most. Reopening
// landed on the PREVIOUS preset's knob form with the catalogue unreachable, and the one visible
// "Add rule" button minted a DUPLICATE of the rule just added while the host believed they had picked
// a different one (measured twice on main, e96afef17). The two presets here are deliberately
// distinguishable at BOTH steps: `Add 2 rules` is the clock's own button label, so the second mint
// cannot be the pacing form wearing a different name.
test("#814: a MINT returns the picker to its catalogue — the next rule is the one the host picked", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [], presets: [PACING_PRESET, CLOCK_PRESET] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  const popup = await openPicker(page);
  await popup.getByRole("button", { name: "Periodic pacing nudge" }).click();
  await popup.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(1);
  await expect(popup).toHaveCount(0);

  // The catalogue, not the form the host already finished with.
  const reopened = await openPicker(page);
  await expect(reopened.getByRole("heading", { name: "Add a rule" })).toBeVisible();
  await reopened.getByRole("button", { name: "Clock fires when full" }).click();
  await expect(reopened.getByRole("heading", { name: "Clock fires when full" })).toBeVisible();
  await reopened.getByRole("button", { name: "Add 2 rules", exact: true }).click();

  // Two mints, two DIFFERENT presets, in the order the host chose them — the duplicate is the defect.
  await expect.poll(() => trpc.count("automation.createRuleFromPreset")).toBe(2);
  await expect.poll(() => trpc.inputs("automation.createRuleFromPreset")).toMatchObject([{ presetId: "pacingNudge" }, { presetId: "clockFires" }]);
});

// #663: the GEOMETRIC half — a NARROW viewport, matching the real docked pane (the context pane is
// flush against the app window's own edge, so its available width IS the pane width, not this CT's
// roomy 1280px default). `PopoverPopup width="stable"` (packages/ui/src/primitives/popover/popover.tsx)
// resolves `min(24rem, --available-width)`: nothing overflows the pane, and the frame holds a width/x
// within a FLOATING-UI RECOMPUTE tolerance across the swap, instead of resizing WITH the content (the
// measured pre-fix teleport: {x:513 y:36 w:384} → {x:929 y:476 w:319} — hundreds of px, both axes). A
// taller step DOES nudge Base UI's shift/collision middleware by a few px (measured against the fixed
// source: {x:8.85 w:366.3} → {x:5 w:374}, an 8px width / 4px x drift) — real, expected recompute noise
// from a genuinely different content height, not the defect. The tolerance below is an order of
// magnitude tighter than the teleport it replaces and an order of magnitude looser than that noise.
const STABLE_FRAME_TOLERANCE_PX = 24;

test.describe("#663: the picker's popup at the real docked-pane geometry", () => {
  test.use({ viewport: { width: 384, height: 700 } });

  test("does not overflow the docked pane and holds a stable frame across both steps", async ({ mount, page }) => {
    await stub(page, { rules: [], presets: [PACING_PRESET, LORE_PRESET] });
    await mount(<RulesSectionStory chatId={CHAT} />);
    const popup = await openPicker(page);
    const viewportWidth = page.viewportSize()?.width ?? 0;
    expect(viewportWidth).toBeGreaterThan(0);

    await expect.poll(async () => popup.boundingBox()).not.toBeNull();
    const step1 = await popup.boundingBox();
    expect((step1?.x ?? 0) + (step1?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1);
    // Constrained, not just "fits": the popup took LESS than the 384px cap — proof `--available-width`
    // actually won the `min()`, not that nothing happened to overflow by coincidence.
    expect(step1?.width ?? 0).toBeLessThan(384);

    await popup.getByRole("button", { name: "Periodic pacing nudge" }).click();
    await expect(popup.getByRole("heading", { name: "Periodic pacing nudge" })).toBeVisible();
    await expect.poll(async () => popup.boundingBox()).not.toBeNull();
    const step2 = await popup.boundingBox();
    expect((step2?.x ?? 0) + (step2?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1);

    // The teleport, as a number: the frame's box holds within a tight tolerance across the content swap
    // instead of resizing/re-anchoring with it.
    expect(Math.abs((step2?.width ?? 0) - (step1?.width ?? 0))).toBeLessThanOrEqual(STABLE_FRAME_TOLERANCE_PX);
    expect(Math.abs((step2?.x ?? 0) - (step1?.x ?? 0))).toBeLessThanOrEqual(STABLE_FRAME_TOLERANCE_PX);
    expect(Math.abs((step2?.y ?? 0) - (step1?.y ?? 0))).toBeLessThanOrEqual(STABLE_FRAME_TOLERANCE_PX);

    await page.screenshot({ path: ctSnapPath("cb-popup-width-docked-pane") });
  });
});

// The fire log is the "why didn't my rule fire" surface and this disclosure is its ONLY door. It shipped
// `inline` — text-height, with `::after` resolving `content: none`, so no touch layer was in play at all.
// A NARROW VIEWPORT WOULD NOT SEE THIS: pointer class is a browser-context flag, and at a fine pointer the
// floor token answers 28px, which the 16px box still fails but by a quarter of the real margin.
test.describe("#655: coarse pointer — the fire-log door meets the touch floor", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 900 } });

  test("the Recent activity disclosure is reachable with a finger", async ({ mount, page }) => {
    // Settled snapshot: pointer class is fixed when the browser CONTEXT is created (`hasTouch` above), not page
    // state — there is nothing async for a poll to wait out, and a poll would only mask a config miss.
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page);
    await mount(<RulesSectionStory chatId={CHAT} width={430} />);

    const floor = await touchFloorPx(page);
    expect(floor).toBeGreaterThanOrEqual(WCAG_TOUCH_FLOOR_PX);
    await openRule(page, "Illustrate the scene");
    const disclosure = page.getByRole("button", { name: "Recent activity for Illustrate the scene" });
    await expect(disclosure).toBeVisible();
    // THE BOX, not `hitExtent`, and the choice is measured rather than preferred. This trigger's fix is a
    // REAL min-height (`size="control"`), not an overflowing `::after`, so its box IS its target.
    // `hitExtent`'s `owns()` used to count ANY ancestor as owned via `elementFromPoint` (`hit.contains(el)`
    // unconditionally), so walking out of a 16px trigger landed on the Stack that wraps it and ran to its
    // 80-step ceiling regardless of the trigger's real size. Proven, not asserted: this test PASSED against
    // the reverted 413×16 source while the other five #655 pins went red (cb-rules-spend, 2026-08-24) —
    // reported as an instrument finding, fixed at #662 by scoping ancestor credit to pseudo-carried floors
    // only. `hitExtent` would now correctly measure this box-carried trigger too; the box read stays the
    // assertion because a plain box-carried floor needs no compositor sweep.
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

      // 1. The name column owns its share of the row — the trailing control never squeezes the identity.
      //    RE-DERIVED AT #886: the name's own parent chain is now `Stack → CollapsibleTrigger → header Row`,
      //    so the original `parentElement.parentElement` walk would compare the Stack against the trigger
      //    that contains it and read ~1.0 for any geometry at all. The honest pair is the DISCLOSURE (which
      //    carries the whole summary) against the header row that also holds the enable switch.
      await expect
        .poll(async () =>
          name.evaluate((el) => {
            const trigger = el.closest('[data-slot="collapsible-trigger"]') as HTMLElement;
            const row = trigger.parentElement as HTMLElement;
            return trigger.getBoundingClientRect().width / row.getBoundingClientRect().width;
          }),
        )
        .toBeGreaterThanOrEqual(NAME_COLUMN_SHARE);

      // 2. Nothing paints outside the pane at any real width (the 1024px tab-strip overflow this surface
      //    caused is gone with the tab; the section itself must not reintroduce one).
      await expect.poll(async () => component.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);

      // 3. Contrast of the row's gloss (its description line) against the surface behind it.
      const readGlossAtAssertion = async (): Promise<typeof gloss> =>
        await page.getByText("Generate a picture of the current scene on a cadence, and post it into the room.").evaluate((el, transparent: string) => {
          const ink = getComputedStyle(el).color;
          let node: HTMLElement | null = el as HTMLElement;
          let backdrop = transparent;
          while (node !== null && backdrop === transparent) {
            backdrop = getComputedStyle(node).backgroundColor;
            node = node.parentElement;
          }
          return [ink, backdrop === transparent ? getComputedStyle(document.body).backgroundColor : backdrop] as const;
        }, TRANSPARENT_BG);
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
      await expect
        .poll(async () => await contrastBetween(page, (await readGlossAtAssertion())[0], (await readGlossAtAssertion())[1]))
        .toBeGreaterThanOrEqual(CONTRAST_AA);

      // The rendered receipt of the #886 CLOSED face, taken before anything is opened.
      await component.screenshot({ path: ctSnapPath(`cb-rules-${theme}-${width}`) });

      // 4. Both row controls still clear the pointer's own touch floor (the RESOLVED token, never a 44) —
      //    and so does the row's OWN disclosure, which is the new first control a finger meets.
      const floor = await touchFloorPx(page);
      //    THE BOX, not `hitExtent`: `size="control"` is a real `min-h-control-sm` on the trigger, so its box
      //    IS its target — and `hitExtent` walks out from the centre and needs a PSEUDO-carried floor to
      //    credit an ancestor, which this trigger does not have (it measured 1px here for that reason).
      expect(Math.round((await ruleDisclosure(page, "Illustrate the scene").boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(floor);
      await openRule(page, "Illustrate the scene");
      const testAction = page.getByRole("button", { name: "Test Illustrate the scene" });
      const more = page.getByRole("button", { name: "More actions for Illustrate the scene" });
      //    POLLED SINCE #886, and the reason is the mechanism this row now rides: these two controls live
      //    inside a `CollapsiblePanel`, which animates `height` from 0 with `overflow: hidden`. `aria-expanded`
      //    flips on the press, not at the end of the fold — so a one-shot `hitExtent` mid-fold walks out of a
      //    clipped box and reads 1px (measured: this exact arm, light @ 1024px, on the first green run). The
      //    poll settles on the folded-open geometry instead of racing it.
      await expect.poll(async () => await hitExtent(testAction, "y"), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
      await expect.poll(async () => await hitExtent(more, "y"), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
      await expect.poll(async () => await hitExtent(more, "x"), { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
    });
  }
}

// ── #815: THIS SURFACE'S LAYOUT-SHIFT BUDGET, AS A NUMBER ─────────────────────────────────────────
// The B10 side-eye measured `CLS 0.3263 (virtualized 0.0240)` across a long live drive and wrote the
// non-virtualized ~0.302 down against "the This chat pane growing as rules were minted/toggled". That
// attribution is an OBSERVATION, not a measurement — `__orb.motion().cls` is a page-LIFETIME
// accumulator, so a whole-drive number cannot name a surface. This pin is the measurement, and it
// disagrees: the rules surface's own paid CLS for a FULL editing session is ~0.0096.
//
// "PAID" IS THE WHOLE TRICK. A `layout-shift` entry whose `hadRecentInput` is true is EXCLUDED from CLS
// by the browser — input within 500ms before the shift means the host asked for it. With a CT's instant
// stubs every arrival lands inside that window, so a naive probe here reads zero forever and proves
// nothing. Every response below is therefore HELD (`trpcHold`) until the window has lapsed, which is
// what a real server's latency does for free — only then is the shift one a host actually pays.
//
// THE PAID MOVERS, measured (cb-b2-fixes, 2026-08-30, 1280x720 viewport / 384px docked mount):
//   0.00193  the dry-run verdict is inserted MID-ROW — the disclosure and the picker trigger each +60px
//   0.00613  the fire log's 2-line skeleton is replaced by twelve real rows — the picker trigger leaves
//            the viewport (~480px appears where ~64px stood). The largest term, 76% of the session.
//   0.00155  the mint's refetched list adds a row — the picker trigger moves again
// Total 0.00961, an order of magnitude under the 0.1 "good" bar.
//
// THESE MOVERS SATURATE, which is the one thing to know before tightening the budget: every term's
// impact region is bounded by the VIEWPORT, and by the third step the picker trigger is already at the
// bottom edge. A taller fire log therefore does not scale the number — it stops contributing.
//
// THE BUDGET IS PROVEN FAILABLE, AND ITS GREEN IS PROVEN NOT-VACUOUS (a fence nobody has watched bite
// is a wish):
//   · fire fixture 12 → 60 rows: the log term grows 0.00613 → 0.01333, total 0.01527 — still GREEN.
//     That is the saturation above, measured. Do NOT read a green here as "the fire log is bounded".
//   · mount 384px → 1200px (the same movers over more viewport): total 0.02514 — RED, and the failure
//     message names each mover. That is the control this budget's green rests on.
const PAID_CLS_BUDGET = 0.02;
/** The `hadRecentInput` window: input within 500ms BEFORE a shift flags it out of CLS. 600 clears it
 *  with margin. See `letInputWindowLapse` for why a real elapsed wait is the mechanism, not a smell. */
const INPUT_WINDOW_LAPSE_MS = 600;
/** Twelve refusals — a plausible tail for a rule that keeps NOT firing, which is this surface's whole
 *  reason to exist, and enough rows that the skeleton's two lines are visibly not the shape they stand
 *  in for. It is also one of the probe's two dials (see the control receipts above the budget). */
const FIRE_LOG_ROWS = 12;

/** What the in-page observer keeps: the shifts a host PAYS for, plus a count of EVERY entry seen. The
 *  second number is the instrument's liveness tripwire — a run that recorded nothing at all is "I could
 *  not measure", which must never read the same as "nothing moved". */
interface ShiftLedger {
  readonly seen: number;
  readonly paid: readonly { readonly value: number; readonly movers: readonly string[] }[];
}

/** Let the browser's `hadRecentInput` window lapse before a held response is released.
 *
 *  A REAL elapsed wait is the MECHANISM UNDER TEST here, not a flake band-aid: the browser flags a
 *  `layout-shift` entry out of CLS when input landed within 500ms BEFORE it, so a probe that wants the
 *  PAID shift has to let that window pass — which is all a live server's latency does for free. Spelled
 *  as a node-side sleep rather than `page.waitForTimeout` (biome's `noPlaywrightWaitForTimeout`) or a
 *  `performance.now()` poll (the `test-determinism` gate bans an ambient clock in a test, and it is
 *  right: a poll on the page clock is this same sleep wearing a condition). Doubles as the
 *  PerformanceObserver's delivery barrier. */
async function letInputWindowLapse(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, INPUT_WINDOW_LAPSE_MS);
  });
}

/** Start recording. `buffered: true` so anything already emitted this document replays into the store. */
async function recordShifts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ledger: { seen: number; paid: { value: number; movers: string[] }[] } = { seen: 0, paid: [] };
    // `Object.assign` / `Reflect.get` rather than a cast through `unknown`: the ledger has to outlive
    // this evaluate so a later one can read it, and `no-test-fabrication` is right that a double-cast in
    // a test is a fabricated type. This is a real object crossing the page boundary, not a fake shape.
    Object.assign(globalThis, { __shiftLedger: ledger });
    new PerformanceObserver((list): void => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: { node?: Element | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
        };
        ledger.seen += 1;
        if (shift.hadRecentInput) {
          continue; // the host asked for it inside the input window — not CLS.
        }
        ledger.paid.push({
          value: shift.value,
          movers: (shift.sources ?? []).map((source) => {
            const text = (source.node?.textContent ?? "").trim().slice(0, 30);
            return `"${text}" y ${Math.round(source.previousRect.y)}→${Math.round(source.currentRect.y)}`;
          }),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

test("#815: a full rules-editing session stays inside this surface's layout-shift budget", async ({ mount, page }) => {
  const listHold = trpcHold();
  const firesHold = trpcHold();
  const testHold = trpcHold();
  let listCalls = 0;
  let fireCalls = 0;
  const fires = Array.from({ length: FIRE_LOG_ROWS }, (_row, index) => ({
    id: `automationfire_ct_${index}`,
    ruleId: "automationrule_ct1",
    chatId: CHAT,
    triggerType: "turnCompleted",
    outcome: "budget_refused",
    detail: { limit: "rule_hourly" },
    automationDepth: 0,
    firedAt: A_PAST_INSTANT,
  }));
  await routeTrpc(page, {
    ...VIEWER_SETTINGS_ROUTE,
    // The FIRST read is the mount's; the refetch a mutation triggers is the one held past the window.
    "automation.listRules": (): unknown => {
      listCalls += 1;
      return listCalls === 1 ? [RULE] : listHold;
    },
    "automation.listFires": (): unknown => {
      fireCalls += 1;
      return fireCalls === 1 ? firesHold : fires;
    },
    "automation.listRulePresets": () => [PACING_PRESET, CLOCK_PRESET],
    "automation.setRuleEnabled": () => ({}),
    "automation.setRuleSuggestOnRefusal": () => ({}),
    "automation.testRule": (): unknown => testHold,
    "automation.createRuleFromPreset": (): unknown => [FREE_RULE],
    "automation.deleteRule": () => undefined,
    "worldInfo.listForChat": () => ROOM_BOOKS,
  });
  await mount(<RulesSectionStory chatId={CHAT} />);
  const firstRow = page.getByText("Illustrate the scene", { exact: true });
  await expect(firstRow).toBeVisible();
  // #886 — every action in this drive lives behind the row's disclosure now. Opened BEFORE recording, so the
  // fold's own (click-adjacent, free) shifts cannot be confused with the three movers the budget prices.
  await openRule(page, "Illustrate the scene");
  await recordShifts(page);

  // 1 — the dry run. Its verdict is inserted between the row's controls and its fire log.
  await page.getByRole("button", { name: "Test Illustrate the scene" }).click();
  await testHold.requested;
  await letInputWindowLapse();
  testHold.release({ predicate: true, arms: [{ type: "generate_image", renderedPreview: "a moody scenario shot" }] });
  await expect(page.getByRole("status", { name: "Test result for Illustrate the scene" })).toBeVisible();
  await letInputWindowLapse();

  // 2 — the fire log. A two-line skeleton stands in for twelve two-line rows.
  await page.getByRole("button", { name: "Recent activity for Illustrate the scene" }).click();
  await firesHold.requested;
  await letInputWindowLapse();
  firesHold.release(fires);
  await expect(page.getByText("It had already hit its own hourly cap — now 30 per hour.").first()).toBeVisible();
  await letInputWindowLapse();

  // 3 — a mint, with the list refetch arriving after the host has stopped touching anything.
  const topBeforeMint = await firstRow.evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY));
  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByRole("button", { name: "Periodic pacing nudge" }).click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await listHold.requested;
  await letInputWindowLapse();
  listHold.release([RULE, FREE_RULE]);
  await expect(page.getByText("Count the beats", { exact: true })).toBeVisible();
  await letInputWindowLapse();

  // DOCUMENT position, not the viewport's: opening the picker scrolls its trigger into view on a tall
  // section, and a scroll is not a layout shift — a viewport-relative top fails this fence on the scroll
  // alone (measured 37 -> -283 with no row having moved).
  // A minted rule APPENDS — `createRule` assigns `position = max+1` per call
  // (domain/automation/verbs/create-rule-from-preset.ts) and `listRules` orders by position — so the rows
  // a host is already reading do not move. A FENCE, not a defect proof: it is green on today's source,
  // and it REDs the day a list ordering flips to newest-first and jumps every row already on screen.
  await expect.poll(async () => firstRow.evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY))).toBe(topBeforeMint);

  // An observer that never attached reads back as the EMPTY ledger, which the liveness assertion below
  // then reports as "I could not measure" — never as "nothing moved".
  const ledger: ShiftLedger = await page.evaluate(() => (Reflect.get(globalThis, "__shiftLedger") as ShiftLedger | undefined) ?? { seen: 0, paid: [] });
  // THE READS BELOW ARE DELIBERATELY ONE-SHOT, AND POLLING THEM WOULD BE THE BUG. The drive is over and
  // the input window has lapsed twice since the last mutation, so the ledger is settled — while an
  // `expect.poll` on a GROWING accumulator against an upper bound passes on its first sample by
  // construction and can never fail (the un-failable-ordering class). A budget is asserted on the
  // FINAL total or not at all.
  //
  // LIVENESS FIRST: a run that saw no `layout-shift` entry AT ALL did not measure this surface — the
  // observer never attached, or the drive never reached a paint. A bare zero must not read as a pass.
  // ONESHOT-OK: the drive is over and two input-window lapses have passed since the last state change.
  expect(ledger.seen).toBeGreaterThan(0);
  const paid = ledger.paid;
  const total = paid.reduce((sum, shift) => sum + shift.value, 0);
  const movers = paid.map((shift) => `${shift.value.toFixed(5)} ${shift.movers.join(" + ")}`).join("\n");
  expect(total, `paid CLS ${total.toFixed(5)} over budget. Movers:\n${movers}`).toBeLessThanOrEqual(PAID_CLS_BUDGET);
});
// ── #1558 — the FOURTH row state: a rule whose stored actions cannot be READ ────────────────────────────
// `RuleView.actionsCorrupt` (#1422) had no client reader: the read seam projects `actions: []` for an
// unparseable blob AND for a rule nobody has added an arm to yet, so the two rendered identically with a
// live enable switch on top, and a rule that can never do anything read as benign until an event happened
// to dispatch it. These two pins assert through what a HOST meets — the badge word, the sentence, the
// engine's own `lastError`, and whether the enable control performs — never through the new flag's name.
// RED against the pre-fix source (measured 2026-09-05, cb-client-seams): the badge/sentence queries found
// nothing and the switch answered "Enable …" and fired `setRuleEnabled`.

/** The unreadable rule: `actionsCorrupt` TRUE, arms empty because they could not be parsed, still switched
 *  ON (the server's auto-disable is dispatch-time, so this is the state a host actually finds), and carrying
 *  the engine's reason from the last time it did dispatch. */
const UNREADABLE_RULE = {
  ...RULE,
  id: "automationrule_ct_corrupt",
  name: "Broken watcher",
  description: null,
  actions: [],
  actionsCorrupt: true,
  enabled: true,
  lastError: "actions: invalid discriminator value",
};

/** THE CONTRAST that makes the pin a difference rather than a decoration: same empty arm list, but empty
 *  BY CONFIGURATION. It must not wear the error anatomy, and it must keep its working enable door. */
const ARMLESS_RULE = {
  ...RULE,
  id: "automationrule_ct_armless",
  name: "Empty watcher",
  description: null,
  actions: [],
  actionsCorrupt: false,
  enabled: false,
  lastError: null,
};

const UNREADABLE_SENTENCE = "This rule can't run — what it was told to do can no longer be read. Remove it and add the rule again.";

test("an unreadable rule states its failure, quotes the engine's reason, and reads apart from an empty one", async ({ mount, page }) => {
  await stub(page, { rules: [UNREADABLE_RULE, ARMLESS_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  // Barrier on the SETTLED list — both rows rendered — before judging either one.
  await expect(page.getByText("Broken watcher", { exact: true })).toBeVisible();
  await expect(page.getByText("Empty watcher", { exact: true })).toBeVisible();

  // The verdict is a WORD, not intent colour alone, and the sentence names the one move that fixes it.
  await expect(page.getByText("Can't run", { exact: true })).toBeVisible();
  const notice = page.locator('[data-slot="rule-actions-unreadable"]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText(UNREADABLE_SENTENCE);
  // The engine's own reason rides the sentence — the only concrete detail a host can quote for help.
  await expect(notice).toContainText("actions: invalid discriminator value");

  // AND THE GLOSS STOPS LYING. With no description the fallback used to read "does nothing", which is a
  // claim about what the AUTHOR configured and is simply false of a blob that would not parse.
  await expect(page.getByText(/Broken watcher/u)).toBeVisible();
  await expect(page.getByText("Runs after each reply — but what it does can't be read.", { exact: true })).toBeVisible();
  await expect(page.getByText("Runs after each reply — does nothing.", { exact: true })).toBeVisible();

  // THE CONTRAST: exactly one row wears the error anatomy, and it is not the intentionally-empty one.
  await expect(page.getByText("Can't run", { exact: true })).toHaveCount(1);
});

test("an unreadable rule offers no enable door — the switch refuses and setRuleEnabled never fires", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [UNREADABLE_RULE, ARMLESS_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  await expect(page.getByText("Broken watcher", { exact: true })).toBeVisible();

  // The control announces the REFUSAL, not an action the surface will not perform — so "Enable Broken
  // watcher" must not be reachable by that name at all.
  await expect(page.getByRole("switch", { name: "Enable Broken watcher" })).toHaveCount(0);
  const refused = page.getByRole("switch", { name: `Can't enable "Broken watcher" — its saved actions can't be read` });
  await expect(refused).toBeVisible();
  // `readOnly`, not removed: the rule's REAL value stays legible, and a broken rule left switched ON is
  // precisely the state a host needs to see.
  await expect(refused).toHaveAttribute("aria-checked", "true");

  // PRESSING IT PERFORMS NOTHING. The settle is RENDERED (the sibling's own toggle round-trips), never the
  // request count alone — a count read before any request could have landed is not a settle.
  await refused.click();
  const working = page.getByRole("switch", { name: "Enable Empty watcher" });
  await working.click();
  await expect.poll(() => trpc.count("automation.setRuleEnabled")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.setRuleEnabled")).toMatchObject({ ruleId: "automationrule_ct_armless", enabled: true });
});

// ── #1655 — the OTHER door on the same rule ─────────────────────────────────────────────────────────────
// #1558 took the enable switch away from an unreadable rule and left Run-now standing in the overflow menu,
// so the row refused to switch the rule ON while still offering to RUN it. That offer cannot succeed:
// `engine/dispatch.ts::runRule` re-parses the blob, fails, and calls
// `disableRule(…, "auto-disabled: corrupt actions blob")` — pressing it turns the rule off behind the host's
// back — and on an already-disabled one `verbs/run-rule-now.ts` throws `rule_disabled` first. Every branch
// fails, which is the #924 dead end.
//
// ASSERTED THROUGH WHAT A HOST MEETS, never through the flag: the item's `aria-disabled`, the absence of a
// native `disabled` attribute (Base UI renders a disabled MenuItem as `div[role=menuitem][aria-disabled]`
// via `focusableWhenDisabled`, which is what lets `title` reach both hover AND the a11y tree — a tooltip on
// a disabled trigger would reach neither), the refusal SENTENCE, and a request counter with its own POSITIVE
// CONTROL: the armless rule's Run-now round-trips in the same mount, so a count of exactly 1 proves the
// corrupt row's door performed nothing rather than proving the stub was never wired.
// RED against the pre-fix source: the item answered `aria-disabled` absent, carried no `title`, and the
// count reached 2 with the corrupt rule's id last.
const RUN_REFUSAL = `Can't run "Broken watcher" — its saved actions can't be read`;

test("#1655 an unreadable rule refuses Run now too — the two doors agree, and runRuleNow never fires", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [UNREADABLE_RULE, ARMLESS_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  // SETTLED: both rows painted before either menu is judged.
  await expect(page.getByText("Broken watcher", { exact: true })).toBeVisible();
  await expect(page.getByText("Empty watcher", { exact: true })).toBeVisible();

  await openRuleMenu(page, "Broken watcher");
  const refused = page.getByRole("menuitem", { name: "Run now", exact: true });
  await expect(refused).toBeVisible();
  await expect(refused).toHaveAttribute("aria-disabled", "true");
  // NOT the native attribute — that arm swallows hover, and with it the reason.
  await expect(refused).not.toHaveAttribute("disabled", /.*/u);
  // The reason is the enable control's own refusal in the same grammar, and it reaches the a11y tree as the
  // item's description rather than living only in a hover affordance.
  await expect(refused).toHaveAttribute("title", RUN_REFUSAL);
  // …and it does not offer to SPEND on a rule that cannot act: the spend wording belongs to a readable rule.
  await expect(page.getByRole("menuitem", { name: /spends a model call/u })).toHaveCount(0);
  // Base UI blocks activation on an `aria-disabled` item; `force` bypasses Playwright's actionability check
  // so the press is really attempted rather than skipped.
  await refused.click({ force: true });

  // THE POSITIVE CONTROL, in the same mount: the intentionally-empty rule's door still works.
  await page.keyboard.press("Escape");
  await openRuleMenu(page, "Empty watcher");
  await page.getByRole("menuitem", { name: "Run now", exact: true }).click();
  await expect.poll(() => trpc.count("automation.runRuleNow")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.runRuleNow")).toMatchObject({ ruleId: "automationrule_ct_armless" });
});

// ── #1673 — the THIRD rule the Run-now door cannot serve: the draft rewriter ────────────────────────────
// A `transform_draft` rule does not dispatch at all; it registers a `PromptTransform` into chat's turn
// pipeline (`engine/prompt-transforms.ts`), the engine skips it by name (`engine/dispatch.ts::runRule`),
// `substrate/run-now.ts::dispatchRuleNow` therefore returns `null`, and `verbs/run-rule-now.ts` turns that
// into a typed `transform_not_runnable`. The menu offered it anyway, so pressing it could only ever produce
// an error toast — #1655's dead end wearing a different arm type.
//
// AND THIS RULE IS OTHERWISE HEALTHY, which is the contrast that makes the pin a difference rather than a
// decoration: unlike the unreadable rule it keeps its enable switch, its Test button and its Delete, and
// only the one door that cannot succeed is refused.
// RED against the pre-fix source: the item answered `aria-disabled` absent, carried no `title`, and the
// count reached 2 with the transform rule's id last.

/** A draft-rewriting rule: a single `transform_draft` arm, which is the shape validation guarantees (a rule
 *  carrying one transform arm carries ONLY transform arms). Enabled and readable — nothing else is wrong. */
const TRANSFORM_RULE = {
  ...RULE,
  id: "automationrule_ct_transform",
  name: "Polish my draft",
  description: null,
  actions: [{ type: "transform_draft" }],
  actionsCorrupt: false,
  enabled: true,
  lastError: null,
};

const TRANSFORM_REFUSAL = `Can't run "Polish my draft" — it rewrites your draft while a reply is being built, so there's nothing to run out of turn`;

test("#1673 a draft-rewriting rule refuses Run now — and keeps every affordance that DOES work", async ({ mount, page }) => {
  const trpc = await stub(page, { rules: [TRANSFORM_RULE, ARMLESS_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);
  // SETTLED: both rows painted before either menu is judged.
  await expect(page.getByText("Polish my draft", { exact: true })).toBeVisible();
  await expect(page.getByText("Empty watcher", { exact: true })).toBeVisible();

  // THE CONTRAST FIRST: this rule is not broken, so the controls that can act are untouched — no `readOnly`
  // switch, no error badge, a live Test.
  await expect(page.getByRole("switch", { name: "Enable Polish my draft" })).toBeVisible();
  await openRule(page, "Polish my draft");
  await expect(page.getByRole("button", { name: "Test Polish my draft" })).toBeEnabled();
  await expect(page.getByText("Can't run", { exact: true })).toHaveCount(0);

  await openRuleMenu(page, "Polish my draft");
  const refused = page.getByRole("menuitem", { name: "Run now", exact: true });
  await expect(refused).toBeVisible();
  await expect(refused).toHaveAttribute("aria-disabled", "true");
  await expect(refused).not.toHaveAttribute("disabled", /.*/u);
  // The reason is the server's own refusal in the host's words, never the wire code.
  await expect(refused).toHaveAttribute("title", TRANSFORM_REFUSAL);
  await refused.click({ force: true });

  // THE POSITIVE CONTROL, in the same mount: a dispatchable rule's door still works, so a count of exactly
  // 1 proves the refused one performed nothing rather than proving the stub was never wired.
  await page.keyboard.press("Escape");
  await openRuleMenu(page, "Empty watcher");
  await page.getByRole("menuitem", { name: "Run now", exact: true }).click();
  await expect.poll(() => trpc.count("automation.runRuleNow")).toBe(1);
  await expect.poll(() => trpc.lastInput("automation.runRuleNow")).toMatchObject({ ruleId: "automationrule_ct_armless" });
});

// ── #886 — THE ROW WEARS THE FIELD-OVERRIDES IDIOM ─────────────────────────────────────────────────────
// Owner ruling 2026-09-06 on side-eye `docs/reviews/side-eye/2026-08-30-this-chat-cls.md` (§5-P3-Rules and
// the §7 taste finding): "collapse Injections + Rules to the Field-overrides idiom". #821 did the injection
// rows and moved this section ~800px UP the pane, into the viewport its +519px desktop / +1063px mobile
// under-reserve had been hiding from.
//
// EVERY PIN BELOW ASSERTS THROUGH WHAT A HOST MEETS — the visible summary, the reachable controls, the
// measured box — never through the new `open` state or a testid. Red-first receipts (measured 2026-09-05,
// cb-injections-idiom, by restoring `rule-row.tsx` + `rules-section.tsx` to ca853697c): the closed-face pin
// failed on "Test Illustrate the scene" being VISIBLE with the row shut, `ruleDisclosure` resolved nothing
// at all (there was no row trigger to press, so `openRule` timed out), and the settled section measured
// 764px at 367px / 1,166px at 411px against the budgets below.
//
// The one pin here that is a FENCE and not a defect proof is the corrupt-state arm: the unreadable badge +
// sentence were already visible pre-#886 (the row had no closed face to hide them behind). It is kept
// because the collapse is exactly the change that could have swallowed them, and it is labelled honestly.

/** Three rules — the fixture the CLS review measured (`§Rules 185→704` desktop / `233→1296` mobile). */
const THREE_RULES = [RULE, FREE_RULE, { ...FREE_RULE, id: "automationrule_ct3", name: "Watch the clock", lastFiredAt: null }];

/** The two REAL context-panel widths the review measured the section at — the docked pane at desktop and at
 *  430px mobile. Not the CT's roomy default: a collapse that only pays off wide is not a fix. */
const REVIEW_WIDTHS = { desktop: 367, mobile: 411 } as const;

/** The settled ceiling for three rules, per width. The review measured 704 / 1,296; the collapse must beat
 *  those by enough that the number is a RESULT and not a rounding. Measured after the fix at 367px/411px
 *  (see the receipts in the report); the budget carries ~15% headroom for a token retune. */
const SETTLED_CEILING_PX = { desktop: 420, mobile: 520 } as const;

test("#886: a CLOSED rule row is name + gloss + state + the enable switch, and nothing that acts", async ({ mount, page }) => {
  await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);

  // The closed face carries the whole of what a rule IS — the #621 trio, unchanged.
  await expect(page.getByText("Illustrate the scene", { exact: true })).toBeVisible();
  await expect(page.getByText("Generate a picture of the current scene on a cadence, and post it into the room.")).toBeVisible();
  await expect(page.getByText("Hasn't run yet.")).toBeVisible();
  // …plus the ONE control a host scanning a list is asking about. It is not destructive and it does not spend.
  await expect(page.getByRole("switch", { name: "Enable Illustrate the scene" })).toBeVisible();

  // …and nothing that ACTS is one press from a scan-list any more.
  await expect(page.getByRole("button", { name: "Test Illustrate the scene" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More actions for Illustrate the scene" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recent activity for Illustrate the scene" })).toHaveCount(0);
  await expect(page.getByText(OFFER_LABEL, { exact: true })).toHaveCount(0);
});

test("#886: opening the row returns every affordance at its #621 weight", async ({ mount, page }) => {
  await stub(page);
  await mount(<RulesSectionStory chatId={CHAT} />);
  await openRule(page, "Illustrate the scene");

  // Test: the free dry run, still the ONE primary in the cluster, still wearing the secondary skin.
  const testAction = page.getByRole("button", { name: "Test Illustrate the scene" });
  await expect(testAction).toBeVisible();
  await expect.poll(() => testAction.evaluate((el) => getComputedStyle(el).borderTopWidth)).not.toBe("0px");
  // The fire-log door and the B4 switch came back with it.
  await expect(page.getByRole("button", { name: "Recent activity for Illustrate the scene" })).toBeVisible();
  await expect(page.getByText(OFFER_LABEL, { exact: true })).toBeVisible();
  // Run-now still names its spend and still lives DEMOTED in the overflow; Delete still rides a confirm.
  await page.getByRole("button", { name: "More actions for Illustrate the scene" }).click();
  await expect(page.getByRole("menuitem", { name: "Run now — spends a model call" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toContainText('Delete "Illustrate the scene"?');
});

test("#886 FENCE: an unreadable rule still states its verdict with the row SHUT", async ({ mount, page }) => {
  // GREEN-BEFORE by construction (the pre-#886 row had no closed face at all), so this is a fence against the
  // collapse swallowing the one state a host must meet without opening anything — not a defect proof.
  await stub(page, { rules: [UNREADABLE_RULE] });
  await mount(<RulesSectionStory chatId={CHAT} />);

  await expect(page.getByText("Can't run", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="rule-actions-unreadable"]')).toContainText(UNREADABLE_SENTENCE);
  // …and the refusing switch is on that same closed face.
  await expect(page.getByRole("switch", { name: `Can't enable "Broken watcher" — its saved actions can't be read` })).toBeVisible();
});

test.describe("#886: coarse pointer — the row's own disclosure meets the touch floor", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 900 } });

  test("the rule row is pressable with a finger at the mobile context width", async ({ mount, page }) => {
    // Settled snapshot: pointer class is fixed when the browser CONTEXT is created, not by page state.
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page);
    await mount(<RulesSectionStory chatId={CHAT} width={REVIEW_WIDTHS.mobile} />);

    const floor = await touchFloorPx(page);
    expect(floor).toBeGreaterThanOrEqual(WCAG_TOUCH_FLOOR_PX);
    const disclosure = ruleDisclosure(page, "Illustrate the scene");
    await expect(disclosure).toBeVisible();
    // THE BOX, not `hitExtent`: `size="control"` is a real `min-h-control-sm`, so the box IS the target.
    await expect.poll(async () => (await disclosure.boundingBox())?.height, { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
  });
});

for (const [arm, width] of Object.entries(REVIEW_WIDTHS)) {
  test(`#886: three rules settle under the ceiling at the ${arm} context width (${width}px)`, async ({ mount, page }) => {
    await stub(page, { rules: THREE_RULES });
    const component = await mount(<RulesSectionStory chatId={CHAT} width={width} />);

    // SETTLED: all three rows painted, and the picker trigger below them, before the box is read.
    await expect(page.getByText("Illustrate the scene", { exact: true })).toBeVisible();
    await expect(page.getByText("Count the beats", { exact: true })).toBeVisible();
    await expect(page.getByText("Watch the clock", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a rule", exact: true })).toBeVisible();

    // THE BOX IS THE PANE, not the viewport — the positive control for the height read below. Both review
    // widths wrap the glosses to the same line count, so the two arms legitimately measure the same height;
    // without this the pair would read identically for the WRONG reason (a mount root sized by the 1280px
    // CT viewport) and neither arm would be about its width at all.
    await expect.poll(async () => Math.round((await component.boundingBox())?.width ?? 0)).toBe(width);

    const ceiling = SETTLED_CEILING_PX[arm as keyof typeof SETTLED_CEILING_PX];
    await expect.poll(async () => Math.round((await component.boundingBox())?.height ?? 0), { intervals: [20, 50, 100, 200] }).toBeLessThanOrEqual(ceiling);
    await component.screenshot({ path: ctSnapPath(`cbii-rules-3-${arm}`) });
  });
}
