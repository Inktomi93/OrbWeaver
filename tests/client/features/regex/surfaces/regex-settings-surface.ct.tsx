// CT: the real Regex settings pane (regex-settings-surface.tsx — the D121-E script LIBRARY). Drives the
// production CRUD path: `regex.listScripts` seeds the list, `regex.listGlobal` seeds the GLOBAL switches,
// Add fires `regex.createScript` and opens the shared editor on the returned row, and the global switch
// fires `regex.attachGlobal`/`detachGlobal`. Assertions anchor to the real accessible names + the WIRE call
// (busDriven — the stubbed response doesn't refetch, so the check is the CALL, exactly like the Tags/System
// pane CTs).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { RegexSettingsStory } from "../_ct-stories";

const SCRIPT = {
  id: "regex_script_0000000000000001",
  name: "strip ooc",
  findRegex: "\\(ooc\\)",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: 0,
};

const CREATED = { ...SCRIPT, id: "regex_script_0000000000000002", name: "New script" };

const CREATE_PROC = "regex.createScript";
const ATTACH_PROC = "regex.attachGlobal";
const DETACH_PROC = "regex.detachGlobal";
const REMOVE_PROC = "regex.removeScript";

/** Two controls are "on the same row" when their tops agree within a fraction of a control height. */
const ROW_ALIGNMENT_PX = 16;

function stub(page: Page, globals: readonly unknown[] = []): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => globals,
    [CREATE_PROC]: () => CREATED,
    [ATTACH_PROC]: () => null,
    [DETACH_PROC]: () => ({ detached: true }),
    "regex.updateScript": () => SCRIPT,
    "regex.removeScript": () => ({ deleted: true }),
  });
}

test("lists the owner's library rows", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  await expect(page.getByText("strip ooc").first()).toBeVisible();
});

// THE ROW'S SCENT DISCRIMINATES (side-eye X-15/X-16). It used to print `on · attached only` — the scope,
// which is now the row's own switch, and which every default row shares anyway — so a library of
// freshly-added scripts was N identical subtitles under N identical names ("New script"). The FIND PATTERN
// is the one authored field that tells two scripts apart.
test("a row's subtitle leads with its find pattern, not with a fact every row shares", async ({ mount, page }) => {
  await stub(page, []);
  await mount(<RegexSettingsStory />);
  await expect(page.getByText(SCRIPT.findRegex, { exact: false }).first()).toBeVisible();
  // The scope word is GONE from the subtitle: it is stated by the switch on the same row (X-6), and a
  // state printed beside the control that edits it is the doubling this pass removed.
  await expect(page.getByText("attached only")).toHaveCount(0);
});

// THE PANE NAMES ITSELF (side-eye X-5, `flat-type-hierarchy` §6). Every text node on this pane was the
// same 10.5px muted step — heading, helper, empty state — because its only content was an EntryListEditor,
// which correctly renders its group name as a kicker. Beside Personas / Tags / Chat behavior, each opening
// with a 16px white title, the pane read unlabeled. Asserted as a RELATION between the two live headings,
// never a px literal: the section title must outrank the group kicker under it.
test("the pane opens with a section title that outranks the group kicker", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  // BARRIER on the SETTLED pane: the surface suspends behind a QueryBoundary whose fallback replaces the
  // whole body, headings included — measuring before it resolves reads an empty type census, not a flat one.
  await expect(page.getByText(SCRIPT.name).first()).toBeVisible();
  const sizes = await page.evaluate(() => {
    const headings = [...document.querySelectorAll("h3")];
    const read = (text: string): number => {
      const found = headings.find((h) => h.textContent?.trim() === text);
      return found === undefined ? 0 : Number.parseFloat(getComputedStyle(found).fontSize);
    };
    return { title: read("Regex scripts"), kicker: read("Scripts") };
  });
  expect(sizes.kicker).toBeGreaterThan(0);
  expect(sizes.title).toBeGreaterThan(sizes.kicker);
});

// ONE ROW PER SCRIPT (side-eye X-6). The pane listed every script TWICE — a `SCRIPTS` list and, ~400px
// lower, a name-only `RUNS EVERYWHERE` list of the SAME rows carrying the global switches. The global
// scope is a property of the row, so it rides the row.
test("each script appears ONCE, with its global switch on its own row", async ({ mount, page }) => {
  await stub(page, []);
  await mount(<RegexSettingsStory />);
  await expect(page.getByText(SCRIPT.name, { exact: true })).toHaveCount(1);
  await expect(page.getByText("Runs everywhere")).toHaveCount(0);
  const rowSwitch = page.getByRole("switch", { name: `${SCRIPT.name} runs in every chat` });
  await expect(rowSwitch).toHaveCount(1);
  // …on the same row as its Remove, which is what "on the row" means geometrically.
  const geometry = await page.evaluate((name) => {
    const control = document.querySelector(`[aria-label="${name} runs in every chat"]`);
    const remove = document.querySelector(`[aria-label="Remove ${name}"]`);
    if (control === null || remove === null) {
      return null;
    }
    return { control: control.getBoundingClientRect().top, remove: remove.getBoundingClientRect().top };
  }, SCRIPT.name);
  expect(geometry).not.toBeNull();
  expect(Math.abs((geometry?.control ?? 0) - (geometry?.remove ?? 0))).toBeLessThan(ROW_ALIGNMENT_PX);
});

// DESTRUCTIVE MEANS CONFIRMED (side-eye X-3). `Remove` deleted a library row on the first click — no
// alertdialog, no undo, no destructive styling — and a regex script may be attached to N presets,
// characters and rooms, all of which the delete silently detaches.
test("Remove asks first, names the script, and only then deletes", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RegexSettingsStory />);
  await page.getByRole("button", { name: `Remove ${SCRIPT.name}` }).click();

  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(SCRIPT.name);
  // The consequence, not just "are you sure" — the detach is the part the user cannot see.
  await expect(confirm).toContainText("every preset, character, and room");
  // NOTHING HAS HAPPENED YET, stated as the rendered fact rather than a wire read: the row is still listed
  // behind the dialog. (A live-read assertion for an ABSENT call is also the `ct-no-oneshot` shape — a
  // one-shot read of a value that has not settled.)
  await expect(page.getByText(SCRIPT.name, { exact: true })).toHaveCount(1);

  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => trpc.lastInput(REMOVE_PROC), { intervals: [100, 250, 500] }).toMatchObject({ scriptId: SCRIPT.id });
});

test("Add mints a real library ROW (a server write, not an array push)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<RegexSettingsStory />);
  await page.getByRole("button", { name: "Add script" }).click();
  // THE D121-E SHAPE: adding a script is a `createScript` call. Under the old embedded blob it was a
  // `pushFieldValue` into a settings array — which is exactly how three carriers came to disagree.
  //
  // THE DEFAULT IS THE TWO CONVERSATIONAL STREAMS (side-eye X-9). It used to be ALL FIVE, so pressing this
  // button created a live enabled find/replace wired into world info and the reasoning channel before the
  // user had typed a character of a pattern. An EMPTY set is ruled out for the opposite reason (F3: a
  // script that can never fire), so the default is the smallest set that is both harmless and useful.
  await expect
    .poll(() => trpc.lastInput(CREATE_PROC), { intervals: [100, 250, 500, 750] })
    .toMatchObject({ input: { name: "New script", placement: ["USER_INPUT", "AI_OUTPUT"] } });
});

// ONE LABEL, ONE CONTROL (side-eye X-1 + X-2). The dialog carried "Display only" TWICE — a `Runs on`
// placement chip and a `markdownOnly` switch, 320px apart — and the switch could be ON at the same time as
// "Prompt only", whose helper text is its literal complement, with nothing on screen saying which won.
// Both flags are masks over the placement set, so they are derived from it now and gone from the dialog.
test("the editor states where a script bites exactly ONCE — no duplicate label, no contradictory pair", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  await page.getByText(SCRIPT.name).first().click();
  await expect(page.getByRole("heading", { name: "Edit regex script" })).toBeVisible();

  // The old duplicate name is gone from BOTH controls, and the render tier is named as the stream it is.
  await expect(page.getByRole("button", { name: "Display only" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Display only" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Prompt only" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Runs on" }).getByRole("button", { name: "Rendered transcript" })).toBeVisible();
});

test("clicking a row opens the ONE shared editor on it", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  // The row is click-to-edit (EntryListEditor). This is the pin that there is ONE editor at ONE capability
  // level — the reshape's whole point, where the character facet used to offer four of the ten fields.
  await page.getByText("strip ooc").first().click();
  await expect(page.getByRole("heading", { name: "Edit regex script" })).toBeVisible();
  // The full field set is present, not the old four-field subset.
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Runs on" })).toBeVisible();
});

test("the GLOBAL switch attaches the script at the global scope", async ({ mount, page }) => {
  const trpc = await stub(page, []);
  await mount(<RegexSettingsStory />);
  await page.getByRole("switch", { name: "strip ooc runs in every chat" }).click();
  await expect.poll(() => trpc.lastInput(ATTACH_PROC), { intervals: [100, 250, 500] }).toMatchObject({ scriptId: SCRIPT.id });
});

test("un-switching an already-global script detaches it", async ({ mount, page }) => {
  const trpc = await stub(page, [SCRIPT]);
  await mount(<RegexSettingsStory />);
  // The SWITCH is the scope affordance now (X-6) — checked because this script is in the global set.
  await expect(page.getByRole("switch", { name: "strip ooc runs in every chat" })).toBeChecked();
  await page.getByRole("switch", { name: "strip ooc runs in every chat" }).click();
  await expect.poll(() => trpc.lastInput(DETACH_PROC), { intervals: [100, 250, 500] }).toMatchObject({ scriptId: SCRIPT.id });
});

// ── THE TESTER (ST `Test Mode` parity) ────────────────────────────────────────────────────────────────
//
// Before this, the editor could author a pattern and offered NO way to see it bite: you saved, opened a
// chat, sent a turn, and read the transcript. These pins are the affordance's proof-of-life, and they
// assert through what the user sees — the Result field's value and the status line — never through the
// preview function. That the engine underneath AGREES with production (because it IS production,
// `@orb/kit/regex`) is pinned separately at tests/client/lib/regex-preview.test.ts.

/** The first words of the tester's seeded sample — restated here rather than imported, so the CT pins what
 *  a user actually finds in the box (and never drags client runtime into the node-side spec). */
const SAMPLE_LEAD = "The goblin snarls";

/** The two status strings the panel builds at runtime (a compile failure, and the never-fires caveat) —
 *  matched loosely, since the sentence around them is copy and the fact is what is pinned. */
/** The result box mirrors the sample box (`rows={3}` each); both auto-grow with content, so the floor is a
 *  proportion of the input's height rather than equality. */
const SAME_BOX_FLOOR = 0.9;

const CANNOT_RUN = /This pattern can't run:/;
const NO_STREAMS = /no streams are selected/;

/** Stub the pane on ONE arbitrary library row (the shared `stub` above is pinned to `SCRIPT`). */
function stubOn(page: Page, script: Record<string, unknown>): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => [script],
    "regex.listGlobal": () => [],
    "regex.updateScript": () => script,
  });
}

async function openEditor(page: Page, name: string): Promise<void> {
  await page.getByText(name).first().click();
  await expect(page.getByRole("heading", { name: "Edit regex script" })).toBeVisible();
}

test("the editor opens with a live tester, already carrying a sample to run against", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  await openEditor(page, SCRIPT.name);

  // The empty arm of a tester is a tester nobody can use: it ships with a sample, so the panel demonstrates
  // rather than asking the user to invent a fixture.
  await expect(page.getByLabel("Sample text")).toHaveValue(new RegExp(SAMPLE_LEAD));
  // `\(ooc\)` does not appear in that sample, so the honest reading is "nothing happened" — and the result
  // is the sample UNCHANGED, which is exactly what production does with a non-matching script.
  await expect(page.getByText("No matches in this sample.")).toBeVisible();
  await expect(page.getByLabel("Result")).toHaveValue(new RegExp(SAMPLE_LEAD));

  // AND IT IS ACTUALLY READABLE. The result box is a read-only control at the bottom of a scrolling dialog
  // — the shape that collapses to a sliver without anything failing. Asserted as a RELATION to the input it
  // mirrors (both are `rows={3}`), never a px literal.
  const inputBox = await page.getByLabel("Sample text").boundingBox();
  const resultBox = await page.getByLabel("Result").boundingBox();
  expect(resultBox?.height ?? 0).toBeGreaterThanOrEqual((inputBox?.height ?? 0) * SAME_BOX_FLOOR);
});

test("the tester runs the real engine over what you type, and says how many times it bit", async ({ mount, page }) => {
  await stub(page);
  await mount(<RegexSettingsStory />);
  await openEditor(page, SCRIPT.name);

  await page.getByLabel("Sample text").fill("hello (ooc) there (ooc)");
  // `\(ooc\)` → "" (this row's replaceString is empty): the two parenthesised asides are gone.
  await expect(page.getByLabel("Result")).toHaveValue("hello  there ");
  // The count comes from the production replacer firing, and the flags are the ones the executor really
  // compiled with — `gm` for a bare pattern, because `@orb/kit/regex` forces `g` and defaults to multiline.
  await expect(page.getByText("2 matches · flags gm")).toBeVisible();
});

test("a pattern that cannot compile says so instead of silently doing nothing", async ({ mount, page }) => {
  await stubOn(page, { ...SCRIPT, name: "broken", findRegex: "(unclosed" });
  await mount(<RegexSettingsStory />);
  await openEditor(page, "broken");
  await expect(page.getByText(CANNOT_RUN)).toBeVisible();
});

// THE F3 CLASS, CAUGHT AT AUTHORING TIME. The tester's probe deliberately ignores `enabled`/`placement` so
// a draft still previews — which would be a lie if the panel stopped there, because a script with no
// streams selected can never fire in a chat no matter how well it tests here.
test("the tester says when the script it just ran would never run in a chat", async ({ mount, page }) => {
  await stubOn(page, { ...SCRIPT, name: "no streams", placement: [] });
  await mount(<RegexSettingsStory />);
  await openEditor(page, "no streams");
  await expect(page.getByText(NO_STREAMS)).toBeVisible();
});

// ── TRIM OUT + MACROS IN THE FIND PATTERN (ST parity for two knobs that had no control) ───────────────
//
// Both were in the schema and honoured by the executor since the library landed, and neither had a control
// anywhere in the app — so they could only ever arrive on an imported ST card, and an in-app author could
// not see, let alone change, what an imported script was doing.

test("Trim out is authorable, bound to the row, and visibly changes what the engine produces", async ({ mount, page }) => {
  await stubOn(page, { ...SCRIPT, name: "unwrap", findRegex: "\\[(.+?)\\]", replaceString: "$1", trimStrings: ["ooc: "] });
  await mount(<RegexSettingsStory />);
  await openEditor(page, "unwrap");

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
  await stubOn(page, { ...SCRIPT, name: "macro find", findRegex: "{{char}}", replaceString: "THEM", substituteRegex: 1 });
  await mount(<RegexSettingsStory />);
  await openEditor(page, "macro find");
  // By ROLE, not by label: Base UI's Select renders a hidden form input carrying the same accessible name
  // as the trigger, so a bare `getByLabel` matches two nodes.
  await expect(page.getByRole("combobox", { name: "Macros in the find pattern" })).toContainText("Resolve macros first");

  // And it is honoured by the tester: `{{char}}` in the PATTERN resolves to the preview's sample character
  // before compiling, so the sample's literal name matches.
  await page.getByLabel("Sample text").fill("Aria waves");
  await expect(page.getByLabel("Result")).toHaveValue("THEM waves");
});
