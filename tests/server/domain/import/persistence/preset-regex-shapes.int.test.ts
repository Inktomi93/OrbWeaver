// A SillyTavern preset's regex scripts import through the real folder door and run, whatever their pattern's shape:
// no script is refused for a stacked or nested quantifier (D53). A script over a stored-length cap, or one whose find
// costs more to compile than the write door admits, is left behind and named in the import report.
// @subject packages/server/src/domain/import/substrate/preset.ts
// @subject packages/contracts/src/regex/schemas.ts
// @subject packages/kit/src/regex/index.ts
import { readFile } from "node:fs/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import { cardImportResultSchema, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { MAX_REPLACE_LENGTH } from "@orb/contracts/regex";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { MAX_FIND_REGEX_LENGTH } from "@orb/kit/regex";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes, readRoomCanon, seedTranscript } from "@orb/testkit/node/composed";
import { z } from "zod";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";
import { admit, finishRun, harness, presetOf, settings } from "./_st-tree-door.ts";

// ST's numeric placement for the user's input, the leg an edit of a user line re-applies.
const ST_USER_INPUT = 1;
const PRESET = "HUD";
const LONG_REPLACE = 30_000;
const JSON_OBJECT = z.record(z.string(), z.unknown());

/** A find pattern of exactly `length` characters that matches `head`, padded in front with empty groups. It is only
 *  stored, never run: thousands of capture groups cost more to compile than the watchdog allows. */
function padded(head: string, length: number): string {
  const room = length - head.length;
  const odd = room % 2 === 1;
  return `${odd ? "(|)" : ""}${"()".repeat((room - (odd ? 3 : 0)) / 2)}${head}`;
}

/** A long find pattern that runs: `head` behind an alternation of literal words that never match, as a panel's
 *  markup makes a real pattern long. */
function longLiteral(head: string, length: number): string {
  const words = Array.from({ length: Math.ceil(length / 8) }, (_, i) => `zq${String(i)}`).join("|");
  return `(?:${words})|${head}`;
}

function stScript(scriptName: string, findRegex: string, replaceString: string): Record<string, unknown> {
  return {
    id: `st-${scriptName}`,
    scriptName,
    findRegex,
    replaceString,
    trimStrings: [],
    placement: [ST_USER_INPUT],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
  };
}

// Each shape a static check once refused, then one past each stored cap.
const SCRIPTS = [
  stScript("three lazy groups", "/<a>(.*?)<\\/a><b>(.*?)<\\/b><c>(.*?)<\\/c>/g", "[$1|$2|$3]"),
  stScript("optional repeated group", "/(?:x+)?Z/g", "N"),
  stScript("long find", longLiteral("lamp", 12_000), "L"),
  stScript("long replace", "end", "E".repeat(LONG_REPLACE)),
  stScript("find over the cap", padded("never", MAX_FIND_REGEX_LENGTH + 1), ""),
  stScript("replace over the cap", "never", "R".repeat(MAX_REPLACE_LENGTH + 1)),
];

test("every shape imports and runs on the host's edit, and only a script past a length cap is left out, by name", async () => {
  await using root = await harness();
  const preset = { ...JSON_OBJECT.parse(JSON.parse(presetOf("You run the HUD."))), extensions: { ["regex_scripts"]: SCRIPTS } };

  const result = await finishRun(root, await admit(root, { [ST_SETTINGS_FILE]: settings({}), [`OpenAI Settings/${PRESET}.json`]: JSON.stringify(preset) }));

  const caller = await root.internalCallerFor(root.ownerId);
  const landed = (await caller.preset.list()).find((row) => row.name === `${PRESET} (OpenAI)`);
  if (landed === undefined || result.reportPath === undefined) {
    throw new Error("the preset did not land, or the run wrote no report");
  }
  expect((await caller.regex.listForPreset({ presetId: landed.id })).map((script) => script.name)).toEqual(SCRIPTS.slice(0, 4).map((s) => s["scriptName"]));
  const report = await readFile(result.reportPath, "utf8");
  expect(report).toContain(
    `script "find over the cap" not imported: its find pattern is ${MAX_FIND_REGEX_LENGTH + 1} characters, over the ${MAX_FIND_REGEX_LENGTH}`,
  );
  expect(report).toContain(
    `script "replace over the cap" not imported: its replacement is ${MAX_REPLACE_LENGTH + 1} characters, over the ${MAX_REPLACE_LENGTH}`,
  );

  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: landed.id } });
  const character = await caller.character.create({ input: createCharacterSchema.parse({ handle: "hud", name: "HUD", description: "" }) });
  const { chatId } = await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [character.handle], lines: [{ role: "user", content: "seed" }] });
  const [line] = await readRoomCanon(root, await root.principalFor(root.ownerId), chatId);
  if (line === undefined) {
    throw new Error("the transcript import wrote no user line");
  }

  const edited = await caller.chat.editMessage({ chatId, messageId: line.id, content: "<a>1</a><b>2</b><c>3</c> xxZ lamp end", timeZone: UTC_TIME_ZONE });

  expect(edited.content).toBe(`[1|2|3] N L ${"E".repeat(LONG_REPLACE)}`);
});

// Capture groups of alternation up to the stored length cap: storable by length, refused only by the door's
// measured compile.
const COMPILE_HEAVY = `${"(a|b)".repeat(Math.floor((MAX_FIND_REGEX_LENGTH - 4) / 5))}lamp`;
const REFUSED = /script \\?"heavy (preset|global|card)\\?" not imported: its find pattern costs \d+ ms to compile and first run, over the \d+ ms limit/g;

function refusedScopes(text: string): string[] {
  return [...text.matchAll(REFUSED)].map((match) => match[1] ?? "").toSorted();
}

test("each lift refuses a compile-heavy find by name and keeps the panel script beside it", { tags: ["slow"] }, async () => {
  await using root = await harness();
  const panel = (scope: string): Record<string, unknown> => stScript(`panel ${scope}`, "/<hud>([\\s\\S]*?)<\\/hud>/g", "$1");
  const heavy = (scope: string): Record<string, unknown> => stScript(`heavy ${scope}`, COMPILE_HEAVY, "");
  const preset = {
    ...JSON_OBJECT.parse(JSON.parse(presetOf("You run the HUD."))),
    extensions: { ["regex_scripts"]: [panel("preset"), heavy("preset")] },
  };
  const profileSettings = { ...JSON_OBJECT.parse(JSON.parse(settings({}))), ["extension_settings"]: { regex: [panel("global"), heavy("global")] } };

  const result = await finishRun(
    root,
    await admit(root, { [ST_SETTINGS_FILE]: JSON.stringify(profileSettings), [`OpenAI Settings/${PRESET}.json`]: JSON.stringify(preset) }),
  );
  const card = {
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: { name: "Gauge", description: "A gauge.", extensions: { ["regex_scripts"]: [panel("card"), heavy("card")] } },
  };
  const form = new FormData();
  form.append(
    UPLOAD_FILE_FIELD,
    new File([new Uint8Array(writeCardChunk(new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))), JSON.stringify(card)))], "Gauge.png"),
  );
  const response = await root.http.request(PORTABILITY_ROUTES.importCards, { method: "POST", headers: CSRF_HEADERS, body: form });
  const cardResult = cardImportResultSchema.parse(await response.json());

  if (result.reportPath === undefined) {
    throw new Error("the run wrote no report");
  }
  expect(refusedScopes(await readFile(result.reportPath, "utf8"))).toEqual(["global", "preset"]);
  expect(refusedScopes((cardResult.imported[0]?.notes ?? []).join("\n"))).toEqual(["card"]);
  const caller = await root.internalCallerFor(root.ownerId);
  expect((await caller.regex.listScripts()).map((script) => script.name).toSorted()).toEqual(["panel card", "panel global", "panel preset"]);
});
