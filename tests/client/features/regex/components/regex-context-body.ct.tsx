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
  // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
  updatedAt: 1_760_000_000_000,
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

// ── THE ROOM ROSTER (owner pick 2026-08-09 — REGROSTER's parked naming question) ──────────────────────
//
// A room is not named the way a preset is: its title is a fallback chain, and this roster used to receive a
// server-side two-rung copy of it. Every room nobody had renamed said "Untitled chat", which names nobody —
// and at three unnamed rooms produced three identical rows — while the chats list two panes over called the
// same rooms by their cast. These pin the chain running HERE, on the client's one `deriveChatTitle`.

const ROOM_AT = 1_760_000_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

test("an UNNAMED room is named by its cast, exactly as the chats list names it", async ({ mount, page }) => {
  await stubPane(page, {
    ...EMPTY_USAGE,
    rooms: [
      { id: "chat_named", title: "The Long Dark", participantNames: ["Azarael"], at: ROOM_AT },
      { id: "chat_unnamed", title: "   ", participantNames: ["Azarael", "Niko"], at: ROOM_AT - ONE_DAY_MS },
    ],
  });
  await mount(<RegexContextStory />);
  await expect(page.getByRole("heading", { name: "Attached by rooms · 2" })).toBeVisible();

  // An authored title wins, trimmed…
  await expect(page.getByText("The Long Dark")).toBeVisible();
  // …and a room nobody renamed reads as WHO IS IN IT, never "Untitled chat" (the reported defect).
  await expect(page.getByText("Azarael, Niko")).toBeVisible();
  await expect(page.getByText("Untitled chat")).toHaveCount(0);
});

test("rooms that share a derived title are told apart by their recency stamp", async ({ mount, page }) => {
  // The collision titling-by-cast creates: "Azarael" is a perfectly good name for three different rooms.
  await stubPane(page, {
    ...EMPTY_USAGE,
    rooms: [
      { id: "chat_a", title: null, participantNames: ["Azarael"], at: ROOM_AT },
      { id: "chat_b", title: null, participantNames: ["Azarael"], at: ROOM_AT - 3 * ONE_DAY_MS },
      { id: "chat_c", title: null, participantNames: ["Azarael"], at: ROOM_AT - 30 * ONE_DAY_MS },
    ],
  });
  await mount(<RegexContextStory />);
  await expect(page.getByRole("heading", { name: "Attached by rooms · 3" })).toBeVisible();

  const stamps = await page.locator('[data-slot="regex-usage-rooms"] [data-voice="datum"]').allTextContents();
  expect(stamps).toHaveLength(3);
  // Three rows, three DISTINCT qualifiers — which is the whole reason the stamp is on the row.
  expect(new Set(stamps).size).toBe(3);
});

test("an UNBREAKABLE room title clips, and its stamp survives at the 320px context column", async ({ mount, page }) => {
  // The title is ONE unbroken token on purpose. A multi-word title WRAPS instead of overflowing, so it
  // cannot discriminate a correct row from a broken one — verified by planting the defect: with the
  // multi-name fixture, deleting `truncate` from the title left this assertion GREEN. A single token is
  // reachable (an authored room title is free text) and is what actually forces the squeeze.
  await stubPane(page, {
    ...EMPTY_USAGE,
    rooms: [{ id: "chat_crowded", title: "Azaraelundyingfleshweaverofthenorthernwastesandbeyond", participantNames: [], at: ROOM_AT }],
  });
  await mount(<RegexContextStory />);
  await expect(page.getByRole("heading", { name: "Attached by rooms · 1" })).toBeVisible();

  // RENDERED, at the NARROWEST real host: the TITLE takes the squeeze and the stamp is never pushed out of
  // the pane — a `shrink-0` trailing datum sized in a wide context is this repo's commonest rendered defect.
  const fit = await page.evaluate(() => {
    const paneBox = document.querySelector('[data-slot="regex-context-body"]');
    const stamp = document.querySelector('[data-slot="regex-usage-rooms"] [data-voice="datum"]');
    if (paneBox === null || stamp === null) {
      return null;
    }
    const stampBox = stamp.getBoundingClientRect();
    return { paneRight: paneBox.getBoundingClientRect().right, stampRight: stampBox.right, stampWidth: stampBox.width };
  });
  expect(fit).not.toBeNull();
  expect(fit?.stampRight).toBeLessThanOrEqual(fit?.paneRight ?? 0);
  expect(fit?.stampWidth ?? 0).toBeGreaterThan(0); // not crushed to zero by the long title beside it
});

test("a long carrier name clips inside the 320px context column instead of widening the pane", async ({ mount, page }) => {
  // ONE UNBROKEN TOKEN, changed 2026-08-09: the old fixture was a long SENTENCE, which wraps rather than
  // overflows — planting the defect (deleting the row's `truncate`) left this test green, so it was a pin
  // that could not fail. A single token forces the squeeze this assertion is about.
  await stubPane(page, {
    ...EMPTY_USAGE,
    presets: [{ id: "preset_long", name: "Anabsurdlylongpresetnamethatnocontextcolumncouldeverhopetofitononeline" }],
  });
  await mount(<RegexContextStory />);
  await expect(page.getByRole("heading", { name: "Attached by presets · 1" })).toBeVisible();

  // RENDERED, at the NARROWEST real host (this pane IS the config rail's 320px context column): measured
  // against the pane's own box, never a px literal, so a token change cannot drift out from under it.
  //
  // MEASURES THE NAME, NOT THE SECTION (fixed 2026-08-09). This read the ROSTER's box, which is a block
  // element the 320px parent constrains — its right edge cannot move no matter how far its content spills,
  // so the assertion was structurally incapable of failing. Planting the defect (deleting the row's
  // `truncate`) confirmed it: green with the bug in place. The overflowing thing is the TEXT.
  const fit = await page.evaluate(() => {
    const pane = document.querySelector('[data-slot="regex-context-body"]');
    // Addressed by its `title` tooltip (the row's own affordance for a clipped name), never by the
    // `truncate` class — a selector naming the fix would make the pin pass by not finding anything.
    const name = document.querySelector('[data-slot="regex-usage-presets"] [title]');
    if (pane === null || name === null) {
      return null;
    }
    return { paneRight: pane.getBoundingClientRect().right, nameRight: name.getBoundingClientRect().right };
  });
  expect(fit).not.toBeNull();
  expect(fit?.nameRight).toBeLessThanOrEqual(fit?.paneRight ?? 0);
});
