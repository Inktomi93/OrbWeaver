// biome-ignore-all lint/style/useNamingConvention: ST theme field names (snake_case) appear verbatim in these
// fixtures — they ARE the interchange format.
// domain/import/verbs/import-themes — the ST theme wave. Pins the verb's own contract: it SERIALIZES each
// converted palette into its OWN orb-native theme-backup file and delegates the write to the settings
// domain's injected op (owning no serde and no collision rule), isolates a refusal PER THEME, separates
// ACCEPTED from NET-NEW, and emits a note for every theme that landed.
//
// The one-file-per-theme rule is load-bearing and easy to "simplify" away: the op reports `created` for the
// WHOLE file, so batching N themes into one backup would collapse N outcomes into one bit AND make a single
// refusal take the other N-1 with it.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CollectedTheme, ImportContext, ImportProfileDeps } from "@orb/server/domain/import";
import { createImportService, stThemeFromJson } from "@orb/server/domain/import";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");

/** The collected shape the loader hands the verb, built through the REAL substrate converter so the fixture
 *  cannot drift from what the collector actually produces. */
function collected(stem: string, sourceFile: string, over: Record<string, unknown> = {}): CollectedTheme {
  const result = stThemeFromJson(
    {
      name: stem,
      // biome-ignore lint/style/useNamingConvention: ST theme field names ARE the interchange format.
      blur_tint_color: "rgba(23, 23, 23, 1)",
      // biome-ignore lint/style/useNamingConvention: ST theme field names ARE the interchange format.
      main_text_color: "rgba(220, 220, 210, 1)",
      // biome-ignore lint/style/useNamingConvention: ST theme field names ARE the interchange format.
      shadow_width: 5,
      ...over,
    },
    stem,
  );
  if (!result.ok) {
    throw new Error(`fixture did not convert: ${result.reason}`);
  }
  return { parsed: result.parsed, sourceFile };
}

/** A context wired with ONLY what this verb needs; every other op throws if touched. */
function ctxWith(importTheme: ImportProfileDeps["importTheme"]): ImportContext {
  const unused = (): never => {
    throw new Error("unexpected op call");
  };
  return {
    ownerId: OWNER,
    createCharacter: unused,
    findByImportHash: unused,
    findByHandle: unused,
    updateCharacter: unused,
    storeAsset: unused,
    attachCardTag: unused,
    profile: {
      now: () => 1_700_000_000_000,
      personaByUserName: new Map(),
      bulkImportChats: unused,
      bulkImportPersonas: unused,
      enqueueBackfill: () => Promise.resolve(),
      reconcileStats: () => Promise.resolve(),
      ...(importTheme === undefined ? {} : { importTheme }),
    },
  };
}

describe("importThemes", () => {
  test("hands the settings domain ONE orb-native theme file per theme, and separates accepted from net-new", async () => {
    const files: { schemaKind?: string; themes?: { name?: string }[] }[] = [];
    const owners: UserId[] = [];
    const importTheme = vi.fn((ownerId: UserId, bytes: Uint8Array) => {
      owners.push(ownerId);
      files.push(JSON.parse(new TextDecoder().decode(bytes)) as { schemaKind?: string; themes?: { name?: string }[] });
      // First is a create, second a merge onto a same-named imported theme (the idempotent re-run path).
      return Promise.resolve({ ok: true, created: files.length === 1 });
    });
    const service = createImportService(ctxWith(importTheme));

    const result = await service.importThemes({
      themes: [collected("Azure", "themes/Azure.json"), collected("Dark Lite", "themes/Dark Lite.json")],
    });

    expect(owners).toEqual([OWNER, OWNER]);
    // ONE theme per file — never a batch.
    expect(files.map((f) => f.themes?.length)).toEqual([1, 1]);
    expect(files.every((f) => f.schemaKind === "orb.theme")).toBe(true);
    // The QUALIFIED name is what travels, so an owner's own `Azure` can never be merged over.
    expect(files.map((f) => f.themes?.[0]?.name)).toEqual(["Azure (SillyTavern)", "Dark Lite (SillyTavern)"]);
    expect(result.themesImported).toBe(2);
    expect(result.themesCreated).toBe(1);
    expect(result.skippedThemes).toEqual([]);
  });

  test("never carries ST custom CSS — every emitted file's `css` is null", async () => {
    const seen: (string | null)[] = [];
    const importTheme = vi.fn((_ownerId: UserId, bytes: Uint8Array) => {
      const file = JSON.parse(new TextDecoder().decode(bytes)) as { themes?: { css?: string | null }[] };
      seen.push(file.themes?.[0]?.css ?? null);
      return Promise.resolve({ ok: true, created: true });
    });
    const service = createImportService(ctxWith(importTheme));

    await service.importThemes({ themes: [collected("Styled", "themes/Styled.json", { custom_css: "#chat .mes { color: red }" })] });

    expect(seen).toEqual([null]);
  });

  test("a refusal is isolated PER THEME — the next theme still imports", async () => {
    const names: string[] = [];
    const importTheme = vi.fn((_ownerId: UserId, bytes: Uint8Array) => {
      const file = JSON.parse(new TextDecoder().decode(bytes)) as { themes?: { name?: string }[] };
      names.push(String(file.themes?.[0]?.name));
      return Promise.resolve(names.length === 1 ? { ok: false, error: "not a theme backup file." } : { ok: true, created: true });
    });
    const service = createImportService(ctxWith(importTheme));

    const result = await service.importThemes({
      themes: [collected("Bad", "themes/Bad.json"), collected("Good", "themes/Good.json")],
    });

    expect(result.skippedThemes).toEqual([{ file: "themes/Bad.json", reason: "not a theme backup file." }]);
    expect(result.themesImported).toBe(1);
    // The refused theme gets NO note — a note means "this landed", and it did not.
    expect(result.notes.map((n) => n.name)).toEqual(["Good (SillyTavern)"]);
  });

  test("every imported theme carries its unmapped-key note, so `landed whole` is distinguishable", async () => {
    const service = createImportService(ctxWith(vi.fn(() => Promise.resolve({ ok: true, created: true }))));

    const result = await service.importThemes({ themes: [collected("Azure", "themes/Azure.json")] });

    const note = result.notes[0];
    expect(note?.sourceFile).toBe("themes/Azure.json");
    // `shadow_width: 5` is real, meaningful, and has no orb THEME seat — it must be named with a reason.
    expect(note?.fields.map((f) => f.field)).toContain("shadow_width");
    expect(note?.fields.every((f) => f.reason.length > 0)).toBe(true);
  });

  test("an UNWIRED composition reports every theme skipped-with-reason rather than dropping the plane", async () => {
    const service = createImportService(ctxWith(undefined));

    const result = await service.importThemes({ themes: [collected("Azure", "themes/Azure.json")] });

    expect(result.themesImported).toBe(0);
    expect(result.themesCreated).toBe(0);
    expect(result.skippedThemes).toEqual([{ file: "themes/Azure.json", reason: "theme import is not wired into this composition" }]);
    expect(result.notes).toEqual([]);
  });
});
