// Mirror test for @orb/server/kit/serde/user-settings — the ONE orb-native user-settings-backup serde AND the
// SECRETS FENCE (export-import-portability.md R3). Pins: the build envelope, the parse resilience (foreign/
// absent schemaKind → null, non-JSON → null), the R7 merge-only-present semantics (a crafted non-allowlisted
// key never travels), the build -> parse -> build ROUND-TRIP identity, and — the load-bearing security pin —
// that a settings blob carrying secret-adjacent fields (routing/credential source, seed ids) EXPORTS WITHOUT
// THEM (the fence is fail-safe by allowlist, so an excluded namespace is structurally absent from the bytes).

import type { PortableParse } from "@orb/contracts/portability";
import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { PortableUserSettings } from "@orb/server/kit/serde/user-settings";
import {
  buildUserSettingsBackup,
  parseUserSettingsBackup,
  projectShareSafe,
  SHARE_SAFE_SETTINGS_NAMESPACES,
  USER_SETTINGS_SCHEMA_KIND,
} from "@orb/server/kit/serde/user-settings";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

/** The parse outcome's value — the spine returns a typed refusal reason, never null. */
function refusalOf<T>(result: PortableParse<T>): string {
  if (result.ok) {
    throw new Error("expected the file to be refused, but it parsed");
  }
  return result.reason;
}

function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

/** A full UserSettings blob deliberately loaded with SECRET-ADJACENT fields in the fenced-out namespaces:
 *  `routing` carries a connection source + model (credential-adjacent CONFIG); `seeds` carries entity ids. */
function settingsWithSecrets(): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    routing: { roleDefaults: { chat: { source: "openrouter", model: "fenced-model-xyz" } } },
    seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPersonaId: "persona_fenced_id" },
    appearance: { ...DEFAULT_USER_SETTINGS.appearance, fontScale: 1.3 },
    theme: { selectedThemeId: "theme_keepme" },
  };
}

function decode(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

describe("the secrets fence (R3 — a settings export MUST be safe to share)", () => {
  test("a blob WITH secret-adjacent fields exports WITHOUT them (routing/seeds structurally absent)", () => {
    const bytes = buildUserSettingsBackup(projectShareSafe(settingsWithSecrets()));
    const wire = decode(bytes);
    const carried = wire["settings"] as Record<string, unknown>;

    // Only the allowlisted namespaces travel — routing/seeds/profile/onboarding/etc. are absent by construction.
    expect(Object.keys(carried).sort()).toEqual(SHARE_SAFE_SETTINGS_NAMESPACES.toSorted());
    expect(carried["routing"]).toBeUndefined();
    expect(carried["seeds"]).toBeUndefined();

    // The strongest pin: the fenced VALUES literally never appear anywhere in the exported bytes.
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain("fenced-model-xyz");
    expect(text).not.toContain("persona_fenced_id");
    expect(text).not.toContain("roleDefaults");
    expect(text).not.toContain("source");

    // The genuinely share-safe prefs DID travel.
    expect(text).toContain("theme_keepme");
    expect((carried["appearance"] as Record<string, unknown>)["fontScale"]).toBe(1.3);
  });

  test("projectShareSafe never surfaces a fenced key at the type OR the value level", () => {
    const safe: PortableUserSettings = projectShareSafe(settingsWithSecrets());
    // `routing`/`seeds` are not keys of PortableUserSettings — this also fails `tsc` if the fence regresses.
    expect(Object.keys(safe).sort()).toEqual(SHARE_SAFE_SETTINGS_NAMESPACES.toSorted());
  });
});

describe("parseUserSettingsBackup", () => {
  test("null for non-JSON / empty / foreign schemaKind", () => {
    expect(refusalOf(parseUserSettingsBackup(new TextEncoder().encode("{nope")))).toBe("not-json");
    expect(refusalOf(parseUserSettingsBackup(new Uint8Array()))).toBe("not-json");
    const foreign = new TextEncoder().encode(JSON.stringify({ schemaKind: "orb.theme", schemaVersion: 1, settings: {} }));
    expect(refusalOf(parseUserSettingsBackup(foreign))).toBe("foreign-kind");
  });

  test("returns ONLY the namespaces the file carried (R7 merge-only-present)", () => {
    const bytes = buildUserSettingsBackup({ appearance: DEFAULT_USER_SETTINGS.appearance });
    const parsed = must(parseUserSettingsBackup(bytes));
    expect(Object.keys(parsed)).toEqual(["appearance"]);
    expect(parsed.memory).toBeUndefined();
  });

  test("a crafted non-allowlisted key in the file is IGNORED (never read out — the fence holds on import)", () => {
    const hostile = new TextEncoder().encode(
      JSON.stringify({
        schemaKind: USER_SETTINGS_SCHEMA_KIND,
        schemaVersion: 1,
        settings: {
          routing: { roleDefaults: { chat: { source: "openrouter", model: "attack" } } },
          appearance: { fontScale: 1.1 },
        },
      }),
    );
    const parsed = must(parseUserSettingsBackup(hostile));
    // routing is not in the allowlist → never present on the parsed result, even though the file carried it.
    expect(Object.keys(parsed)).toEqual(["appearance"]);
    expect("routing" in parsed).toBe(false);
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized bytes are the stable fixed point (all allowlisted namespaces populated)", () => {
    const safe = projectShareSafe(settingsWithSecrets());
    const bytes1 = buildUserSettingsBackup(safe);
    const bytes2 = buildUserSettingsBackup(must(parseUserSettingsBackup(bytes1)));
    expect(new TextDecoder().decode(bytes2)).toBe(new TextDecoder().decode(bytes1));
  });
});
