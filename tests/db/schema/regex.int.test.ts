// regex.int — schema/regex (regex_scripts + its four scope junctions) against a real libSQL :memory: db
// (FK PRAGMA ON). Covers: regex_scripts round-trip + defaults (enabled=true, createdAt/updatedAt born);
// owner CASCADE (drops the script → drops every junction row); each junction's composite/singleton PK +
// its own script-side CASCADE + its scope-side CASCADE (scope delete keeps the script, script delete wipes
// the junction).

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScriptBehavior } from "@orb/contracts/regex";
import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { characterRegexScripts, characters, chatRegexScripts, chats, globalRegexScripts, presetRegexScripts, presets, regexScripts } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { CharacterHandle, CharacterId, PresetId, RegexScriptId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedChat, seedUser } from "./_support.ts";

function isConstraintErr(err: unknown): boolean {
  return isConstraintViolation(err) !== undefined;
}

const BEHAVIOR: RegexScriptBehavior = regexScriptBehaviorSchema.parse({
  findRegex: "foo",
  replaceString: "bar",
  placement: ["AI_OUTPUT"],
});

async function seedScript(db: Db, ownerId: UserId, id: string): Promise<RegexScriptId> {
  const scriptId = castId<RegexScriptId>(id);
  await db.insert(regexScripts).values({ id: scriptId, ownerId, name: "Script", behavior: BEHAVIOR });
  return scriptId;
}

test("regex_scripts round-trips, defaults enabled=true, borns timestamps", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_regex_a" });
  const id = await seedScript(db, ownerId, "regex_script_a");

  const rows = await db.select().from(regexScripts).where(eq(regexScripts.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.enabled).toBe(true);
  expect(rows[0]?.createdAt).toBeGreaterThan(0);
  expect(rows[0]?.updatedAt).toBeGreaterThan(0);
  expect(rows[0]?.behavior).toEqual(BEHAVIOR);
});

test("owner CASCADE on regex_scripts wipes every attached junction row", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_regex_b" });
  const scriptId = await seedScript(db, ownerId, "regex_script_b");
  const characterId = castId<CharacterId>("character_regex_b");
  await db.insert(characters).values({ id: characterId, handle: castId<CharacterHandle>("card-regex-b"), ownerId, contentHash: "h", name: "C" });
  const chatId = await seedChat(db, { id: "chat_regex_b" });
  const presetId = castId<PresetId>("preset_regex_b");
  await db.insert(presets).values({ id: presetId, ownerId, name: "P", kind: "roleplay", config: DEFAULT_PROMPT_CONFIG });

  await db.insert(globalRegexScripts).values({ regexScriptId: scriptId });
  await db.insert(characterRegexScripts).values({ characterId, regexScriptId: scriptId });
  await db.insert(presetRegexScripts).values({ presetId, regexScriptId: scriptId });
  await db.insert(chatRegexScripts).values({ chatId, regexScriptId: scriptId });

  await db.delete(regexScripts).where(eq(regexScripts.id, scriptId));

  expect(await db.select().from(globalRegexScripts).where(eq(globalRegexScripts.regexScriptId, scriptId))).toHaveLength(0);
  expect(await db.select().from(characterRegexScripts).where(eq(characterRegexScripts.regexScriptId, scriptId))).toHaveLength(0);
  expect(await db.select().from(presetRegexScripts).where(eq(presetRegexScripts.regexScriptId, scriptId))).toHaveLength(0);
  expect(await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.regexScriptId, scriptId))).toHaveLength(0);
});

test("globalRegexScripts: singleton PK on regexScriptId, position defaults, dupe attach collides", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_regex_c" });
  const scriptId = await seedScript(db, ownerId, "regex_script_c");

  await db.insert(globalRegexScripts).values({ regexScriptId: scriptId });
  const rows = await db.select().from(globalRegexScripts).where(eq(globalRegexScripts.regexScriptId, scriptId));
  expect(rows[0]?.position).toBe(0);

  // The PK IS the script id — a second attach collides.
  await expect(db.insert(globalRegexScripts).values({ regexScriptId: scriptId, position: 1 })).rejects.toSatisfy(isConstraintErr);
});

test("characterRegexScripts: composite PK + dupe attach collides; scope (character) delete keeps the script, wipes its junction row", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_regex_d" });
  const scriptId = await seedScript(db, ownerId, "regex_script_d");
  const characterId = castId<CharacterId>("character_regex_d");
  await db.insert(characters).values({ id: characterId, handle: castId<CharacterHandle>("card-regex-d"), ownerId, contentHash: "h", name: "C" });

  await db.insert(characterRegexScripts).values({ characterId, regexScriptId: scriptId, position: 2 });
  await expect(db.insert(characterRegexScripts).values({ characterId, regexScriptId: scriptId })).rejects.toSatisfy(isConstraintErr);

  await db.delete(characters).where(eq(characters.id, characterId));
  expect(await db.select().from(characterRegexScripts).where(eq(characterRegexScripts.characterId, characterId))).toHaveLength(0);
  // The script itself survives — only the junction row was scoped to the character.
  expect(await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId))).toHaveLength(1);
});

test("presetRegexScripts: composite PK; preset delete keeps the script, wipes its junction row", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_regex_e" });
  const scriptId = await seedScript(db, ownerId, "regex_script_e");
  const presetId = castId<PresetId>("preset_regex_e");
  await db.insert(presets).values({ id: presetId, ownerId, name: "P", kind: "roleplay", config: DEFAULT_PROMPT_CONFIG });

  await db.insert(presetRegexScripts).values({ presetId, regexScriptId: scriptId });
  await expect(db.insert(presetRegexScripts).values({ presetId, regexScriptId: scriptId })).rejects.toSatisfy(isConstraintErr);

  await db.delete(presets).where(eq(presets.id, presetId));
  expect(await db.select().from(presetRegexScripts).where(eq(presetRegexScripts.presetId, presetId))).toHaveLength(0);
  expect(await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId))).toHaveLength(1);
});

test("chatRegexScripts: composite PK; chat delete keeps the script, wipes its junction row", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_regex_f" });
  const scriptId = await seedScript(db, ownerId, "regex_script_f");
  const chatId = await seedChat(db, { id: "chat_regex_f" });

  await db.insert(chatRegexScripts).values({ chatId, regexScriptId: scriptId });
  await expect(db.insert(chatRegexScripts).values({ chatId, regexScriptId: scriptId })).rejects.toSatisfy(isConstraintErr);

  await db.delete(chats).where(eq(chats.id, chatId));
  expect(await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId))).toHaveLength(1);
});
