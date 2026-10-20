// settings at the router: the update check spends the box's shared anonymous GitHub budget, so a plain member is
// refused before the verb runs; the version read stays open to every member (it is what a bug report quotes).

import type { Db } from "@orb/db";
import type { UpdateCheck } from "@orb/kit/version-identity";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
import { caller, makeContext, principal } from "../_support.ts";

const UP_TO_DATE: UpdateCheck = { status: "up-to-date", local: "0.1.0", remote: null, reason: null };

async function settingsFor(
  db: Db,
  role: "admin" | "user",
): Promise<{ readonly settings: ReturnType<typeof caller>["settings"]; readonly checkForUpdate: ReturnType<typeof vi.fn> }> {
  const checkForUpdate = vi.fn(() => Promise.resolve(UP_TO_DATE));
  const settings = caller(makeContext({ auth: await principal(db, role), services: { settings: { checkForUpdate } } })).settings;
  return { settings, checkForUpdate };
}

test("a member cannot run the update check, and the verb never runs", async () => {
  const db = await freshDb();
  const { settings, checkForUpdate } = await settingsFor(db, "user");
  await expect(settings.checkForUpdate()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(checkForUpdate).not.toHaveBeenCalled();
});

test("control: an admin reaches the update check", async () => {
  const db = await freshDb();
  const { settings, checkForUpdate } = await settingsFor(db, "admin");
  await expect(settings.checkForUpdate()).resolves.toEqual(UP_TO_DATE);
  expect(checkForUpdate).toHaveBeenCalledOnce();
});
