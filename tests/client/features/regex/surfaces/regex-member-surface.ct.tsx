// CT: the regex MEMBER EDITOR mounted in CONTENT (config-rail C-7). It replaces the settings pane's
// Dialog-in-a-modal without changing one field: the same authored set (name · find pattern · replace ·
// placement chips · enabled · run-on-edit) bound to the same autosave form, saving through the same
// `regex.updateScript` verb. The editor is autosave-ONLY now — DELETE converged onto the ROW's kebab
// (config-delete #271), where it already lived alongside Duplicate · Export; its wire proof is in
// `regex-collection-rows.ct.tsx`.
//
// The autosave writes are asserted at the WIRE (busDriven — the stubbed response doesn't refetch), the same
// way the retired pane CT did.

import { deriveRegexTierFlags } from "@orb/kit/regex";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { measureContentColumn } from "../../../../support/browser/measure-content-column.ts";
import { proseRow, readProseMeasure } from "../../../../support/browser/prose-measure.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { RegexMemberContentColumnStory, RegexMemberStory } from "../_ct-stories.tsx";

const RUN_ON_EDIT = /Run on edit/;

const SCRIPT = {
  id: "regex_script_stripooc",
  name: "strip ooc",
  findRegex: "\\(ooc\\)",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
  updatedAt: 1_760_000_000_000,
  substituteRegex: 0,
};

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => [],
    "regex.updateScript": () => SCRIPT,
  });
}

test("mounts the whole authored field set — no dialog, no lost field", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<RegexMemberStory />);
  // `exact` since REGX2: the pipeline debugger below names each stage after its script, so the editor's own
  // h2 and the subject's stage kicker ("1 · strip ooc this script…") both contain this name.
  await expect(editor.getByRole("heading", { name: "strip ooc", exact: true })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Name" })).toHaveValue("strip ooc");
  // `exact` because `getByText` is a case-insensitive SUBSTRING match and the Options group now carries
  // "Macros in the find pattern" — a second, deliberately explanatory label naming this very field.
  await expect(editor.getByText("Find pattern", { exact: true })).toBeVisible();
  // The pattern editor is a LAZY CodeMirror mount whose header once called itself "modal-only" — paneside
  // it must still arrive, or the one field whose syntax a user can get wrong has no editor at all.
  await expect(page.locator(".cm-editor")).toBeVisible();
  await expect(editor.getByText("Replace with")).toBeVisible();
  // `exact` for the same reason as the heading above: the pipeline debugger's own gloss copy contains the
  // substring "runs on", and `getByText` is a case-insensitive substring match.
  await expect(editor.getByText("Runs on", { exact: true })).toBeVisible();
  await expect(editor.getByRole("switch", { name: "Enabled" })).toBeVisible();
  await expect(editor.getByRole("switch", { name: RUN_ON_EDIT })).toBeVisible();
});

test("editing a field autosaves through updateScript with the tier flags DERIVED from the chips", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<RegexMemberStory />);
  await editor.getByRole("textbox", { name: "Name" }).fill("strip ooc lines");
  await expect
    .poll(() => (trpc.lastInput("regex.updateScript") as { readonly input?: { readonly name?: string } } | undefined)?.input?.name, {
      intervals: [50, 100, 250, 500],
      timeout: 5000,
    })
    .toBe("strip ooc lines");
  // The one tier-flag write boundary: `markdownOnly`/`promptOnly` are re-derived from `placement` on every
  // save (never authored), so the pair can never contradict the chips. This fixture's placement is
  // AI_OUTPUT only — `withDerivedTierFlags`' output-only arm — and the assertion is that the SAVE carries
  // that derivation rather than the row's stored flags.
  const input = trpc.lastInput("regex.updateScript") as { readonly input: { readonly markdownOnly: boolean; readonly promptOnly: boolean } };
  expect({ markdownOnly: input.input.markdownOnly, promptOnly: input.input.promptOnly }).toEqual(deriveRegexTierFlags(["AI_OUTPUT"]));
});

// ── THE EPHEMERAL LEG'S DEPTH SCOPE ─────────────────────────────────────────────────────────────────────
// `historyDepth` exists IFF the script runs on `PROMPT_HISTORY` — the contract refuses either half alone.
// The editor keeps that true on SCREEN: the two bounds are mounted by the chip and unmounted with it, so
// there is no state in which a user can set a depth that governs nothing. These pin both directions plus
// the save the derivation writes.

const HISTORY_CHIP = "History sent to the model";
const DEPTH_FROM = "From (messages back)";
const DEPTH_TO = "To (messages back)";

/** The `historyDepth` the last autosave carried (undefined = the key was absent, which is the point). */
function savedDepth(trpc: TrpcRecorder): unknown {
  const call = trpc.lastInput("regex.updateScript") as { readonly input?: Record<string, unknown> } | undefined;
  return call?.input?.["historyDepth"];
}

test("the depth bounds do not exist until the script runs on the history leg", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<RegexMemberStory />);
  // The fixture runs on AI_OUTPUT only: a persist-time leg, which HAS no depth.
  await expect(editor.getByRole("textbox", { name: DEPTH_FROM })).toHaveCount(0);
  await expect(editor.getByRole("textbox", { name: DEPTH_TO })).toHaveCount(0);

  await editor.getByRole("button", { name: HISTORY_CHIP }).click();
  await expect(editor.getByRole("textbox", { name: DEPTH_FROM })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: DEPTH_TO })).toBeVisible();
  // Adding the leg mints the whole-history scope at the one save boundary.
  await expect.poll(() => savedDepth(trpc), { intervals: [50, 100, 250, 500], timeout: 5000 }).toEqual({ min: 0, max: null });
});

test("a narrowed bound rides the save; dropping the chip drops the controls AND the stored scope", async ({ mount, page }) => {
  const trpc = await stub(page);
  const editor = await mount(<RegexMemberStory />);
  await editor.getByRole("button", { name: HISTORY_CHIP }).click();
  await editor.getByRole("textbox", { name: DEPTH_FROM }).fill("3");
  await expect.poll(() => savedDepth(trpc), { intervals: [50, 100, 250, 500], timeout: 5000 }).toEqual({ min: 3, max: null });

  await editor.getByRole("button", { name: HISTORY_CHIP }).click();
  await expect(editor.getByRole("textbox", { name: DEPTH_FROM })).toHaveCount(0);
  await expect.poll(() => savedDepth(trpc), { intervals: [50, 100, 250, 500], timeout: 5000 }).toBeUndefined();
});

// DELETE IS NO LONGER A BUTTON IN THIS EDITOR — it converged onto the row's kebab (config-delete #271). The
// editor's own destructive control is gone; its absence here is the other half of that convergence's proof.
test("the editor carries no Delete button — the row's kebab owns that verb now", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<RegexMemberStory />);
  await expect(editor.getByRole("heading", { name: "strip ooc", exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("a deleted member says so instead of rendering a dead form", async ({ mount, page }) => {
  await stub(page);
  const editor = await mount(<RegexMemberStory memberId="regex_script_gone" />);
  await expect(editor.getByText("Script not found")).toBeVisible();
});

// ── THE TESTER (ST `Test Mode` parity) ────────────────────────────────────────────────────────────────
//
// Before this, the editor could author a pattern and offered NO way to see it bite: you saved, opened a
// chat, sent a turn, and read the transcript. These pins are the affordance's proof-of-life, and they
// assert through what the user sees — the Result field's value and the status line — never through the
// preview function. That the engine underneath AGREES with production (because it IS production,
// `@orb/kit/regex`) is pinned separately at tests/client/features/regex/lib/regex-preview.test.ts.

/** The first words of the tester's seeded sample — restated here rather than imported, so the CT pins what
 *  a user actually finds in the box (and never drags client runtime into the node-side spec). */
const SAMPLE_LEAD = "The goblin snarls";

/** The result box mirrors the sample box (`rows={3}` each); both auto-grow with content, so the floor is a
 *  proportion of the input's height rather than equality. */
const SAME_BOX_FLOOR = 0.9;

/** The two status strings the panel builds at runtime (a compile failure, and the never-fires caveat) —
 *  matched loosely, since the sentence around them is copy and the fact is what is pinned. */
const CANNOT_RUN = /This pattern can't run:/;
const NO_STREAMS = /no streams are selected/;

/** The same stub, on a VARIANT of the fixture row (same id, so the story's default member still resolves). */
function stubOn(page: Page, over: Record<string, unknown>): Promise<TrpcRecorder> {
  const script = { ...SCRIPT, ...over };
  return routeTrpc(page, {
    "regex.listScripts": () => [script],
    "regex.listGlobal": () => [],
    "regex.updateScript": () => script,
  });
}

test("the editor mounts a live tester, already carrying a sample to run against", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexMemberStory />);

  // The empty arm of a tester is a tester nobody can use: it ships with a sample, so the panel demonstrates
  // rather than asking the user to invent a fixture.
  await expect(page.getByLabel("Sample text")).toHaveValue(new RegExp(SAMPLE_LEAD));
  // `\(ooc\)` does not appear in that sample, so the honest reading is "nothing happened" — and the result
  // is the sample UNCHANGED, which is exactly what production does with a non-matching script.
  await expect(page.getByText("No matches in this sample.")).toBeVisible();
  await expect(page.getByLabel("Result")).toHaveValue(new RegExp(SAMPLE_LEAD));

  // AND IT IS ACTUALLY READABLE. The result box is a read-only control at the bottom of a scrolling pane —
  // the shape that collapses to a sliver without anything failing. Asserted as a RELATION to the input it
  // mirrors (both are `rows={3}`), never a px literal.
  const inputBox = await page.getByLabel("Sample text").boundingBox();
  const resultBox = await page.getByLabel("Result").boundingBox();
  expect(resultBox?.height ?? 0).toBeGreaterThanOrEqual((inputBox?.height ?? 0) * SAME_BOX_FLOOR);
});

test("the tester runs the real engine over what you type, and says how many times it bit", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexMemberStory />);

  await page.getByLabel("Sample text").fill("hello (ooc) there (ooc)");
  // `\(ooc\)` → "" (this row's replaceString is empty): the two parenthesised asides are gone.
  await expect(page.getByLabel("Result")).toHaveValue("hello  there ");
  // The count comes from the production replacer firing, and the flags are the ones the executor really
  // compiled with — `gm` for a bare pattern, because `@orb/kit/regex` forces `g` and defaults to multiline.
  await expect(page.getByText("2 matches · flags gm")).toBeVisible();
});

test("a pattern that cannot compile says so instead of silently doing nothing", async ({ mount, page }) => {
  await stubOn(page, { findRegex: "(unclosed" });
  await mount(<RegexMemberStory />);
  await expect(page.getByText(CANNOT_RUN)).toBeVisible();
});

// THE F3 CLASS, CAUGHT AT AUTHORING TIME. The tester's probe deliberately ignores `enabled`/`placement` so
// a draft still previews — which would be a lie if the panel stopped there, because a script with no
// streams selected can never fire in a chat no matter how well it tests here.
test("the tester says when the script it just ran would never run in a chat", async ({ mount, page }) => {
  await stubOn(page, { placement: [] });
  await mount(<RegexMemberStory />);
  await expect(page.getByText(NO_STREAMS)).toBeVisible();
});

// ── TRIM OUT + MACROS IN THE FIND PATTERN (ST parity for two knobs that had no control) ───────────────
//
// Both were in the schema and honoured by the executor since the library landed, and neither had a control
// anywhere in the app — so they could only ever arrive on an imported ST card, and an in-app author could
// not see, let alone change, what an imported script was doing.

test("Trim out is authorable, bound to the row, and visibly changes what the engine produces", async ({ mount, page }) => {
  await stubOn(page, { findRegex: "\\[(.+?)\\]", replaceString: "$1", trimStrings: ["ooc: "] });
  await mount(<RegexMemberStory />);

  // The row's stored trim list is IN the control (one per line) …
  await expect(page.getByLabel("Trim out")).toHaveValue("ooc: ");
  await page.getByLabel("Sample text").fill("[ooc: be brief]");
  await expect(page.getByLabel("Result")).toHaveValue("be brief");

  // … and editing it moves the result, which is the pin that the tester reads LIVE form state and not the
  // server row it was opened on.
  await page.getByLabel("Trim out").fill("");
  await expect(page.getByLabel("Result")).toHaveValue("ooc: be brief");
});

test("the macro-substitution mode is authorable and shows the row's stored mode", async ({ mount, page }) => {
  await stubOn(page, { findRegex: "{{char}}", replaceString: "THEM", substituteRegex: 1 });
  await mount(<RegexMemberStory />);
  // By ROLE, not by label: Base UI's Select renders a hidden form input carrying the same accessible name
  // as the trigger, so a bare `getByLabel` matches two nodes.
  await expect(page.getByRole("combobox", { name: "Macros in the find pattern" })).toContainText("Resolve macros first");

  // And it is honoured by the tester: `{{char}}` in the PATTERN resolves to the preview's sample character
  // before compiling, so the sample's literal name matches.
  await page.getByLabel("Sample text").fill("Aria waves");
  await expect(page.getByLabel("Result")).toHaveValue("THEM waves");
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
  await stub(page);
  const editor = await mount(<RegexMemberContentColumnStory />);
  await expect(editor.getByRole("heading", { name: "strip ooc", exact: true })).toBeVisible();

  const column = page.locator('[data-slot="regex-member-editor"]');
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

// ── #1653 — the editor's LONGEST teaching copy is a `<Field>` description, and it had no measure ────────
// The prose measure was spelled on the Field primitive's `description` slot ONLY inside the
// `align:"track" + orientation:"horizontal"` compound variant; the BASE slot carried none, so every
// DEFAULT `<Field description=…>` rendered `max-width: none`. This editor has two of the app's longest
// (the trim-strings and macro-substitution glosses), and the sibling tag editor's folder-type description
// measured 124.6 law characters pre-fix — against the design law's 65-75 band.
//
// The fix is in the primitive, because `Field` exposes no per-site className for its description slot; this
// pin is the proof that it reaches a real editor at that editor's real mount.
const PROSE_WIDTHS = [1280, 1440, 1920] as const;
/** `.claude/skills/side-eye-design-review/SKILL.md` §2, in the law's own unit — never a px, never a token. */
const LAW_CHARACTERS_PER_LINE = 75;
/** The trim-strings description's own opening — the longest running copy in this editor. */
const TRIM_DESCRIPTION = "Text stripped from every match";

test("#1653 the trim-strings description reads inside the prose measure at every desktop width", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexMemberStory />);
  // SETTLED: the editor's own heading has painted before anything is measured. `exact` because the pipeline
  // debugger's stage kicker also carries this script's name.
  await expect(page.getByRole("heading", { name: "strip ooc", exact: true })).toBeVisible();
  await expect(page.getByText(TRIM_DESCRIPTION, { exact: false })).toBeVisible();

  const rows: string[] = [];
  for (const width of PROSE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // Barrier on a SETTLED box — a read on the same tick as the viewport change is the pre-reflow one.
    await expect.poll(async () => Math.round((await readProseMeasure(page, TRIM_DESCRIPTION)).widthPx)).toBeGreaterThan(0);
    const reading = await readProseMeasure(page, TRIM_DESCRIPTION);
    rows.push(proseRow(width, reading));
    // ON the token, not merely under some width: the description must resolve THIS measure in its own font.
    expect(reading.widthPx, `#1653 regex at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(reading.proseTokenPx + 0.5);
    expect(reading.lawCharacters, `#1653 regex at ${String(width)}: ${rows.join(" | ")}`).toBeLessThanOrEqual(LAW_CHARACTERS_PER_LINE);
  }
  expect(rows).toHaveLength(PROSE_WIDTHS.length);
});
