/**
 * @module-tag requires-process-chdir
 */
// entry/import/import-report — the whole-folder import's "what landed / what didn't" accounting, rendered
// to a file a self-host owner opens. It is the ONLY place a non-imported plane is ever reported, so every
// silent-drop this renderer permits is data the operator never learns was left behind. The renderer's own
// history is exactly that class of bug (a verifier found 11 planes rendering BARE in 2026-08; 15 real
// preset-scoped regex scripts vanished with no line at all on the 2026-08-15 run), so the pins here are the
// honesty guarantees rather than the prose:
//
//   • a section with nothing in it renders `_None._` — "checked and empty" must be distinguishable from
//     "never looked at";
//   • the regex + Data-Bank/gallery planes render their COUNTS EVEN AT ZERO, for the same reason;
//   • an unhandled plane with a known reason renders WITH it, and an unknown one renders bare (so a new ST
//     plane appears in the report instead of being swallowed) — including `secrets.json`, whose row is the
//     operator's receipt that API keys were deliberately not imported;
//   • the merged-vs-new preset/theme arithmetic is derived, not reported, so it cannot disagree with itself;
//   • the report file is named from the RUN CLOCK under the reports dir it is given, and the directory is
//     created when absent.
//
// `formatImportReport` is private, so the pins drive the real `writeImportReport` and read the bytes back.
// The reports dir resolves from cwd, so each test runs in a temp cwd and restores it (the
// `env/index.test.ts` precedent).

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ImportReport } from "@orb/server/domain/import";
import { afterEach, beforeEach, describe } from "vitest";
// Not on the `entry/import` barrel — `portability-runner.ts` is its only production importer, by path.
import { writeImportReport } from "../../../../packages/server/src/entry/import/import-report.ts";
import { expect, test } from "../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
const AT_ISO = new Date(AT).toISOString();

/** A run that scanned nothing and lost nothing — every list empty, every count zero. */
const EMPTY: ImportReport = {
  scanned: 0,
  changed: 0,
  dryRun: false,
  dryRunWouldImport: null,
  skippedCards: [],
  skippedCardTags: [],
  truncatedDirs: [],
  ambiguousSpeakerNames: [],
  seatedDisabledMembers: [],
  unreadableCards: [],
  unreadableWorlds: [],
  unreadablePresets: [],
  unreadableGroups: [],
  presetsImported: 0,
  presetsCreated: 0,
  skippedPresets: [],
  presetNotes: [],
  themesImported: 0,
  themesCreated: 0,
  skippedThemes: [],
  themeNotes: [],
  backgroundsImported: 0,
  skippedBackgrounds: [],
  appearanceKeysApplied: [],
  groupsImported: 0,
  groupChatsImported: 0,
  skippedGroups: [],
  skippedGroupMembers: [],
  missingGroupChats: [],
  skippedChats: [],
  orphanChatDirs: [],
  skippedCharacters: [],
  unhandled: [],
  unhandledSettings: [],
  unresolvedPinnedPersonas: [],
  chatsPersonaHealed: 0,
  globalRegexScriptsFound: 0,
  globalRegexScriptsLifted: 0,
  globalRegexScriptsReused: 0,
  malformedGlobalRegexScripts: 0,
  globalRegexSkippedReason: null,
  cardRegexScriptsLifted: 0,
  cardRegexScriptsReused: 0,
  worldLinksAttached: 0,
  worldLinksMissing: [],
  worldLinksSkippedReason: null,
  databankFileCount: 0,
  galleryImageCount: 0,
  orphanImports: [],
  orphanSkipped: [],
} satisfies ImportReport;

let cwdRoot: string;
let previousCwd: string;

// The layout's default reports dir, as the compose root passes it: cwd-relative, created on first write.
const REPORTS_DIR = "./data/reports";

/** Write `report` from a temp cwd and return the path + the rendered markdown. */
async function render(report: ImportReport, at = AT): Promise<{ readonly path: string; readonly md: string }> {
  const path = await writeImportReport(report, at, REPORTS_DIR);
  return { path, md: await readFile(path, "utf8") };
}

beforeEach(async () => {
  previousCwd = process.cwd();
  cwdRoot = await mkdtemp(join(tmpdir(), "orb-import-report-"));
  process.chdir(cwdRoot);
});

afterEach(async () => {
  process.chdir(previousCwd);
  await rm(cwdRoot, { recursive: true, force: true });
});

describe("writeImportReport — where the file lands", () => {
  test("creates the reports dir and names the file from the RUN CLOCK", async () => {
    const { path, md } = await render(EMPTY);

    expect(path).toBe(join(cwdRoot, "data", "reports", `import-${AT}.md`));
    expect(await readdir(join(cwdRoot, "data", "reports"))).toEqual([`import-${AT}.md`]);
    expect(md).toContain(`Generated: ${AT_ISO}`);
    expect(md.startsWith("# SillyTavern import report")).toBe(true);
  });

  test("two runs write two files (a second import never overwrites the first run's accounting)", async () => {
    await render(EMPTY);
    await render(EMPTY, AT + 1);

    expect((await readdir(join(cwdRoot, "data", "reports"))).sort()).toEqual([`import-${AT}.md`, `import-${AT + 1}.md`]);
  });
});

describe("writeImportReport — 'checked and empty' is distinguishable from 'never looked at'", () => {
  test("NO section of an empty run renders blank — each is either a list or the `_None._` placeholder", async () => {
    const { md } = await render(EMPTY);

    // Derived, not counted: a new section added to the renderer is covered automatically, and a section
    // that renders NOTHING at zero (the 2026-08 silent-gap class) fails here by name.
    const headings = [...md.matchAll(/^## (?<title>.+)$/gmu)].map((m) => m.groups?.["title"] ?? "");
    expect(headings.length).toBeGreaterThan(15);
    const blank: string[] = [];
    for (const [i, title] of headings.entries()) {
      const start = md.indexOf(`## ${title}`);
      const nextTitle = headings[i + 1];
      const end = nextTitle === undefined ? md.length : md.indexOf(`## ${nextTitle}`, start + 1);
      const body = md.slice(start + `## ${title}`.length, end).trim();
      if (body.length === 0) {
        blank.push(title);
      }
    }
    expect(blank).toEqual([]);
    // …and the placeholder is the shape the empty ones use.
    expect(md).toContain("_None._");
  });

  test("the regex plane reports its counts EVEN AT ZERO (the plane that used to vanish entirely)", async () => {
    const { md } = await render(EMPTY);

    expect(md).toContain("Card-carried scripts (`data.extensions.regex_scripts`): 0 attached (0 new library rows, 0 matched existing)");
    expect(md).toContain("Global scripts (`settings.json#extension_settings.regex`): found 0 — 0 new library rows (global), 0 matched existing");
    // The two CONDITIONAL lines stay off when there is nothing to say.
    expect(md).not.toContain("did not parse as regex scripts");
    expect(md).not.toContain("Global scripts NOT imported:");
  });

  test("a malformed/skipped global-regex run adds its two lines (a drop is never silent)", async () => {
    const { md } = await render({ ...EMPTY, globalRegexScriptsFound: 4, malformedGlobalRegexScripts: 2, globalRegexSkippedReason: "dry run" });

    expect(md).toContain("Global entries that did not parse as regex scripts: 2 — dropped, see the server log");
    expect(md).toContain("Global scripts NOT imported: dry run");
  });

  test("the Data Bank / gallery planes say '0 files found' at zero and 'NOT imported yet' when populated", async () => {
    const { md: zero } = await render(EMPTY);
    expect(zero).toContain("Data Bank files (`user/files/` + the attachments index): 0 files found — nothing to import");
    expect(zero).toContain("Character-gallery images (`user/images/`): 0 files found — nothing to import");

    const { md: some } = await render({ ...EMPTY, databankFileCount: 3, galleryImageCount: 7 });
    expect(some).toContain("Data Bank files (`user/files/` + the attachments index): 3 file(s) found — NOT imported yet");
    expect(some).toContain("Character-gallery images (`user/images/`): 7 file(s) found — NOT imported yet");
  });
});

describe("writeImportReport — an unhandled plane is named, with its reason when one is known", () => {
  test("`secrets.json` renders the operator's receipt that API keys were deliberately not imported", async () => {
    const { md } = await render({ ...EMPTY, unhandled: ["secrets.json"] });

    expect(md).toContain("`secrets.json` — API keys — deliberately NOT imported (credentials are entered per-install)");
  });

  test("a settings section with a known reason renders it; an UNKNOWN plane still renders BARE", async () => {
    const { md } = await render({ ...EMPTY, unhandled: ["some_brand_new_st_plane/"], unhandledSettings: ["horde_settings"] });

    expect(md).toContain("`horde_settings` — Horde backend config — no import canon");
    // The bare line is the whole point: a plane nobody has classified yet must still be visible.
    expect(md).toContain("- `some_brand_new_st_plane/`\n");
    expect(md).not.toContain("some_brand_new_st_plane/` —");
  });
});

describe("writeImportReport — the summary arithmetic is derived, never re-reported", () => {
  test("presets/themes render `(new, merged)` with merged computed from imported − created", async () => {
    const { md } = await render({ ...EMPTY, presetsImported: 5, presetsCreated: 2, themesImported: 4, themesCreated: 4 });

    expect(md).toContain("- Presets imported: 5 (2 new, 3 merged onto an existing preset)");
    expect(md).toContain("- Themes converted: 4 (4 new, 0 merged onto an existing imported theme)");
  });

  test("the dedup-repair line renders even at zero — it is the only signal a re-run did anything", async () => {
    const { md } = await render(EMPTY);
    expect(md).toContain("- Existing rooms given their user persona (re-run repair): 0");
  });
});

describe("writeImportReport — per-preset lossiness renders as ONE nested block, never mangled lines", () => {
  test("a preset that mapped whole says so; one with unmapped fields nests them under its head line", async () => {
    const { md } = await render({
      ...EMPTY,
      presetNotes: [
        { name: "Whole", sourceFile: "a.json", fields: [], scriptsLifted: 0, scriptsReused: 0 },
        { name: "Lossy", sourceFile: "b.json", fields: [{ field: "mirostat", reason: "no orb seat" }], scriptsLifted: 0, scriptsReused: 0 },
      ],
    });

    expect(md).toContain("- `Whole` (from `a.json`) — everything mapped");
    // `section` prefixes each entry with "- ", so the nested field must carry its own two-space indent.
    expect(md).toContain("- `Lossy` (from `b.json`) — 1 field(s) not imported:\n  - `mirostat` — no orb seat");
  });

  test("a preset that carried regex scripts appends the lift accounting NESTED under its head line", async () => {
    const { md } = await render({
      ...EMPTY,
      presetNotes: [{ name: "WithScripts", sourceFile: "c.json", fields: [], scriptsLifted: 2, scriptsReused: 1 }],
    });

    expect(md).toContain(
      "- `WithScripts` (from `c.json`) — everything mapped\n  - 3 regex script(s) → the script library, attached to this preset (2 new, 1 matched existing rows)",
    );
  });
});

describe("writeImportReport — the per-entity 'did not travel' planes each name their subject", () => {
  test("a dangling world name-link, an unresolved persona pin and an orphan dir all render with their reason", async () => {
    const { md } = await render({
      ...EMPTY,
      worldLinksAttached: 2,
      worldLinksMissing: [{ character: "Aria", book: "Lost Book" }],
      unresolvedPinnedPersonas: [{ chat: "Aria/2024.jsonl", persona: "Nate" }],
      orphanImports: [{ dir: "Ghost", characterName: "Ghost", created: true, chatsImported: 2 }],
      orphanSkipped: [{ dir: "Broken", reason: "mint failed" }],
    });

    expect(md).toContain("Book links attached by name: 2");
    expect(md).toContain("`Aria` names world book `Lost Book` — no book of that name in this profile or your library (never near-matched)");
    expect(md).toContain("`Aria/2024.jsonl` → persona `Nate` — no persona of that name in this import or your library");
    expect(md).toContain("`Ghost` → `Ghost` (2 chat(s))");
    expect(md).toContain("`Broken` — NOT imported: mint failed");
  });

  test("an orphan dir whose placeholder already existed says so (a re-run is not a silent no-op)", async () => {
    const { md } = await render({ ...EMPTY, orphanImports: [{ dir: "Ghost", characterName: "Ghost", created: false, chatsImported: 1 }] });

    expect(md).toContain("`Ghost` → `Ghost` (1 chat(s); placeholder already existed from a prior run)");
  });
});

// #1469 — the four planes this renderer had no line for at all. Each was a real loss the operator could not
// learn about from the report: a truncated directory, a tag that never attached, two same-named seats that
// left a turn unattributed, an ST mute that did not travel — and a DRY RUN whose structural zeroes read
// exactly like an empty profile.
describe("writeImportReport — the #1469 silent planes now have lines", () => {
  test("a truncated directory names the dir and the counts on both sides of the ceiling", async () => {
    const { md } = await render({ ...EMPTY, truncatedDirs: [{ dir: "root/userA/characters", kept: 100_000, total: 140_002 }] });

    expect(md).toContain("`root/userA/characters` — 140002 entries found, only the first 100000 were read (the rest did NOT import)");
  });

  test("a tag that did not attach, an ambiguous speaker name and an ST-disabled member each name their subject", async () => {
    const { md } = await render({
      ...EMPTY,
      skippedCardTags: [{ character: "Aria.png", tag: "bard", reason: "UNIQUE constraint failed" }],
      ambiguousSpeakerNames: [{ group: "Two Emilys", name: "Emily", seats: 2 }],
      seatedDisabledMembers: [{ group: "The Party", member: "Bram.png" }],
    });

    expect(md).toContain("`Aria.png` → `bard` — UNIQUE constraint failed");
    expect(md).toContain("`Two Emilys` — 2 seated cards are called `Emily`");
    expect(md).toContain("`The Party` → `Bram.png` — seated in the room with its mute ON, exactly as ST had it");
  });

  test("a DRY RUN says so at the top and lists what a real run would attempt, per wave", async () => {
    const { md } = await render({
      ...EMPTY,
      dryRun: true,
      dryRunWouldImport: {
        characters: 3,
        personas: 1,
        chats: 7,
        worlds: 2,
        presets: 1,
        themes: 0,
        backgrounds: 4,
        groups: 1,
        groupChats: 2,
        orphanChatDirs: 1,
      },
    });

    expect(md).toContain("**DRY RUN — nothing was written.**");
    expect(md).toContain("- Characters: 3 (with 7 chat transcript(s))");
    expect(md).toContain("- Background images: 4");
    expect(md).toContain("- Group rooms: 1 (with 2 group transcript(s))");
  });

  test("a REAL run renders NO dry-run banner (the banner is the tell, not a decoration)", async () => {
    const { md } = await render(EMPTY);

    expect(md).not.toContain("DRY RUN");
  });
});
