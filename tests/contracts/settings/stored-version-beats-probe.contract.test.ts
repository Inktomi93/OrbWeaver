// The user_settings version column beats the schemaVersion inside the blob. Lift 1 rebuilds a blob from the legacy
// top-level keys, so a current blob probed as v1 loses every section it already holds.
import { parseUserSettings, USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig } from "@orb/contracts/settings";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { expect, test } from "@orb/testkit/node";

const CURRENT_SECTIONS = { memory: { enabled: true } };

test("the column's current version keeps a blob with no in-blob version from re-running the lifts", () => {
  expect(parseUserSettings(CURRENT_SECTIONS, USER_SETTINGS_SCHEMA_VERSION).memory.enabled).toBe(true);
  // Positive control: with no column the probe starts at v1, and lift 1 rebuilds the blob without its memory section.
  expect(parseUserSettings(CURRENT_SECTIONS).memory.enabled).toBe(false);
});

test("the column's current version beats an in-blob version that claims an older shape", () => {
  const claimsV1 = { ...CURRENT_SECTIONS, schemaVersion: 1 };
  expect(parseUserSettings(claimsV1, USER_SETTINGS_SCHEMA_VERSION).memory.enabled).toBe(true);
  expect(parseUserSettings(claimsV1).memory.enabled).toBe(false);
});

test("a column newer than this build marks the blob from the future even when the blob claims the current version", () => {
  const blob = { ...CURRENT_SECTIONS, schemaVersion: USER_SETTINGS_SCHEMA_VERSION };
  expect(userSettingsConfig.parseOutcome(blob, USER_SETTINGS_SCHEMA_VERSION + 1)).toMatchObject({
    intact: false,
    failure: VERSIONED_PARSE_FAILURES.versionFromFuture,
  });
  expect(userSettingsConfig.parseOutcome(blob, USER_SETTINGS_SCHEMA_VERSION)).toMatchObject({ intact: true });
});

test.for([0, -1, 2.5, Number.NaN])("a column version of %s is not a version, so the in-blob version starts the walk", (column) => {
  // The blob claims v1, so lift 1 must run: a garbage start version would skip every lift and keep the memory section.
  expect(parseUserSettings({ ...CURRENT_SECTIONS, schemaVersion: 1 }, column).memory.enabled).toBe(false);
});
