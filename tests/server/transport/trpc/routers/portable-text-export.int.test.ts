// @subject packages/server/src/transport/trpc/routers/persona.ts
// @subject packages/server/src/transport/trpc/routers/regex.ts
// @subject packages/server/src/transport/trpc/routers/world-info.ts
import { personaBackupSchema } from "@orb/contracts/persona";
import { portableTextFileSchema } from "@orb/contracts/portability";
import { createRegexScriptSchema, portableRegexScriptSchema } from "@orb/contracts/regex";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

test("persona download wrapper retains native backup contents and cannot export a stranger's persona", async ({ ownerCaller, otherCaller }) => {
  const persona = await ownerCaller.persona.create({ input: { name: "Owned export", description: "Only this owner's prose." } });
  await expect(otherCaller.persona.export({ personaId: persona.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const file = portableTextFileSchema.parse(await ownerCaller.persona.export({ personaId: persona.id }));
  expect(Object.keys(file).sort()).toEqual(["fileText", "filename"]);
  expect(file.filename).toBe("owned-export.json");
  expect(personaBackupSchema.parse(JSON.parse(file.fileText))).toMatchObject({ name: persona.name, description: persona.description });
  const restored = await otherCaller.persona.import({ fileText: file.fileText });
  expect(restored.id).not.toBe(persona.id);
  expect(restored).toMatchObject({ name: persona.name, description: persona.description });
});

test("regex download wrapper round-trips the script's actual native format without widening export authority", async ({ ownerCaller, otherCaller }) => {
  const script = await ownerCaller.regex.createScript({
    input: createRegexScriptSchema.parse({
      name: "Owned script",
      findRegex: "needle",
      replaceString: "replacement",
      targets: ["AI_OUTPUT"],
      passes: ["display"],
    }),
  });
  await expect(otherCaller.regex.exportScript({ scriptId: script.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const file = portableTextFileSchema.parse(await ownerCaller.regex.exportScript({ scriptId: script.id }));
  expect(Object.keys(file).sort()).toEqual(["fileText", "filename"]);
  expect(file.filename).toBe(`owned-script-${script.id}.json`);
  expect(portableRegexScriptSchema.parse(JSON.parse(file.fileText))).toMatchObject({ name: script.name, findRegex: "needle", replaceString: "replacement" });
  const restored = await otherCaller.regex.importScriptFile({ fileText: file.fileText });
  expect(restored.created).toBe(true);
  expect(await otherCaller.regex.listScripts()).toMatchObject([{ name: script.name, findRegex: "needle", replaceString: "replacement" }]);
  // SillyTavern imports the same file and reads only its own spelling; an edit made there comes back as edited.
  const wire = z.record(z.string(), z.unknown()).parse(JSON.parse(file.fileText));
  expect(wire).toMatchObject({ scriptName: script.name, disabled: false, placement: [2], markdownOnly: true, promptOnly: false });
  await otherCaller.regex.importScriptFile({ fileText: JSON.stringify({ ...wire, scriptName: "Edited in SillyTavern", markdownOnly: false }) });
  expect((await otherCaller.regex.listScripts()).find(({ name }) => name === "Edited in SillyTavern")).toMatchObject({
    targets: ["AI_OUTPUT"],
    passes: ["save"],
  });
});

test("world-info download wrapper round-trips the owned book while a foreign direct read stays NOT_FOUND", async ({ ownerCaller, otherCaller }) => {
  const book = await ownerCaller.worldInfo.createBook({ input: { name: "Owned lore", description: "Native book prose." } });
  await expect(otherCaller.worldInfo.exportBook({ bookId: book.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const file = portableTextFileSchema.parse(await ownerCaller.worldInfo.exportBook({ bookId: book.id }));
  expect(Object.keys(file).sort()).toEqual(["fileText", "filename"]);
  expect(file.filename).toBe("owned-lore.json");
  const restored = await otherCaller.worldInfo.importFile({ fileText: file.fileText });
  expect(restored).toMatchObject({ created: true, name: book.name });
  expect(await otherCaller.worldInfo.listBooks()).toMatchObject([{ name: book.name, description: book.description }]);
});
