import "../../../support/composed-real.ts";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedUser } from "../../domain/chat/_support.ts";

test("dedicated collection censuses do not enter enrichment and preserve the page's owner scope", async ({ services, db }) => {
  const owner = await seedUser(db, castId<Handle>("collection-census-owner"));
  const other = await seedUser(db, castId<Handle>("collection-census-other"));
  await seedCharacter(db, owner, "collection-own-character");
  await seedCharacter(db, other, "collection-foreign-character");
  await services.worldInfo.createBook({ principal: principal(owner), input: { name: "Own book" } });
  await services.worldInfo.createBook({ principal: principal(other), input: { name: "Other book" } });
  const select = vi.spyOn(db, "select");
  expect(await services.character.count({ principal: principal(owner) })).toBe(1);
  expect(await services.worldInfo.countBooks({ principal: principal(owner) })).toBe(1);
  expect(await services.regex.countScripts({ principal: principal(owner) })).toBe(0);
  expect(await services.rosterPreset.count({ principal: principal(owner) })).toBe(0);
  expect(await services.chat.countChats({ principal: principal(owner) })).toBe(0);
  expect(select).toHaveBeenCalledTimes(5);
});
