// @subject packages/server/src/transport/trpc/routers/regex.ts
// @subject packages/server/src/domain/regex/verbs/scripts/update.ts
// The editor's patch door: a move to the save pass drops the depth and author scope it leaves nothing to apply to,
// so a later move back to an ephemeral pass does not bring them back live, a null depth or author scope clears it
// where an omitted one stays, and a merged body that breaks a pairing rule is refused with the stored row unchanged.
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { PARTICIPANT_ROLES } from "@orb/kit/message-author";
import { expect, test } from "@orb/testkit/node";

const [HOST] = PARTICIPANT_ROLES;
const SCOPED_DISPLAY = createRegexScriptSchema.parse({
  name: "host panel",
  findRegex: "a",
  replaceString: "b",
  targets: ["AI_OUTPUT"],
  passes: ["display"],
  depth: { min: 0, max: 2 },
  authors: { include: [{ by: "standing", standing: HOST }], exclude: [] },
});

test("a patch to the save pass drops the depth and author scope, and a move back to the prompt finds none", async ({ ownerCaller }) => {
  const script = await ownerCaller.regex.createScript({ input: SCOPED_DISPLAY });

  await ownerCaller.regex.updateScript({ scriptId: script.id, input: { passes: ["save"] } });
  const saved = (await ownerCaller.regex.listScripts()).find((row) => row.id === script.id);
  expect(saved).toMatchObject({ passes: ["save"] });
  expect(saved?.depth).toBeUndefined();
  expect(saved?.authors).toBeUndefined();

  expect(await ownerCaller.regex.bulkSetAxes({ scriptIds: [script.id], targets: ["AI_OUTPUT"], passes: ["prompt"] })).toEqual({ affected: 1, cleared: [] });
  const back = (await ownerCaller.regex.listScripts()).find((row) => row.id === script.id);
  expect(back).toMatchObject({ passes: ["prompt"] });
  expect(back?.depth).toBeUndefined();
  expect(back?.authors).toBeUndefined();
});

test("a patch that keeps an ephemeral pass keeps its scope, and a save pass beside it is refused", async ({ ownerCaller }) => {
  const script = await ownerCaller.regex.createScript({ input: SCOPED_DISPLAY });

  await ownerCaller.regex.updateScript({ scriptId: script.id, input: { passes: ["display", "prompt"] } });
  expect((await ownerCaller.regex.listScripts()).find((row) => row.id === script.id)).toMatchObject({
    passes: ["display", "prompt"],
    depth: SCOPED_DISPLAY.depth,
    authors: SCOPED_DISPLAY.authors,
  });

  await expect(ownerCaller.regex.updateScript({ scriptId: script.id, input: { passes: ["save", "display"] } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect((await ownerCaller.regex.listScripts()).find((row) => row.id === script.id)).toMatchObject({ passes: ["display", "prompt"] });
});

test("a null depth clears the range while an omitted author scope stays, then a null author scope clears it", async ({ ownerCaller }) => {
  const script = await ownerCaller.regex.createScript({ input: SCOPED_DISPLAY });
  const stored = async (): Promise<Awaited<ReturnType<typeof ownerCaller.regex.listScripts>>[number] | undefined> =>
    (await ownerCaller.regex.listScripts()).find((row) => row.id === script.id);

  await ownerCaller.regex.updateScript({ scriptId: script.id, input: { depth: null } });
  const cleared = await stored();
  expect(cleared?.depth).toBeUndefined();
  expect(cleared?.authors).toEqual(SCOPED_DISPLAY.authors);

  await ownerCaller.regex.updateScript({ scriptId: script.id, input: { authors: null } });
  expect((await stored())?.authors).toBeUndefined();
});

test("a clear sent beside a move to the save pass lands, and a clear on a when-saved script is a no-op", async ({ ownerCaller }) => {
  const script = await ownerCaller.regex.createScript({ input: SCOPED_DISPLAY });

  await ownerCaller.regex.updateScript({ scriptId: script.id, input: { passes: ["save"], depth: null, authors: null } });
  const saved = (await ownerCaller.regex.listScripts()).find((row) => row.id === script.id);
  expect(saved).toMatchObject({ passes: ["save"] });
  expect([saved?.depth, saved?.authors]).toEqual([undefined, undefined]);

  await ownerCaller.regex.updateScript({ scriptId: script.id, input: { replaceString: "c", depth: null, authors: null } });
  expect((await ownerCaller.regex.listScripts()).find((row) => row.id === script.id)).toMatchObject({ passes: ["save"], replaceString: "c" });
});
