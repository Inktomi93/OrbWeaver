import "@orb/testkit/node/composed-real.ts";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
import { seedCharacter, seedUser } from "../../domain/chat/_support.ts";

test("dedicated collection censuses do not enter enrichment and preserve the page's owner scope", async ({ services, db }) => {
  const owner = await seedUser(db, castId<Handle>("collection-census-owner"));
  const other = await seedUser(db, castId<Handle>("collection-census-other"));
  await seedCharacter(db, owner, "collection-own-character");
  await seedCharacter(db, other, "collection-foreign-character");
  await services.worldInfo.createBook({ principal: await principal({ db }, owner), input: { name: "Own book" } });
  await services.worldInfo.createBook({ principal: await principal({ db }, other), input: { name: "Other book" } });
  const select = vi.spyOn(db, "select");
  expect(await services.character.count({ principal: await principal({ db }, owner) })).toBe(1);
  expect(await services.worldInfo.countBooks({ principal: await principal({ db }, owner) })).toBe(1);
  expect(await services.regex.countScripts({ principal: await principal({ db }, owner) })).toBe(0);
  expect(await services.rosterPreset.count({ principal: await principal({ db }, owner) })).toBe(0);
  expect(await services.chat.countChats({ principal: await principal({ db }, owner) })).toBe(0);
  expect(select).toHaveBeenCalledTimes(5);
});
