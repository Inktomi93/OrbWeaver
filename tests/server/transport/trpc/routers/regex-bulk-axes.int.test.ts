// @subject packages/server/src/transport/trpc/routers/regex.ts
// @subject packages/server/src/domain/regex/verbs/scripts/bulk-set-axes.ts
// The bulk axes door: both axes replace on every owned listed script, a pair a write refuses is refused before any
// row is read, a move to the save pass clears and names the depth and author scope it drops, and a foreign script
// is neither changed nor counted.
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { expect, test } from "@orb/testkit/node";

const PROMPT_WITH_DEPTH = createRegexScriptSchema.parse({
  name: "recent turns",
  findRegex: "a",
  replaceString: "b",
  targets: ["AI_OUTPUT"],
  passes: ["prompt"],
  depth: { min: 0, max: 3 },
});

test("a bulk move to the save pass clears and names the prompt-only scope; an ephemeral move keeps it", async ({ ownerCaller, otherCaller }) => {
  const scoped = await ownerCaller.regex.createScript({ input: PROMPT_WITH_DEPTH });
  const plain = await ownerCaller.regex.createScript({ input: { ...PROMPT_WITH_DEPTH, name: "plain", depth: undefined } });
  const foreign = await otherCaller.regex.createScript({ input: PROMPT_WITH_DEPTH });

  expect(
    await ownerCaller.regex.bulkSetAxes({ scriptIds: [scoped.id, plain.id], targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["display", "prompt"] }),
  ).toEqual({
    affected: 2,
    cleared: [],
  });
  expect((await ownerCaller.regex.listScripts()).find((row) => row.id === scoped.id)).toMatchObject({
    targets: ["USER_INPUT", "AI_OUTPUT"],
    passes: ["display", "prompt"],
    depth: { min: 0, max: 3 },
  });

  expect(await ownerCaller.regex.bulkSetAxes({ scriptIds: [scoped.id, plain.id, foreign.id], targets: ["AI_OUTPUT"], passes: ["save"] })).toEqual({
    affected: 2,
    cleared: [scoped.id],
  });
  const saved = (await ownerCaller.regex.listScripts()).find((row) => row.id === scoped.id);
  expect(saved).toMatchObject({ targets: ["AI_OUTPUT"], passes: ["save"] });
  expect(saved?.depth).toBeUndefined();
  // The foreign script kept its own axes and its depth.
  expect((await otherCaller.regex.listScripts()).find((row) => row.id === foreign.id)).toMatchObject({ passes: ["prompt"], depth: { min: 0, max: 3 } });
});

test("a save pass beside an ephemeral one is refused before any row changes", async ({ ownerCaller }) => {
  const script = await ownerCaller.regex.createScript({ input: PROMPT_WITH_DEPTH });

  await expect(ownerCaller.regex.bulkSetAxes({ scriptIds: [script.id], targets: ["AI_OUTPUT"], passes: ["save", "display"] })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect((await ownerCaller.regex.listScripts()).find((row) => row.id === script.id)).toMatchObject({ passes: ["prompt"] });
});
