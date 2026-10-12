// entry/import/run-profile-dir-import — the ST groups: member resolution, chat attribution and wall-clock zones.

import type { CharacterId, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { runProfileDirImport } from "#server/entry/import/index.ts";
import {
  chatJsonl,
  deps,
  ENC,
  fakes,
  fixtureFiles,
  groupJson,
  MINIMAL_PNG,
  memoryFs,
  openAiPresetJson,
  presetAndGroupFiles,
} from "./_profile-dir-import-support.ts";

// The zone the fixtures' ST wall clocks were "written" on. ST's `2025-07-18@12h00m00s` form is ZONE-LESS
// LOCAL, so the importer must resolve it in the snapshot's own zone — Denver is MDT (UTC-6) on that date.
const ST_ZONE_DENVER = "America/Denver";
/** `2025-07-18@12h00m00s` resolved in America/Denver. Six hours LATER than the UTC misreading it replaced. */
const DENVER_CREATE_MS = Date.UTC(2025, 6, 18, 18, 0, 0);
const ONE_SECOND_MS = 1000;

describe("runProfileDirImport — ST groups", () => {
  test("a group becomes ONE room per transcript: host + every member seated, speakers attributed per turn", async () => {
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unhandled).not.toContain("groups/");
    expect(report.unhandled).not.toContain("group chats/");
    expect(report.groupsImported).toBe(1);
    expect(report.groupChatsImported).toBe(1);

    // The group write is the LAST chat write (the wave runs after the character wave, which is what makes the
    // card-filename → characterId map exist at all).
    const groupWrite = f.chatWrites.at(-1);
    const chat = groupWrite?.chats[0];
    // Aria is the room's PRIMARY (ST's first member); Bryn is the extra roster seat.
    expect(groupWrite?.characterId).toBe(castId<CharacterId>("chr_1"));
    expect(chat?.characterIds).toEqual([castId<CharacterId>("chr_2")]);
    // Per-turn attribution: `original_avatar` resolves Aria BY CARD FILENAME; Bryn's line carries none, so the
    // roster-scoped display name resolves it; the user turn is never character-attributed; and an off-roster
    // speaker falls through to the primary by carrying NO characterId (absent ⇒ primary, per the op's contract).
    expect(chat?.messages.map((m) => m.characterId)).toEqual([castId<CharacterId>("chr_1"), undefined, castId<CharacterId>("chr_2"), undefined]);
    // The room is born with the group's own behaviour blob (ST generation_mode 0 = one speaker per turn).
    expect((chat?.metadata as { group?: { output?: string } } | undefined)?.group?.output).toBe("per-speaker");
  });

  test("ST generation_mode 1 (append) becomes a NARRATOR room", async () => {
    const files = {
      ...presetAndGroupFiles("root"),
      "root/userA/groups/g.json": ENC.encode(groupJson(["Aria.png", "Bryn.png"], ["party-night"], { generation_mode: 1 })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    await runProfileDirImport(deps(fs, f));

    const outputs = f.chatWrites
      .flatMap((w) => w.chats.map((c) => (c.metadata as { group?: { output?: string } } | undefined)?.group?.output))
      .filter((o) => o !== undefined);
    expect(outputs).toContain("narrator");
  });

  test("an ORPHAN member is skipped with a note; the room still imports around the members that resolved", async () => {
    const files = {
      ...presetAndGroupFiles("root"),
      "root/userA/groups/1773514134935.json": ENC.encode(groupJson(["Aria.png", "Nobody.png"], ["party-night"])),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.groupsImported).toBe(1);
    expect(report.skippedGroupMembers).toEqual([
      { group: "Group: Aria + Bryn", member: "Nobody.png", reason: "no character with that card filename in the import set or the library" },
    ]);
    // One seat only — the room formed around the member that did resolve.
    expect(f.chatWrites.at(-1)?.chats[0]?.characterIds).toEqual([]);
  });

  test("a group whose members ALL fail to resolve is skipped with a reason, never aborting the wave", async () => {
    const files = { ...presetAndGroupFiles("root"), "root/userA/groups/1773514134935.json": ENC.encode(groupJson(["Nobody.png"], ["party-night"])) };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.groupsImported).toBe(0);
    expect(report.skippedGroups).toEqual([{ group: "Group: Aria + Bryn", reason: "none of its member cards resolved to an imported or existing character" }]);
    // The character wave still landed both cards.
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(2);
  });

  test("a transcript leaf the group claims but that has no file is recorded, never silent", async () => {
    const files = {
      ...presetAndGroupFiles("root"),
      "root/userA/groups/1773514134935.json": ENC.encode(groupJson(["Aria.png", "Bryn.png"], ["party-night", "gone"])),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.missingGroupChats).toEqual(["gone.jsonl"]);
    expect(report.groupChatsImported).toBe(1);
  });

  test("a group transcript's DATES resolve in the ST wall-clock zone, exactly like a solo one", async () => {
    // The group wave used to read its transcripts as UTC while the solo wave threaded the injected zone: the
    // collector forwarded `wallClockZone` to `collectChatsForDir` and NOT to `collectGroups`, so every
    // imported ST group room (and every one of its messages) landed at the writing box's UTC offset — 6h
    // early for this Denver snapshot. Counts alone never saw it; only the instants do.
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    await runProfileDirImport(deps(fs, f, { stWallClockZone: ST_ZONE_DENVER }));

    const groupChat = f.chatWrites.at(-1)?.chats[0];
    expect(groupChat?.createdAt).toBe(DENVER_CREATE_MS);
    // Every message instant rides the same parse, so the first line's `send_date` (+1s) must shift with it.
    expect(groupChat?.messages[0]?.createdAt).toBe(DENVER_CREATE_MS + ONE_SECOND_MS);
    // The title's date is rendered from the SAME instant in the SAME zone — it was already zone-correct
    // (the group verb threads the zone to the mapper), which is exactly why the drift stayed invisible.
    expect(groupChat?.title).toBe("Group: Aria + Bryn — Jul 18, 2025");
  });

  test("a byte-identical second run is a clean idempotent no-op across BOTH new planes", async () => {
    // The owner's pre-commit check: family-qualified names must not double-qualify, and nothing may duplicate.
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    const first = await runProfileDirImport(deps(fs, f));
    expect(first.presetsImported).toBe(2);
    expect(first.groupsImported).toBe(1);
    expect(first.groupChatsImported).toBe(1);

    const second = await runProfileDirImport(deps(fs, f));

    // Same names both runs — no `(OpenAI) (OpenAI)`, and the (ownerId, name) merge means no second preset row.
    expect(f.presetWrites).toEqual(["Marinara (OpenAI)", "OpenAI (active)", "Marinara (OpenAI)", "OpenAI (active)"]);
    // The chat write op deduped by importHash, so the group transcript is NOT written a second time — and the
    // room therefore reports as NOT imported (net-new canon, not "processed").
    expect(second.groupChatsImported).toBe(0);
    expect(second.groupsImported).toBe(0);
    // The presets were ACCEPTED again (merged in place) but none is net-new canon.
    expect(second.presetsImported).toBe(2);
    expect(second.changed).toBe(0);
    // The same set was examined; no new character canon.
    expect(second.scanned).toBe(first.scanned);
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(2);
  });

  // ── THE SILENT-GAP SWEEP (2026-08-15): regex (card · preset · global), world name-links, user planes ────
  // Every plane below vanished with NO report line before this wave. The fixture values are the GENUINE ST
  // dialect (scriptName + integer placements — verbatim corpus shapes), because the schema-level dialect gap
  // was exactly how the card lift stayed silently empty even where it was wired.
  test("regex scripts lift from cards, presets and settings; world names link; user planes are counted", async () => {
    const stScript = (scriptName: string): Record<string, unknown> => ({
      id: `st-${scriptName}`,
      scriptName,
      findRegex: "/\\.{3}/g",
      replaceString: "…",
      trimStrings: [],
      placement: [1, 2],
      disabled: false,
      markdownOnly: false,
      promptOnly: false,
      runOnEdit: true,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    });
    // A card carrying BOTH its own scripts AND a world NAME-LINK (`extensions.world` — the ST primary-book
    // binding; "Eldoria" resolves against `worlds/`, so the attach op must see it as primary).
    const cardWithExtras = writeCardChunk(
      MINIMAL_PNG,
      JSON.stringify({
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: {
          name: "Aria",
          description: "Aria the bard",
          first_mes: "Hello there!",
          extensions: { world: "Eldoria", regex_scripts: [stScript("Card Script")] },
        },
      }),
    );
    const stWorld = JSON.stringify({ entries: { "0": { uid: 0, key: ["eldoria"], comment: "Eldoria", content: "A forest.", order: 100 } } });
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardWithExtras,
      "root/userA/chats/Aria/chat1.jsonl": ENC.encode(chatJsonl("Alex", "Aria")),
      "root/userA/worlds/Eldoria.json": ENC.encode(stWorld),
      "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson({ extensions: { regex_scripts: [stScript("Preset Script")] } })),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          power_user: { personas: { "alex.png": "Alex" }, default_persona: "alex.png" },
          extension_settings: { regex: [stScript("Global Script"), { scriptName: "malformed, no findRegex" }] },
          // charLore keys by the CARD FILENAME STEM; "Test World Lore 2" is deliberately NOT in worlds/ —
          // the corpus's dominant case (28 of 30 world names dangle) must come back as a report row.
          world_info_settings: { world_info: { charLore: [{ name: "Aria", extraBooks: ["Eldoria", "Test World Lore 2"] }] } },
        }),
      ),
      "root/userA/User Avatars/alex.png": MINIMAL_PNG,
      // The Data Bank + character-gallery planes — counted, never silent (EMPTY on the real corpus).
      "root/userA/user/files/notes.txt": ENC.encode("databank doc"),
      "root/userA/user/images/Aria/pose1.png": MINIMAL_PNG,
      "root/userA/user/images/Aria/pose2.png": MINIMAL_PNG,
    };
    const fs = memoryFs(files);
    const f = fakes();

    const cardLifts: { characterId: CharacterId; names: string[] }[] = [];
    const presetLifts: { presetId: PresetId; names: string[] }[] = [];
    const globalLifts: string[][] = [];
    const bookAttaches: { characterId: CharacterId; names: readonly string[]; role: string }[] = [];

    const report = await runProfileDirImport({
      ...deps(fs, f),
      importCardScripts: ({ characterId, scripts }) => {
        cardLifts.push({ characterId, names: scripts.map((s) => s.name) });
        return Promise.resolve({ created: scripts.length, reused: 0 });
      },
      importPresetScripts: ({ presetId, scripts }) => {
        presetLifts.push({ presetId, names: scripts.map((s) => s.name) });
        return Promise.resolve({ created: scripts.length, reused: 0 });
      },
      importGlobalScripts: ({ scripts }) => {
        globalLifts.push(scripts.map((s) => s.name));
        return Promise.resolve({ created: scripts.length, reused: 0 });
      },
      attachBooksByName: ({ characterId, names, role }) => {
        bookAttaches.push({ characterId, names, role });
        const missing = names.filter((n) => !f.standaloneBooks.includes(n));
        return Promise.resolve({ linked: names.length - missing.length, missing });
      },
    });

    // CARD scripts: the ST dialect normalized (scriptName → name) and lifted onto the created character.
    expect(cardLifts).toEqual([{ characterId: castId<CharacterId>("chr_1"), names: ["Card Script"] }]);
    expect(report.cardRegexScriptsLifted).toBe(1);

    // PRESET scripts: attached to exactly the row the (faked, presetId-reporting) import op wrote.
    expect(presetLifts).toEqual([{ presetId: "preset_MarinaraOpenAI", names: ["Preset Script"] }]);
    expect(report.presetNotes.find((n) => n.name === "Marinara (OpenAI)")).toMatchObject({ scriptsLifted: 1, scriptsReused: 0 });

    // GLOBAL scripts: found 2 (1 malformed — counted, dropped), lifted 1.
    expect(globalLifts).toEqual([["Global Script"]]);
    expect(report.globalRegexScriptsFound).toBe(1);
    expect(report.malformedGlobalRegexScripts).toBe(1);
    expect(report.globalRegexScriptsLifted).toBe(1);
    expect(report.globalRegexSkippedReason).toBeNull();

    // WORLD LINKS: the card's own world attaches PRIMARY; the charLore extras attach AUXILIARY; the name the
    // profile never downloaded comes back as a per-character report row, verbatim, never near-matched.
    expect(bookAttaches).toEqual([
      { characterId: castId<CharacterId>("chr_1"), names: ["Eldoria"], role: "primary" },
      { characterId: castId<CharacterId>("chr_1"), names: ["Eldoria", "Test World Lore 2"], role: "auxiliary" },
    ]);
    expect(report.worldLinksAttached).toBe(2);
    expect(report.worldLinksMissing).toEqual([{ character: "Aria", book: "Test World Lore 2" }]);

    // USER PLANES: counted so a future profile carrying data can never again lose it silently.
    expect(report.databankFileCount).toBe(1);
    expect(report.galleryImageCount).toBe(2);
  });

  // ── THE ORPHAN WAVE (2026-08-15): transcripts whose card is absent import via a minted placeholder ──────
  test("an orphan chats/ dir mints a placeholder (evidence-only), imports its chats, and is tagged for the owner", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      // The synthetic `Clover_Owl/` has no `Clover_Owl.png` card; its header carries the `"unused"`
      // sentinel, so the DIR NAME is the mint's evidence.
      "root/userA/chats/Clover_Owl/Clover Owl - 2025-07-18@12h00m00s.jsonl": ENC.encode(chatJsonl("Alex", "unused")),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f));

    // The FOUND list still names the dir (the honesty line), and the new section says what happened to it.
    expect(report.orphanChatDirs).toEqual(["clover-owl"]);
    expect(report.orphanImports).toEqual([{ dir: "Clover_Owl", characterName: "Clover Owl", created: true, chatsImported: 1 }]);
    expect(report.orphanSkipped).toEqual([]);
    // The mint is discoverable: ONE library tag, manual/accepted, on the minted character (chr_2 — the card
    // character chr_1 minted first).
    expect(f.tagAttaches).toEqual([{ characterId: castId<CharacterId>("chr_2"), tagName: "orphan import", source: "manual", status: "accepted" }]);
    // The transcripts imported through the ORDINARY chats verb against the mint.
    expect(f.chatWrites.some((w) => w.characterId === castId<CharacterId>("chr_2") && w.chats.length === 1)).toBe(true);
    // changed counts the mint + its chat (persona + card char + card chat + mint + orphan chat = 5).
    expect(report.changed).toBe(5);

    // The RE-RUN: the synthetic dir-keyed hash resolves the same mint; the chat dedups by its byte hash.
    const second = await runProfileDirImport(deps(memoryFs(files), f));
    expect(second.orphanImports).toEqual([{ dir: "Clover_Owl", characterName: "Clover Owl", created: false, chatsImported: 0 }]);
    expect(second.changed).toBe(0);
    // No second tag — the tag attaches only on a CREATE.
    expect(f.tagAttaches).toHaveLength(1);
  });

  test("dryRun leaves orphan dirs reported-only (zero mints, zero writes)", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/chats/Clover_Owl/Clover Owl - 2025-07-18@12h00m00s.jsonl": ENC.encode(chatJsonl("Alex", "unused")),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f, { dryRun: true }));

    expect(report.orphanChatDirs).toEqual(["clover-owl"]);
    expect(report.orphanImports).toEqual([]);
    expect(f.log).toHaveLength(0);
  });

  test("found-but-unwired regex/world ops are RECORDED reasons, never silence", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          power_user: { personas: { "alex.png": "Alex" }, default_persona: "alex.png" },
          extension_settings: {
            regex: [
              {
                id: "st-g",
                scriptName: "Global Script",
                findRegex: "a",
                replaceString: "b",
                trimStrings: [],
                placement: [2],
                disabled: false,
                markdownOnly: false,
                promptOnly: false,
                runOnEdit: false,
                substituteRegex: 0,
                minDepth: null,
                maxDepth: null,
              },
            ],
          },
        }),
      ),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f));

    expect(report.globalRegexScriptsFound).toBe(1);
    expect(report.globalRegexScriptsLifted).toBe(0);
    expect(report.globalRegexSkippedReason).toBe("global regex-script import is not wired into this composition");
  });
});
