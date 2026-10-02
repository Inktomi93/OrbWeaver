// The card ROUND TRIP through the composed real stack: real card fixtures (JSON and PNG, synthetic neutral
// content) carry `extensions.regex_scripts`, a named `character_book` and tags; the REAL import path (the
// Characters dialog door, `runProfileImport`, and the profile-folder door, the `import-st` contribution) runs
// over the REAL character, assets, tag, world-info and regex persistence against a real database; the REAL
// export re-embeds the attached scripts and the primary book under its name; and the exported card re-imports
// as the same character for its owner and lands by value, scripts and all, for a fresh owner. No stub of the
// importer, the serde or the persistence anywhere below.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { runProfileImport } from "@orb/server/entry/import";
import { describe } from "vitest";
import "../../../support/composed-real.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, OWNER_USER_ID, test } from "../../../support/fixtures.ts";

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** A minimal valid PNG (signature + zero-length IEND) the kit codec embeds a card into. */
const MINIMAL_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** Raw ST wire TEXT (snake_case by spec): a V2 card carrying two scripts in ST's own dialect — `scriptName`,
 *  integer placements, `disabled` — one of them switched off, a NAMED embedded book whose second entry has
 *  no comment (its title falls back to its key), and two tags. */
const SCRIPTED_CARD_JSON =
  '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Lantern Keeper","description":"Tends the harbor light.","first_mes":"The lamp is lit.","tags":["harbor","keeper"],' +
  '"character_book":{"name":"Harbor Lore","entries":[{"keys":["lamp"],"content":"The lamp never goes out.","comment":"The lamp","insertion_order":1},{"keys":["tide"],"content":"The tide turns at dusk.","comment":"","insertion_order":2}]},' +
  '"extensions":{"regex_scripts":[' +
  '{"id":"st-trim","scriptName":"Trim ellipsis","findRegex":"/\\\\.{3}/g","replaceString":"…","placement":[2],"disabled":false},' +
  '{"id":"st-mute","scriptName":"Mute asides","findRegex":"/\\\\(aside\\\\)/g","replaceString":"","placement":[1,2],"disabled":true}' +
  "]}}}";

const SCRIPTS = [
  { name: "Mute asides", enabled: false },
  { name: "Trim ellipsis", enabled: true },
];

type App = Parameters<typeof scriptsOf>[0];

async function scriptsOf(
  app: {
    readonly services: {
      readonly regex: {
        readonly listForCharacter: (p: {
          readonly principal: ReturnType<typeof makePrincipal>;
          readonly characterId: CharacterId;
        }) => Promise<readonly { readonly name: string; readonly enabled: boolean }[]>;
      };
    };
  },
  characterId: CharacterId,
  userId: UserId,
): Promise<{ readonly name: string; readonly enabled: boolean }[]> {
  const rows = await app.services.regex.listForCharacter({ principal: makePrincipal(userId), characterId });
  return rows.map((r) => ({ name: r.name, enabled: r.enabled })).toSorted((a, b) => a.name.localeCompare(b.name));
}

/** The card's content as the export writes it, reduced to what identity is made of (no ids, no references;
 *  card tags land as library suggestions and are not identity, so they are not compared here). */
interface CardShape {
  readonly name: string;
  readonly bookName: string | undefined;
  readonly entries: readonly { readonly title: string; readonly content: string }[];
  readonly scripts: readonly { readonly name: string; readonly placement: readonly string[] }[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The wire keys are ST's snake_case spellings, read by name off the exported JSON. */
function shapeOf(exportedJson: string): CardShape {
  const data = record(record(JSON.parse(exportedJson))["data"]);
  const book = record(data["character_book"]);
  const bookName = data["character_book"] === undefined ? undefined : text(book["name"]);
  return {
    name: text(data["name"]),
    bookName: bookName === "" ? undefined : bookName,
    entries: list(book["entries"])
      .map(record)
      .map((e) => ({ title: text(e["comment"]), content: text(e["content"]) }))
      .toSorted((a, b) => a.content.localeCompare(b.content)),
    scripts: list(record(data["extensions"])["regex_scripts"])
      .map(record)
      .map((s) => ({ name: text(s["name"]), placement: list(s["placement"]).map(text) }))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
  };
}

describe("card round trip through every import door (0442)", () => {
  test("Characters dialog door: scripts, the named book and tags land; the export re-imports as itself; a fresh owner gets it by value", async ({
    app,
    db,
    ownerCaller,
  }) => {
    void ownerCaller;
    const door = (userId: UserId, files: { readonly bytes: Uint8Array; readonly filename: string }[]): ReturnType<typeof runProfileImport> =>
      runProfileImport({
        principal: makePrincipal(userId),
        character: app.services.character,
        assets: app.assets,
        tag: app.services.tag,
        worldInfo: app.importWorldInfo,
        importCardScripts: app.importCardScripts,
        files,
      });
    const exportJson = async (userId: UserId, characterId: CharacterId): Promise<string> => {
      const exported = await app.exportService.exportCharacter({ principal: makePrincipal(userId), characterId, format: "json" });
      if (exported === null) {
        throw new Error("the character did not export");
      }
      return DEC.decode(exported.bytes);
    };

    // 1. The V2 JSON card through the Characters dialog door: both scripts are library rows attached to the
    //    character and the book landed under its own name with both entries.
    const first = await door(OWNER_USER_ID, [{ bytes: ENC.encode(SCRIPTED_CARD_JSON), filename: "lantern-keeper.json" }]);
    expect(first.failed).toEqual([]);
    const imported = first.imported[0];
    if (imported === undefined) {
      throw new Error("the card did not import");
    }
    expect(await scriptsOf(app, imported.characterId, OWNER_USER_ID)).toEqual(SCRIPTS);
    const exported = shapeOf(await exportJson(OWNER_USER_ID, imported.characterId));
    expect(exported).toEqual({
      name: "Lantern Keeper",
      bookName: "Harbor Lore",
      entries: [
        { title: "The lamp", content: "The lamp never goes out." },
        { title: "tide", content: "The tide turns at dusk." },
      ],
      scripts: [
        { name: "Mute asides", placement: ["USER_INPUT", "AI_OUTPUT"] },
        { name: "Trim ellipsis", placement: ["AI_OUTPUT"] },
      ],
    });

    // 2. The export re-imports for its OWNER as the same character (identity is the content, never the wire
    //    spec or a script's id); the planes run again and nothing duplicates.
    const exportedBytes = ENC.encode(await exportJson(OWNER_USER_ID, imported.characterId));
    const second = await door(OWNER_USER_ID, [{ bytes: exportedBytes, filename: "lantern-keeper.json" }]);
    expect(second.failed).toEqual([]);
    expect(second.imported[0]?.created).toBe(false);
    expect(second.imported[0]?.characterId).toBe(imported.characterId);
    expect(await scriptsOf(app, imported.characterId, OWNER_USER_ID)).toEqual(SCRIPTS);

    // 3. The same export into a FRESH owner's library (nothing to reuse by reference): the scripts, the book
    //    and the tags travel by value, and that owner's export has the same shape.
    const other = await seedUser(db, { handle: castId<Handle>("round-trip-other") });
    const third = await door(other.id, [{ bytes: exportedBytes, filename: "lantern-keeper.json" }]);
    expect(third.failed).toEqual([]);
    const theirs = third.imported[0];
    if (theirs === undefined) {
      throw new Error("the export did not import for the fresh owner");
    }
    expect(theirs.created).toBe(true);
    expect(theirs.characterId).not.toBe(imported.characterId);
    expect(await scriptsOf(app, theirs.characterId, other.id)).toEqual(SCRIPTS);
    expect(shapeOf(await exportJson(other.id, theirs.characterId))).toEqual(exported);
  });

  test("profile-folder door: a PNG card in a staged SillyTavern profile lands with its scripts through the real import-st contribution", async ({
    app,
    clock,
    ownerCaller,
    importStagingDir,
  }) => {
    void ownerCaller;
    const pngCard = writeCardChunk(MINIMAL_PNG, SCRIPTED_CARD_JSON);
    const token = "import-tree-round-trip";
    const profileDir = join(importStagingDir, OWNER_USER_ID, token, "profile");
    await mkdir(join(profileDir, "characters"), { recursive: true });
    await writeFile(join(profileDir, "characters", "lantern-keeper.png"), pngCard);
    await writeFile(join(profileDir, ST_SETTINGS_FILE), "{}");

    const contribution = app.workloadContributions["import-st"];
    const result = await contribution.run(
      { userId: OWNER_USER_ID, ownerId: OWNER_USER_ID, now: () => clock.now() },
      { stagedDir: token },
      () => undefined,
      new AbortController().signal,
    );
    expect(result.failed).toBe(0);
    expect(result.changed).toBeGreaterThanOrEqual(1);

    const found = await app.services.character.findByName({ ownerId: OWNER_USER_ID, name: "Lantern Keeper" });
    const characterId = found[0]?.characterId;
    if (characterId === undefined) {
      throw new Error("the profile import minted no character");
    }
    expect(await scriptsOf(app as App, characterId, OWNER_USER_ID)).toEqual(SCRIPTS);
  });
});
