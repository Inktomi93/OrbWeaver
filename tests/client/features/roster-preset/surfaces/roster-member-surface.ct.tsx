// The saved-roster EDITOR (the library's content half) — the side-eye 2026-08-29 pins (#812/#813): the
// MEMBERS/RULES groupings are real headings (the editor had exactly ONE heading, so heading navigation
// gave an SR user one stop in a two-section surface), a member's talkativeness is spelled the way the
// ROOM's own Members tab spells it (`0.5` here vs "talks at level 50 of 100" there was one concept with
// two scales and two vocabularies), each stored rule shows the resolved KNOBS that distinguish two rosters
// carrying the same preset, and the editor's Start door reports what it applied + names the room.
//
// The write semantics (full-replace rename echoing members AND rules) are the server tier's —
// tests/server/domain/roster-preset — a CT fixture cannot honestly reach them.

import type { RulePresetView } from "@orb/contracts/automation";
import { expect, test } from "@playwright/experimental-ct-react";
import { measureContentColumn } from "../../../../support/ct/measure-content-column.ts";
import { readProseMeasure } from "../../../../support/ct/prose-measure.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { RosterMemberContentColumnStory, RosterMemberEditorStory, RosterMemberEditorTwoWritersStory } from "../_ct-stories.tsx";

/** `rosterPreset.get`'s view, narrowed to what the editor reads. The stored rule carries a NON-DEFAULT
 *  `everyN` (the catalogue default is 8) — the datum every surface used to collapse to "2 rules". */
const ROSTER_VIEW = {
  id: "roster_preset_ct_a",
  name: "Adventuring Roster",
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
    { key: "steer", kind: "text", label: "Nudge", default: "Take stock of the pacing.", minLength: 1, maxLength: 400 },
  ],
};

test("the editor's groupings are real headings, its rules show their resolved knobs, and talkativeness is the room's own spelling", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.get": ROSTER_VIEW, "automation.listRulePresets": [PACING_PRESET] });

  await mount(<RosterMemberEditorStory />);

  // Heading navigation: the roster name (h2) plus one heading per grouping.
  await expect(page.getByRole("heading", { level: 2, name: "Adventuring Roster" })).toBeVisible();
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

test("the editor's Start door reports what it applied and names the room after the roster", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "rosterPreset.get": ROSTER_VIEW,
    "automation.listRulePresets": [PACING_PRESET],
    "chat.startChat": { chat: { id: "chat_started_ct", viewerIsHost: true, participants: [] } },
    "rosterPreset.applyToChat": {
      added: ["character_ct_1", "character_ct_2"],
      alreadyPresent: [],
      skipped: [],
      configApplied: false,
      rulesMinted: ["pacingNudge"],
      rulesAlreadyPresent: [],
      rulesSkipped: [{ rulePresetId: "loreAutoAdd", reason: "this chat has no world book attached" }],
    },
  });

  await mount(<RosterMemberEditorStory />);
  await page.getByRole("button", { name: "Start chat", exact: true }).click();

  const notice = page.getByTestId("cbcf-notice");
  await expect(notice).toContainText("Adventuring Roster:");
  await expect(notice).toContainText("1 rule on");
  await expect(notice).toContainText("this chat has no world book attached");
  await expect.poll(() => trpc.lastInput("chat.startChat")).toMatchObject({ title: "Adventuring Roster" });
});

// ── THE ROSTER ROW MOVING UNDER AN OPEN EDITOR (#1561 — the third site of the class) ─────────────────
// The name/description drafts are seeded ONCE from the loaded row, and `dirty` — which gates the surface's
// one write affordance — compared them against the LIVE row. So a second writer renaming the roster lit
// Save up on an editor nobody had touched, and pressing it would have sent the opened-with name back over
// what arrived. Same shape as `tracker-value.tsx` (#1485) and `rpg-beat-row.tsx` (#1502/#1559), in its
// save-button form; the judge is now the value at OPEN time.

/** The same roster after a second writer renamed it. */
const RENAMED_VIEW = { ...ROSTER_VIEW, name: "The Lantern Crew", updatedAt: 2 };

// A FENCE, not a defect proof, and labelled as one (#1587). The two text cells carried
// `aria-label="Roster name"` / `"Roster description"` beside a `<Field label="Name">` / `"Description"`, and
// the Field's `aria-labelledby` OUTRANKS `aria-label` — so those attributes named nothing and the announced
// names were already the Field's. This assertion therefore passed BEFORE the attributes were removed as well
// as after; what it buys is that the next author who adds an `aria-label` here to change the announced name
// discovers immediately that it does not, instead of shipping a name only the source claims.
test("the text cells announce their FIELD labels — an aria-label beside a Field label names nothing (#1587)", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.get": ROSTER_VIEW, "automation.listRulePresets": [PACING_PRESET] });
  await mount(<RosterMemberEditorStory />);
  await expect(page.getByRole("heading", { level: 2, name: "Adventuring Roster" })).toBeVisible();

  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Description", exact: true })).toBeVisible();
  // The names the dead attributes claimed. Nothing answers to them — before or after the removal.
  await expect(page.getByRole("textbox", { name: "Roster name" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Roster description" })).toHaveCount(0);
});

test("an UNTOUCHED editor does not become dirty because the row moved underneath it (#1561)", async ({ mount, page }) => {
  // WHAT THE STUB ANSWERS NEXT, as a PUSHED array rather than a boolean flip: biome narrows a
  // `= false` initializer to the literal type and reds the later flip as an always-falsy condition,
  // and the `: boolean` that would fix that is itself `noInferrableTypes`. Data, not a flag.
  const rows: unknown[] = [ROSTER_VIEW];
  await routeTrpc(page, {
    "rosterPreset.get": (): unknown => rows.at(-1),
    "automation.listRulePresets": [PACING_PRESET],
    "rosterPreset.update": null,
  });
  const component = await mount(<RosterMemberEditorTwoWritersStory />);
  await expect(page.getByRole("heading", { level: 2, name: "Adventuring Roster" })).toBeVisible();
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();

  rows.push(RENAMED_VIEW);
  await component.getByRole("button", { name: "arrive rename" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "The Lantern Crew" })).toBeVisible();

  // THE DEFECT: `name !== roster.name` was true, so the one write affordance on the surface invited a press
  // that would have written "Adventuring Roster" back over the arrived name.
  await expect(save, "nothing was typed, so there is nothing to save however far the row has moved").toBeDisabled();
  await expect(component.locator('[data-slot="roster-editor-conflict"]')).toHaveCount(0);
});

test("…and a real edit racing a rename SAYS so beside the Save it changes (#1561)", async ({ mount, page }) => {
  // WHAT THE STUB ANSWERS NEXT, as a PUSHED array rather than a boolean flip: biome narrows a
  // `= false` initializer to the literal type and reds the later flip as an always-falsy condition,
  // and the `: boolean` that would fix that is itself `noInferrableTypes`. Data, not a flag.
  const rows: unknown[] = [ROSTER_VIEW];
  await routeTrpc(page, {
    "rosterPreset.get": (): unknown => rows.at(-1),
    "automation.listRulePresets": [PACING_PRESET],
    "rosterPreset.update": null,
  });
  const component = await mount(<RosterMemberEditorTwoWritersStory />);
  // Barrier on the SETTLED editor — the surface suspends on `rosterPreset.get`, so the fields do not exist
  // until the row has landed.
  await expect(page.getByRole("heading", { level: 2, name: "Adventuring Roster" })).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Adventuring Roster II");

  rows.push(RENAMED_VIEW);
  await component.getByRole("button", { name: "arrive rename" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "The Lantern Crew" })).toBeVisible();

  // Held, not resolved: Save stays live because saving is a DELIBERATE overwrite — what changes is that the
  // host is told what they are about to replace, rather than discovering it afterwards.
  const said = component.locator('[data-slot="roster-editor-conflict"]');
  await expect(said).toContainText("The Lantern Crew");
  await expect(said).toContainText("changed elsewhere while you were editing");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
});

// ── #1653 — the editor's two STANDALONE GLOSS PARAGRAPHS take the reading measure ───────────────────────
// Both live directly inside a `Section` rather than in a control `Row`, so nothing else was capping them:
// measured on this mount's real 480px container (real Geist, canvas `measureText` over each paragraph's own
// resolved font — the #1145 method, now read through the shared `tests/support/ct/prose-measure.ts`) they read 95.7
// and 95.4 LAW CHARACTERS against the 65-75 design band, while `--reading-measure-prose` resolves to 329px
// here. The cap rides the PARAGRAPH, never a wrapper: a CSS `ch` resolves in the element's OWN font, which
// is the #213/#1130 failure the prose token's contract names.
//
// THIS IS A DEFECT PROOF, NOT A FENCE — it fails on the unmodified source (95.7 / 95.4 > 75) and passes
// with the cap. Both paragraphs are loose prose, so no `justify` change rides with it (unlike the databank
// row this pin's sibling covers). The assertion is in the LAW's unit and ALSO on the token: a `ch`
// comparison alone would only restate the token, and a px comparison alone would not prove the derivation.

/** `.claude/skills/side-eye-design-review/SKILL.md` §2, in the law's own unit — never a px and never a
 *  token value, so passing proves the DERIVATION rather than restating it. */
const LAW_CHARACTERS_PER_LINE = 75;

// The measurement itself is the SHARED reading-measure reader's (#1683, `tests/support/ct/prose-measure.ts`):
// one home for "how many typographic characters does this paragraph render", so this pin and its siblings
// cannot drift apart. Each paragraph is still addressed by its own rendered COPY (no test-only attribute) —
// the reader matches on the OPENING, which is what these snippets already are.
const GLOSS_PARAGRAPHS = [
  { name: "the Members re-compose note", snippet: "To re-compose the roster" },
  { name: "the Rules apply note", snippet: "Applied with the roster" },
] as const;

test("#1653: the editor's standalone gloss paragraphs stay inside the reading measure", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.get": ROSTER_VIEW, "automation.listRulePresets": [PACING_PRESET] });
  await mount(<RosterMemberEditorStory />);
  // Barrier on the SETTLED editor — the surface suspends on `rosterPreset.get`, so neither paragraph exists
  // until the row has landed, and a box read before that is a box of zero.
  await expect(page.getByRole("heading", { level: 2, name: "Adventuring Roster" })).toBeVisible();
  await expect(page.locator('[data-slot="roster-rules"]')).toBeVisible();

  const rows: string[] = [];
  for (const paragraph of GLOSS_PARAGRAPHS) {
    const reading = await readProseMeasure(page, paragraph.snippet);
    rows.push(`${paragraph.name}\t${reading.widthPx.toFixed(1)}px\tlaw ${reading.lawCharacters.toFixed(1)}\ttoken ${reading.proseTokenPx.toFixed(1)}px`);
    // ON the token, not merely under some width: the paragraph must resolve THIS measure in its own font.
    expect(reading.widthPx, `#1653 ${paragraph.name}: ${rows.join(" | ")}`).toBeLessThanOrEqual(reading.proseTokenPx + 0.5);
    expect(reading.lawCharacters, `#1653 ${paragraph.name}: ${rows.join(" | ")}`).toBeLessThanOrEqual(LAW_CHARACTERS_PER_LINE);
  }
  // The rows ride every assertion message above, so a RED prints the measurement that earned it.
  expect(rows).toHaveLength(GLOSS_PARAGRAPHS.length);
});

// ── #1664 — THE CONTENT COLUMN TAKES ITS TOKEN'S WHOLE STATED CONSUMPTION ────────────────────────────
// `--width-content-col`'s `$description` says the column is CENTERED and BREATHES to
// `--width-content-col-wide` once its container clears `@5xl`; this editor spelled the bare cap, so it
// hard-clamped at 720px, left-pinned, inside panes measured live on the shell at 869px (list-only),
// 1176px (focus @1280) and 1816px (focus @1920) — the dead-void defect the breathe step was minted for.
// Asserted through the TOKENS, resolved by a probe inside the query container, so a token move carries
// the expectation with it and no px literal is written down. ONE mount, BOTH ends of the range plus the
// crossover: a point measurement cannot prove a range property.

test("the editor column is CENTERED, capped, and BREATHES past @5xl (#1664)", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.get": ROSTER_VIEW, "automation.listRulePresets": [PACING_PRESET] });
  await mount(<RosterMemberContentColumnStory />);
  await expect(page.getByRole("heading", { level: 2, name: "Adventuring Roster" })).toBeVisible();

  const column = page.locator('[data-slot="roster-member-editor"]');
  const narrow = await measureContentColumn(column);
  // BELOW `@5xl`: the cap binds, and the leftover is split evenly instead of all landing on the right.
  expect(narrow.containerWidth).toBeGreaterThan(narrow.capPx);
  expect(narrow.maxWidthPx).toBeCloseTo(narrow.capPx, 0);
  expect(narrow.columnWidth).toBeCloseTo(narrow.capPx, 0);
  expect(Math.abs(narrow.leftGutter - narrow.rightGutter)).toBeLessThanOrEqual(1);
  expect(narrow.leftGutter).toBeGreaterThan(1);

  await page.getByRole("button", { name: "widen the pane" }).click();
  // SETTLED, never same-tick: the widen is a React commit and the layout it causes is the thing measured.
  await expect.poll(async () => (await measureContentColumn(column)).containerWidth, { intervals: [20, 50, 100] }).toBeGreaterThan(narrow.containerWidth);

  const wide = await measureContentColumn(column);
  // PAST `@5xl`: the breathe engages, and it is a real step (the two tokens differ) — a column that
  // simply stretched, or one still clamped at the cap, both fail here.
  expect(wide.widePx).toBeGreaterThan(wide.capPx);
  expect(wide.maxWidthPx).toBeCloseTo(wide.widePx, 0);
  expect(wide.columnWidth).toBeCloseTo(wide.widePx, 0);
  expect(Math.abs(wide.leftGutter - wide.rightGutter)).toBeLessThanOrEqual(1);
});
