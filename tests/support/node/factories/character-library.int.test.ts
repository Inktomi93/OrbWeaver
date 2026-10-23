// @subject tests/support/node/factories/character.ts
// @subject packages/server/src/domain/character/verbs/snapshot.ts
// @subject packages/server/src/domain/character/verbs/get-snapshot.ts
// @subject packages/server/src/domain/character/verbs/list-snapshots.ts
// @subject packages/server/src/domain/character/verbs/list.ts
import { createCharacterSchema, listCharactersResultSchema, snapshotRefSchema, snapshotSummarySchema, snapshotViewSchema } from "@orb/contracts/character";
import { characterSnapshots } from "@orb/db";
import { eq } from "drizzle-orm";
import { seedCorpusLibraries } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedCharacterHistory, seedCharacterSnapshot, seedCreatedCharacter } from "./character.ts";

test("history captures preserve the selected stored card after later live edits and keep one snapshot per producer call", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const character = await seedCreatedCharacter(root, {
    principal,
    input: createCharacterSchema.parse({ handle: "history-subject", name: "Ledger keeper", description: "The original testimony." }),
  });
  const params = { principal, characterId: character.row.id };
  expect(await root.services.character.listSnapshots(params)).toEqual([]);
  const first = await seedCharacterHistory(root, { ...params, label: "Original" });
  expect(first.row).toEqual(await root.db.select().from(characterSnapshots).where(eq(characterSnapshots.id, first.ref.id)).get());
  expect(first.view).toMatchObject({
    id: first.ref.id,
    label: first.row.label,
    createdAt: first.row.createdAt,
    content: { description: "The original testimony." },
  });
  root.clock.advance(2000);
  await root.services.character.update({ ...params, input: { description: "The revised testimony." } });
  const second = await seedCharacterHistory(root, { ...params, label: "Revised" });
  expect(second.ref.id).not.toBe(first.ref.id);
  expect(second.summaries.map((row) => row.id)).toEqual([second.ref.id, first.ref.id]);
  expect(second.view.content.description).toBe("The revised testimony.");
  const selected = await root.services.character.getSnapshot({ ...params, snapshotId: first.ref.id });
  expect(selected).toEqual(first.view);
  expect(selected.content.description).not.toBe((await root.services.character.get(params)).description);
  root.clock.advance(2000);
  const rowOnly = await seedCharacterSnapshot(root, { ...params, label: "Row-only API" });
  expect(await root.db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, character.row.id))).toHaveLength(3);
  expect(rowOnly).toMatchObject({ characterId: character.row.id, label: "Row-only API", content: { description: "The revised testimony." } });
});

test("library history pages retain the real whole-library census, keyset order and cross-page name ambiguity", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const created: Awaited<ReturnType<typeof seedCreatedCharacter>>[] = [];
  for (const [handle, name] of [
    ["page-first", "Alpha"],
    ["page-second", "Alpha"],
    ["page-last", "Beta"],
  ]) {
    created.push(
      await seedCreatedCharacter(root, {
        principal,
        input: createCharacterSchema.parse({ handle, name, description: "A page witness." }),
      }),
    );
  }
  const [first, second, last] = created;
  if (first === undefined || second === undefined || last === undefined) {
    throw new Error("the production library did not create its page witnesses");
  }
  const history = await seedCharacterHistory(root, { principal, characterId: first.row.id }, { sort: "alpha", limit: 1 });
  expect(history.page.items.map((row) => [row.id, row.nameIsAmbiguous])).toEqual([[first.row.id, true]]);
  expect(history.page.totalCount).toBe(3);
  const cursor = history.page.nextCursor;
  if (cursor === null) {
    throw new Error("the real full page omitted its keyset continuation");
  }
  const next = await root.services.character.list({ principal, sort: "alpha", limit: 2, cursor });
  expect(next.items.map((row) => [row.id, row.nameIsAmbiguous])).toEqual([
    [second.row.id, true],
    [last.row.id, false],
  ]);
  expect(next.totalCount).toBe(history.page.totalCount);
  expect(listCharactersResultSchema.parse(history.page)).toEqual(history.page);
  expect(snapshotRefSchema.parse(history.ref)).toEqual(history.ref);
  expect(snapshotViewSchema.parse(history.view)).toEqual(history.view);
  for (const summary of history.summaries) {
    expect(snapshotSummarySchema.parse(summary)).toEqual(summary);
  }
  const missingContent = structuredClone(history.view);
  Reflect.deleteProperty(missingContent, "content");
  expect(snapshotViewSchema.safeParse(missingContent).success).toBe(false);
  const missingCensus = structuredClone(history.page);
  Reflect.deleteProperty(missingCensus, "totalCount");
  expect(listCharactersResultSchema.safeParse(missingCensus).success).toBe(false);
  const summary = history.summaries[0];
  if (summary === undefined) {
    throw new Error("the actual snapshot did not appear in its history list");
  }
  const missingSummary = structuredClone(summary);
  Reflect.deleteProperty(missingSummary, "label");
  expect(snapshotSummarySchema.safeParse(missingSummary).success).toBe(false);
});

test("shared library captures retain the outward snapshot row and native history/page outputs privately", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  expect(library.history.row).toEqual(library.snapshot);
  expect(library.history.ref.id).toBe(library.snapshot.id);
  expect(library.history.view.content).toEqual(library.snapshot.content);
  expect(library.history.summaries.map((row) => row.id)).toEqual([library.snapshot.id]);
  expect(library.history.page.items.map((row) => row.id)).toContain(library.character.id);
});
