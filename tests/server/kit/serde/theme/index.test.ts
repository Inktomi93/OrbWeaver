// Mirror test for @orb/server/kit/serde/theme — the ONE orb-native theme-backup serde. Pins BOTH directions:
// the build envelope (schemaKind/schemaVersion + deterministic key order), the parse resilience (foreign/absent
// schemaKind → null, non-JSON → null, a malformed row dropped not fatal, the D44 override clamp on hostile
// tokens), and the build -> parse -> build ROUND-TRIP identity (the drift guard against the two halves diverging).

import type { PortableParse } from "@orb/contracts/portability";
import type { CanonicalTheme, ThemeBackup } from "@orb/server/kit/serde/theme";
import { buildThemeBackup, parseThemeBackup, THEME_SCHEMA_KIND, THEME_SCHEMA_VERSION } from "@orb/server/kit/serde/theme";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

/** The parse outcome's value — the spine returns a typed refusal reason, never null. */
function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

function ctheme(over: Partial<CanonicalTheme> = {}): CanonicalTheme {
  return { name: "Midnight", override: {}, css: null, ...over };
}

function decode(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

describe("buildThemeBackup", () => {
  test("wraps the themes in the {schemaKind, schemaVersion} envelope", () => {
    const backup: ThemeBackup = {
      themes: [ctheme({ name: "Mocha", override: { accent: "oklch(0.7 0.14 250)" }, css: ".x{}" })],
    };
    const wire = decode(buildThemeBackup(backup));
    expect(wire["schemaKind"]).toBe(THEME_SCHEMA_KIND);
    expect(wire["schemaVersion"]).toBe(THEME_SCHEMA_VERSION);
    const rows = wire["themes"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      name: "Mocha",
      override: { accent: "oklch(0.7 0.14 250)" },
      css: ".x{}",
    });
  });

  test("re-clamps a hostile override token on build (the D44 wire clamp — never travels raw)", () => {
    // `url(x)` is not a safe color; the clamp drops it per-field so it is structurally absent from the wire.
    const backup: ThemeBackup = { themes: [ctheme({ override: { accent: "url(x)" } })] };
    const row = (decode(buildThemeBackup(backup))["themes"] as Record<string, unknown>[])[0];
    expect(row?.["override"]).toEqual({});
  });
});

describe("parseThemeBackup", () => {
  test("null for non-JSON bytes / empty bytes", () => {
    expect(parseThemeBackup(new TextEncoder().encode("{not json"))).toEqual({ ok: false, reason: "not-json" });
    expect(parseThemeBackup(new Uint8Array())).toEqual({ ok: false, reason: "not-json" });
  });

  test("null for a foreign / absent schemaKind (a different portable file)", () => {
    const foreign = new TextEncoder().encode(JSON.stringify({ schemaKind: "orb.tag-library", schemaVersion: 1, themes: [] }));
    expect(parseThemeBackup(foreign)).toEqual({ ok: false, reason: "foreign-kind" });
    expect(parseThemeBackup(new TextEncoder().encode(JSON.stringify({ themes: [] })))).toEqual({ ok: false, reason: "foreign-kind" });
  });

  test("a malformed theme row is dropped, not fatal (blank name / non-object)", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        schemaKind: THEME_SCHEMA_KIND,
        schemaVersion: 1,
        themes: [{ name: "keep", override: {} }, { name: "  " }, 7, { override: {} }],
      }),
    );
    const backup = must(parseThemeBackup(bytes));
    expect(backup.themes).toHaveLength(1);
    expect(backup.themes[0]?.name).toBe("keep");
  });

  test("a hostile override token degrades per-field through the clamp (row still parses)", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        schemaKind: THEME_SCHEMA_KIND,
        schemaVersion: 1,
        themes: [{ name: "risky", override: { accent: "url(x)", font: "Comic" } }],
      }),
    );
    const row = must(parseThemeBackup(bytes)).themes[0];
    expect(row?.name).toBe("risky");
    // Unsafe color + non-allowlisted font both drop; the override survives as an empty (safe) set.
    expect(row?.override).toEqual({});
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized bytes are the stable fixed point (all axes populated)", () => {
    const source: ThemeBackup = {
      themes: [
        ctheme({
          name: "Noir",
          override: { accent: "#0a0a0a", font: "Georgia", radius: "card", density: "compact" },
          css: ".body { color: red; }",
        }),
        ctheme({ name: "Plain" }),
      ],
    };
    const bytes1 = buildThemeBackup(source);
    const bytes2 = buildThemeBackup(must(parseThemeBackup(bytes1)));
    expect(new TextDecoder().decode(bytes2)).toBe(new TextDecoder().decode(bytes1));
  });
});
