import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { vi } from "vitest";

const FIRST_NAME = "Asterquill";
const SECOND_NAME = "Brindleharbor";
const NEXT_NAME = "Cinderwatch";
const RESULT_LIMIT = 10;

async function card(root: ServerTestHarness, name: string): ReturnType<ServerTestHarness["services"]["character"]["create"]> {
  const principal = await root.principalFor(root.ownerId);
  const created = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ name, handle: name.toLowerCase(), description: name }),
  });
  await root.settleBackground();
  return created;
}

function suggest(root: ServerTestHarness, query: string): ReturnType<ServerTestHarness["services"]["search"]["suggest"]> {
  return root.services.search.suggest({ ownerId: root.ownerId, query, limit: RESULT_LIMIT });
}

test("same-ID cold searches build independent indexes while each root shares its own concurrent misses", async () => {
  await using first = await createServerHarness({ startJobs: false });
  await using second = await createServerHarness({ startJobs: false });
  const firstCard = await card(first, FIRST_NAME);
  const secondCard = await card(second, SECOND_NAME);
  expect(first.ownerId).toBe(second.ownerId);
  expect(firstCard.id).toBe(secondCard.id);
  using firstReads = vi.spyOn(first.db, "select");
  using secondReads = vi.spyOn(second.db, "select");
  const [firstResult, firstConcurrent, secondResult, secondConcurrent] = await Promise.all([
    suggest(first, FIRST_NAME),
    suggest(first, FIRST_NAME),
    suggest(second, SECOND_NAME),
    suggest(second, SECOND_NAME),
  ]);
  expect(firstResult.map((row) => row.suggestion)).toEqual([FIRST_NAME.toLowerCase()]);
  expect(firstConcurrent).toEqual(firstResult);
  expect(secondResult.map((row) => row.suggestion)).toEqual([SECOND_NAME.toLowerCase()]);
  expect(secondConcurrent).toEqual(secondResult);
  expect(firstReads).toHaveBeenCalledTimes(1);
  expect(secondReads).toHaveBeenCalledTimes(1);
  expect(await suggest(first, SECOND_NAME)).toEqual([]);
  expect(await suggest(second, FIRST_NAME)).toEqual([]);
  expect(await first.services.search.fields({ ownerId: first.ownerId, query: FIRST_NAME, topN: RESULT_LIMIT })).toMatchObject({
    hits: [{ characterId: firstCard.id, name: FIRST_NAME }],
    coverage: { indexedCharacters: 1, matchingCharacters: 1 },
  });
  expect(await second.services.search.fields({ ownerId: second.ownerId, query: SECOND_NAME, topN: RESULT_LIMIT })).toMatchObject({
    hits: [{ characterId: secondCard.id, name: SECOND_NAME }],
    coverage: { indexedCharacters: 1, matchingCharacters: 1 },
  });
});

test("a same-ID sibling's card writes and disposal cannot evict or replace a warmed root index", async () => {
  await using first = await createServerHarness({ startJobs: false });
  await using second = await createServerHarness({ startJobs: false });
  await card(first, FIRST_NAME);
  const secondCard = await card(second, SECOND_NAME);
  expect((await suggest(first, FIRST_NAME)).map((row) => row.suggestion)).toEqual([FIRST_NAME.toLowerCase()]);
  expect((await suggest(second, SECOND_NAME)).map((row) => row.suggestion)).toEqual([SECOND_NAME.toLowerCase()]);
  using firstReads = vi.spyOn(first.db, "select");
  await second.services.character.update({
    principal: await second.principalFor(second.ownerId),
    characterId: secondCard.id,
    input: { name: NEXT_NAME, description: NEXT_NAME },
  });
  await second.settleBackground();
  expect((await suggest(first, FIRST_NAME)).map((row) => row.suggestion)).toEqual([FIRST_NAME.toLowerCase()]);
  expect(firstReads).not.toHaveBeenCalled();
  expect((await suggest(second, NEXT_NAME)).map((row) => row.suggestion)).toEqual([NEXT_NAME.toLowerCase()]);
  expect(await suggest(second, SECOND_NAME)).toEqual([]);
  await second[Symbol.asyncDispose]();
  expect((await suggest(first, FIRST_NAME)).map((row) => row.suggestion)).toEqual([FIRST_NAME.toLowerCase()]);
  expect(firstReads).not.toHaveBeenCalled();
  await expect(suggest(second, NEXT_NAME)).rejects.toThrow();
});
