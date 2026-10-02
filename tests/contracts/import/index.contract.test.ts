// @orb/contracts/import — the SillyTavern profile-folder vocabulary both ends of the folder import read. Pins
// that the planes the importer reads are named once, that every other plane a real profile carries has a
// reason, and that `secrets.json` is a named, never-imported entry.

import {
  chatDirCardCandidates,
  isStSecretsFile,
  ST_PROFILE_HANDLED_ENTRIES,
  ST_PROFILE_UNHANDLED_REASONS,
  ST_SECRETS_FILE,
  ST_SETTINGS_FILE,
  stProfileEntryDisposition,
} from "@orb/contracts/import";
import { expect, test } from "../../support/fixtures.ts";

test("a handled entry is handled; an unhandled one carries its reason; an unknown one is bare", () => {
  expect(stProfileEntryDisposition("characters", true)).toEqual({ handled: true });
  expect(stProfileEntryDisposition(ST_SETTINGS_FILE, false)).toEqual({ handled: true });
  expect(stProfileEntryDisposition("vectors", true)).toEqual({ handled: false, reason: ST_PROFILE_UNHANDLED_REASONS.get("vectors/") });
  expect(stProfileEntryDisposition("some_brand_new_plane", true)).toEqual({ handled: false, reason: null });
});

test("secrets.json is never handled and its reason says the keys are never uploaded", () => {
  expect((ST_PROFILE_HANDLED_ENTRIES as readonly string[]).includes(ST_SECRETS_FILE)).toBe(false);
  const disposition = stProfileEntryDisposition(ST_SECRETS_FILE, false);
  expect(disposition.handled).toBe(false);
  expect(disposition.handled ? "" : disposition.reason).toContain("never uploaded");
});

test("a handled entry never also carries an unhandled reason (one list owns each name)", () => {
  for (const entry of ST_PROFILE_HANDLED_ENTRIES) {
    expect(ST_PROFILE_UNHANDLED_REASONS.has(`${entry}/`)).toBe(false);
    expect(ST_PROFILE_UNHANDLED_REASONS.has(entry)).toBe(false);
  }
});

test("isStSecretsFile matches the credentials file by its last path segment only", () => {
  expect(isStSecretsFile("default-user/secrets.json")).toBe(true);
  expect(isStSecretsFile("secrets.json")).toBe(true);
  expect(isStSecretsFile("default-user/backups/secrets.json.bak")).toBe(false);
  expect(isStSecretsFile("default-user/characters/secrets.json.png")).toBe(false);
});

test("chatDirCardCandidates strips ST's folder-name decorations in pairing order and never answers the handle itself", () => {
  expect(chatDirCardCandidates("aria-2")).toEqual(["aria"]);
  expect(chatDirCardCandidates("aria")).toEqual([]);
  // The spec wrapper yields its inner name after the (never-matching) digit-stripped form.
  expect(chatDirCardCandidates("main-aria-spec-v2")).toEqual(["main-aria-spec-v", "aria"]);
});
