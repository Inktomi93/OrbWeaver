// Deleting a preset can take the regex scripts only it used. The delete removes a named script only when it is left on
// no attachment, so a script another preset, a character, a room or the global tier uses survives even when named; an
// unnamed one stays in the library, attached nowhere, where the library's own sweep lists and deletes it.
// @subject packages/server/src/domain/preset/verbs/remove.ts
// @subject packages/server/src/domain/regex/persistence/queries.ts
// @subject packages/server/src/domain/regex/verbs/scripts/remove-unattached.ts
// @subject packages/server/src/domain/regex/verbs/attachments/list-preset-only.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { expect } from "@orb/testkit/node";
import { test } from "../../../entry/compose/room-reach.fixtures.ts";

const SCRIPT = createRegexScriptSchema.parse({ name: "script", findRegex: "x", replaceString: "y", targets: ["AI_OUTPUT"], passes: ["display"] });

test("a preset delete takes only the chosen scripts it leaves attached to nothing, and the library sweeps the rest", async ({
  ownerCaller,
  otherCaller,
}): Promise<void> => {
  const preset = await ownerCaller.preset.create({ name: "Heavy preset", kind: "custom" });
  const sibling = await ownerCaller.preset.create({ name: "Sibling preset", kind: "custom" });
  const card = await ownerCaller.character.create({ input: createCharacterSchema.parse({ handle: "lamp", name: "Mira", description: "Keeps the lamp." }) });
  const room = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  const script = async (name: string): Promise<Awaited<ReturnType<typeof ownerCaller.regex.createScript>>> => {
    const row = await ownerCaller.regex.createScript({ input: { ...SCRIPT, name } });
    await ownerCaller.regex.attachToPreset({ presetId: preset.id, scriptId: row.id });
    return row;
  };
  const chosen = await script("chosen");
  const unchecked = await script("unchecked");
  const shared = await script("shared");
  const global = await script("global");
  const onCard = await script("on card");
  const inRoom = await script("in room");
  await ownerCaller.regex.attachToPreset({ presetId: sibling.id, scriptId: shared.id });
  await ownerCaller.regex.attachGlobal({ scriptId: global.id });
  await ownerCaller.regex.attachToCharacter({ characterId: card.id, scriptId: onCard.id });
  await ownerCaller.regex.attachToChat({ chatId: room.id, scriptId: inRoom.id });
  const foreign = await otherCaller.regex.createScript({ input: { ...SCRIPT, name: "foreign" } });

  // The offer names only the scripts no other scope uses: the global tier counts as a use.
  expect((await ownerCaller.regex.listPresetOnly({ presetId: preset.id })).map(({ name }) => name)).toEqual(["chosen", "unchecked"]);

  // A stale client names the shared scripts too; the delete keeps every one another scope still uses.
  await ownerCaller.preset.remove({ id: preset.id, scriptIds: [chosen.id, shared.id, global.id, onCard.id, inRoom.id] });

  const library = (await ownerCaller.regex.listScripts()).map(({ name }) => name).toSorted();
  expect(library).toEqual(["global", "in room", "on card", "shared", "unchecked"]);
  expect((await ownerCaller.regex.listForPreset({ presetId: sibling.id })).map(({ name }) => name)).toEqual(["shared"]);
  expect((await ownerCaller.regex.listGlobal()).map(({ name }) => name)).toEqual(["global"]);
  // The unchecked script stayed, attached nowhere, and the library lists it as such.
  expect((await ownerCaller.regex.listUnattached()).map(({ name }) => name)).toEqual(["unchecked"]);

  // The sweep deletes only what is still attached nowhere, and never another owner's script.
  expect(await ownerCaller.regex.removeUnattached({ scriptIds: [unchecked.id, shared.id, foreign.id] })).toEqual({ affected: 1 });
  expect((await ownerCaller.regex.listScripts()).map(({ name }) => name).toSorted()).toEqual(["global", "in room", "on card", "shared"]);
  expect(await ownerCaller.regex.listUnattached()).toEqual([]);
  expect((await otherCaller.regex.listScripts()).map(({ name }) => name)).toEqual(["foreign"]);
});

test("a preset delete that names no scripts leaves every script, and another owner cannot read a preset's offer", async ({
  ownerCaller,
  otherCaller,
}): Promise<void> => {
  const preset = await ownerCaller.preset.create({ name: "Kept scripts", kind: "custom" });
  const row = await ownerCaller.regex.createScript({ input: SCRIPT });
  await ownerCaller.regex.attachToPreset({ presetId: preset.id, scriptId: row.id });

  await expect(otherCaller.regex.listPresetOnly({ presetId: preset.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Positive control for the refusal: the owner reads the same offer.
  expect((await ownerCaller.regex.listPresetOnly({ presetId: preset.id })).map(({ id }) => id)).toEqual([row.id]);

  await ownerCaller.preset.remove({ id: preset.id });

  expect((await ownerCaller.regex.listScripts()).map(({ id }) => id)).toEqual([row.id]);
  expect((await ownerCaller.regex.listUnattached()).map(({ id }) => id)).toEqual([row.id]);
});
