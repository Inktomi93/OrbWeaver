// CT: the regex collection's CONTEXT arm — the three reverse ATTACHMENT ROSTERS (REGROSTER). The pane used
// to ship an honest sentence in their place ("the other three attach from the thing they belong to")
// because `regex.listScriptUsage` did not exist; these are the pins that the sentence is now a ROSTER.
//
// Asserted through what a reader (and a screen reader) actually gets: the section HEADINGS — which carry
// both the scope noun and its count, because "Attached by rooms · 0" is the complete statement and a bare
// "Attached by rooms" over an empty box reads as a list that failed to load — and the carrier NAMES as
// text. Never a data-slot census: the slot is a test hook, the heading is the affordance.
//
// The EMPTY arm has its own test because omitting an empty roster is the specific failure the empty-states
// law names: a scope that renders nothing reads as "not built yet", not as "nothing attaches this".

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { RegexContextStory } from "../_ct-stories.tsx";

const SCRIPT_ID = "regex_script_000000000000000a";

const SCRIPT = {
  id: SCRIPT_ID,
  name: "strip ooc",
  findRegex: "a",
  replaceString: "b",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: 0,
};

const FULL_USAGE = {
  presets: [
    { id: "preset_novella", name: "Novella long-form" },
    { id: "preset_cheap", name: "Local 8B — cheap mode" },
  ],
  characters: [{ id: "character_azarael", name: "Azarael" }],
  rooms: [],
};

const EMPTY_USAGE = { presets: [], characters: [], rooms: [] };

function stubPane(page: Page, usage: unknown): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "regex.listScripts": () => [SCRIPT],
    "regex.listGlobal": () => [],
    "regex.listScriptUsage": () => usage,
  });
}

test("the three scopes render as named rosters, counted in their own headings", async ({ mount, page }) => {
  const trpc = await stubPane(page, FULL_USAGE);
  await mount(<RegexContextStory />);
  await expect(page.getByRole("heading", { name: "Attached by presets · 2" })).toBeVisible();

  // Every carrier the server named is on screen, by name — the whole point of the reverse read (a count
  // alone sends the reader opening presets one by one to find which two).
  await expect(page.getByText("Novella long-form")).toBeVisible();
  await expect(page.getByText("Local 8B — cheap mode")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attached by characters · 1" })).toBeVisible();
  await expect(page.getByText("Azarael")).toBeVisible();

  // The read is keyed on the SELECTED script, not on "the library" — the rosters can never belong to the
  // previously-open row.
  await expect.poll(() => trpc.lastInput("regex.listScriptUsage"), { intervals: [100, 250, 500] }).toEqual({ scriptId: SCRIPT_ID });
});

test("a scope with nothing in it still renders — its count and the line saying where to attach one", async ({ mount, page }) => {
  await stubPane(page, FULL_USAGE);
  await mount(<RegexContextStory />);

  // The rooms roster is EMPTY in this fixture and must still be a section: an omitted scope reads as a
  // surface that was never built, where "· 0" plus the next step reads as a scope with nothing in it.
  await expect(page.getByRole("heading", { name: "Attached by rooms · 0" })).toBeVisible();
  await expect(page.getByText("No room attaches this script yet. Open a chat's This-chat panel to attach it there.")).toBeVisible();
});

test("an unattached script shows all three rosters at zero, never a blank pane", async ({ mount, page }) => {
  await stubPane(page, EMPTY_USAGE);
  await mount(<RegexContextStory />);

  await expect(page.getByRole("heading", { name: "Attached by presets · 0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attached by characters · 0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attached by rooms · 0" })).toBeVisible();
  // The global switch is still the pane's own scope — the rosters sit BESIDE it, they do not replace it.
  await expect(page.getByRole("switch", { name: "strip ooc runs in every chat" })).toBeVisible();
});

test("a long carrier name clips inside the 320px context column instead of widening the pane", async ({ mount, page }) => {
  await stubPane(page, {
    ...EMPTY_USAGE,
    presets: [{ id: "preset_long", name: "An absurdly long preset name that no context column could ever hope to fit on one line" }],
  });
  await mount(<RegexContextStory />);
  await expect(page.getByRole("heading", { name: "Attached by presets · 1" })).toBeVisible();

  // RENDERED, at the NARROWEST real host (this pane IS the config rail's 320px context column): measured
  // against the pane's own box, never a px literal, so a token change cannot drift out from under it.
  const fit = await page.evaluate(() => {
    const pane = document.querySelector('[data-slot="regex-context-body"]');
    const roster = document.querySelector('[data-slot="regex-usage-presets"]');
    if (pane === null || roster === null) {
      return null;
    }
    return { paneRight: pane.getBoundingClientRect().right, rosterRight: roster.getBoundingClientRect().right };
  });
  expect(fit).not.toBeNull();
  expect(fit?.rosterRight).toBeLessThanOrEqual(fit?.paneRight ?? 0);
});
