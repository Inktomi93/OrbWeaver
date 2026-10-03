// settings at the router: the update check spends the box's shared anonymous GitHub budget, so a plain member is
// refused before the verb runs; the version read stays open to every member (it is what a bug report quotes).

import type { UpdateCheck } from "@orb/kit/version-identity";
import { vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const UP_TO_DATE: UpdateCheck = { status: "up-to-date", local: "0.1.0", remote: null, reason: null };

function settingsFor(role: "admin" | "user"): { readonly settings: ReturnType<typeof caller>["settings"]; readonly checkForUpdate: ReturnType<typeof vi.fn> } {
  const checkForUpdate = vi.fn(() => Promise.resolve(UP_TO_DATE));
  const settings = caller(makeContext({ auth: principal(role), services: { settings: { checkForUpdate } } })).settings;
  return { settings, checkForUpdate };
}

test("a member cannot run the update check, and the verb never runs", async () => {
  const { settings, checkForUpdate } = settingsFor("user");
  await expect(settings.checkForUpdate()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(checkForUpdate).not.toHaveBeenCalled();
});

test("control: an admin reaches the update check", async () => {
  const { settings, checkForUpdate } = settingsFor("admin");
  await expect(settings.checkForUpdate()).resolves.toEqual(UP_TO_DATE);
  expect(checkForUpdate).toHaveBeenCalledOnce();
});
