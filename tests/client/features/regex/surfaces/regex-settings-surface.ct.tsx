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
