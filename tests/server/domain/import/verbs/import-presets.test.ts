// domain/import/verbs/import-presets — the ST chat-completion preset wave. Pins the verb's own contract: it
// SERIALIZES the already-mapped orb-native file and delegates the write to the preset domain's injected op
// (owning no serde and no collision rule), isolates a refusal PER PRESET, separates ACCEPTED from NET-NEW, and
// emits a note for every preset that landed — including the empty-fields "landed whole" note.

import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CollectedPreset, ImportContext, ImportProfileDeps } from "@orb/server/domain/import";
import { createImportService, stPresetFromJson } from "@orb/server/domain/import";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");

/** A minimal REAL-shaped ST chat-completion preset: `prompts[]` + `prompt_order` is what makes it recognizable
 *  to the shared mapper, and `wrap_in_quotes` is a real ST field with no orb seat. */
function stPresetJson(over: Record<string, unknown> = {}): unknown {
  return {
    temperature: 1,
    // biome-ignore-start lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange format and appear verbatim in the fixtures.
    openai_max_tokens: 1200,
    wrap_in_quotes: true,
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "main", enabled: true }] }],
    prompts: [{ identifier: "main", name: "| Prompt", system_prompt: true, role: "system", content: "You are a storyteller." }],
    // biome-ignore-end lint/style/useNamingConvention: end of the block above
    ...over,
  };
}

/** The collected shape the loader hands the verb — built through the REAL substrate parser so the fixture
 *  cannot drift from what the collector actually produces. */
function collected(name: string, sourceFile: string, raw: unknown = stPresetJson()): CollectedPreset {
  const parsed = stPresetFromJson(raw, name);
  if (parsed === null) {
    throw new Error(`fixture is not a recognizable ST preset: ${name}`);
  }
  return { parsed, sourceFile };
}

interface Recorded {
  readonly names: string[];
  readonly ownerIds: UserId[];
}

/** A context wired with ONLY what this verb needs; every other op throws if touched. */
function ctxWith(importPreset: ImportProfileDeps["importPreset"], importPresetScripts?: ImportProfileDeps["importPresetScripts"]): ImportContext {
  const unused = (): never => {
    throw new Error("unexpected op call");
  };
  return {
    ownerId: OWNER,
    createCharacter: unused,
    findByImportHash: unused,
    findByHandle: unused,
    storeAsset: unused,
    attachCardTag: unused,
    profile: {
      now: () => 1_700_000_000_000,
      personaByUserName: new Map(),
      bulkImportChats: unused,
      bulkImportPersonas: unused,
      enqueueBackfill: () => Promise.resolve(true),
      reconcileStats: () => Promise.resolve(),
      ...(importPreset === undefined ? {} : { importPreset }),
      ...(importPresetScripts === undefined ? {} : { importPresetScripts }),
    },
  };
}

/** A VERBATIM corpus script (Marinara preset, default-user profile) — the genuine ST dialect: `scriptName`,
 *  INTEGER placements, `disabled`. The silent gap this wave closes was measured on exactly these bytes. */
const MARINARA_SCRIPT = {
  id: "2f5b7243-6200-4263-9a37-c71dcea01e70",
  scriptName: "Fix Elipsis",
  findRegex: "/\\.{3}/g",
  replaceString: "…",
  trimStrings: [],
  placement: [1, 2, 3, 5, 6],
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};

/** ST's own extension key for a preset's regex scripts — a string VALUE, so the fixture carries the wire
 *  spelling verbatim without a naming-convention suppression at every use. */
const ST_REGEX_SCRIPTS_KEY = "regex_scripts";

/** The same preset, carrying its ST preset-scoped scripts. */
const MARINARA_WITH_SCRIPTS = stPresetJson({ extensions: { [ST_REGEX_SCRIPTS_KEY]: [MARINARA_SCRIPT] } });

describe("importPresets", () => {
  test("hands the preset domain the orb-native FILE bytes and reports accepted vs net-new separately", async () => {
    const rec: Recorded = { names: [], ownerIds: [] };
    const importPreset = vi.fn(({ ownerId, bytes }: { ownerId: UserId; bytes: Uint8Array }) => {
      const file = JSON.parse(new TextDecoder().decode(bytes)) as { schemaKind?: string; name?: string };
      rec.ownerIds.push(ownerId);
      rec.names.push(String(file.name));
      // The envelope MUST be the orb-native kind — the preset domain accepts nothing else.
      expect(file.schemaKind).toBe("orb.preset");
      // First is a create, second is a merge onto a same-named preset (the idempotent re-run path).
      return Promise.resolve({ ok: true, created: rec.names.length === 1 });
    });
    const service = createImportService(ctxWith(importPreset));

    const result = await service.importPresets({
      presets: [collected("Marinara (OpenAI)", "OpenAI Settings/Marinara.json"), collected("OpenAI (active)", "settings.json#oai_settings")],
    });

    expect(rec.names).toEqual(["Marinara (OpenAI)", "OpenAI (active)"]);
    expect(rec.ownerIds).toEqual([OWNER, OWNER]);
    // ACCEPTED is both; NET-NEW is only the create — the distinction the run's `changed` tally depends on.
    expect(result.presetsImported).toBe(2);
    expect(result.presetsCreated).toBe(1);
    expect(result.skippedPresets).toEqual([]);
  });

  test("a refusal is isolated PER PRESET — the next preset still imports", async () => {
    const rec: Recorded = { names: [], ownerIds: [] };
    const importPreset = vi.fn(({ bytes }: { ownerId: UserId; bytes: Uint8Array }) => {
      const file = JSON.parse(new TextDecoder().decode(bytes)) as { name?: string };
      rec.names.push(String(file.name));
      return Promise.resolve(rec.names.length === 1 ? { ok: false, error: "config isn't a valid prompt config." } : { ok: true, created: true });
    });
    const service = createImportService(ctxWith(importPreset));

    const result = await service.importPresets({
      presets: [collected("Bad (OpenAI)", "OpenAI Settings/Bad.json"), collected("Good (OpenAI)", "OpenAI Settings/Good.json")],
    });

    expect(result.skippedPresets).toEqual([{ file: "OpenAI Settings/Bad.json", reason: "config isn't a valid prompt config." }]);
    expect(result.presetsImported).toBe(1);
    // The refused preset gets NO note — a note means "this landed", and it did not.
    expect(result.notes.map((n) => n.name)).toEqual(["Good (OpenAI)"]);
  });

  test("every imported preset carries its unmapped-field note, so `landed whole` is distinguishable", async () => {
    const importPreset = vi.fn(() => Promise.resolve({ ok: true, created: true }));
    const service = createImportService(ctxWith(importPreset));

    const result = await service.importPresets({ presets: [collected("Marinara (OpenAI)", "OpenAI Settings/Marinara.json")] });

    const note = result.notes[0];
    expect(note?.sourceFile).toBe("OpenAI Settings/Marinara.json");
    // `wrap_in_quotes: true` is real, meaningful, and has no orb knob — it must be named with a reason.
    expect(note?.fields.map((f) => f.field)).toContain("wrap_in_quotes");
    expect(note?.fields.every((f) => f.reason.length > 0)).toBe(true);
  });

  test("an UNWIRED composition reports every preset skipped-with-reason rather than dropping the plane", async () => {
    const service = createImportService(ctxWith(undefined));

    const result = await service.importPresets({ presets: [collected("Marinara (OpenAI)", "OpenAI Settings/Marinara.json")] });

    expect(result.presetsImported).toBe(0);
    expect(result.skippedPresets).toEqual([{ file: "OpenAI Settings/Marinara.json", reason: "preset import is not wired into this composition" }]);
  });

  // ── the preset-scoped regex scripts (the silent-gap sweep, 2026-08-15) ─────────────────────────────────
  // ST's presetManager stores the regex extension's preset-scoped scripts ON the preset file
  // (`extensions.regex_scripts` — 15 real scripts on the corpus's Marinara preset), and the wave used to
  // ignore the key WITHOUT even a dropped-field note — the one class of drop the report could not see.

  test("a preset's own regex scripts lift onto EXACTLY the row the import op wrote, and the note counts them", async () => {
    const liftCalls: { presetId: PresetId; scriptNames: string[] }[] = [];
    const importPreset = vi.fn(() => Promise.resolve({ ok: true, created: true, presetId: castId<PresetId>("preset_row_1") }));
    const importPresetScripts = vi.fn(({ presetId, scripts }: { presetId: PresetId; scripts: readonly { name: string }[] }) => {
      liftCalls.push({ presetId, scriptNames: scripts.map((s) => s.name) });
      return Promise.resolve({ created: 1, reused: 0 });
    });
    const service = createImportService(ctxWith(importPreset, importPresetScripts as ImportProfileDeps["importPresetScripts"]));

    const result = await service.importPresets({
      // biome-ignore lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange format and appear verbatim in the fixtures.
      presets: [collected("Marinara (OpenAI)", "OpenAI Settings/Marinara.json", stPresetJson({ extensions: { regex_scripts: [MARINARA_SCRIPT] } }))],
    });

    // The dialect normalized (scriptName → name) and the junction targeted the returned row id.
    expect(liftCalls).toEqual([{ presetId: "preset_row_1", scriptNames: ["Fix Elipsis"] }]);
    expect(result.notes[0]).toMatchObject({ scriptsLifted: 1, scriptsReused: 0 });
  });

  test("scripts on a preset with NO lift op wired are a RECORDED skip — the preset itself still imports", async () => {
    const importPreset = vi.fn(() => Promise.resolve({ ok: true, created: true, presetId: castId<PresetId>("preset_row_2") }));
    const service = createImportService(ctxWith(importPreset, undefined));

    const result = await service.importPresets({
      // biome-ignore lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange format and appear verbatim in the fixtures.
      presets: [collected("Marinara (OpenAI)", "OpenAI Settings/Marinara.json", stPresetJson({ extensions: { regex_scripts: [MARINARA_SCRIPT] } }))],
    });

    expect(result.presetsImported).toBe(1);
    expect(result.skippedPresets).toEqual([
      {
        file: "OpenAI Settings/Marinara.json",
        reason: "1 preset regex script(s) not lifted (the preset imported; the script lift is not wired into this composition)",
      },
    ]);
    expect(result.notes[0]).toMatchObject({ scriptsLifted: 0, scriptsReused: 0 });
  });

  test("a script-less preset never calls the lift, and unknown extensions keys join the unmapped note by name", async () => {
    const importPreset = vi.fn(() => Promise.resolve({ ok: true, created: true, presetId: castId<PresetId>("preset_row_3") }));
    const importPresetScripts = vi.fn(() => Promise.resolve({ created: 0, reused: 0 }));
    const service = createImportService(ctxWith(importPreset, importPresetScripts as ImportProfileDeps["importPresetScripts"]));

    const result = await service.importPresets({
      presets: [collected("Plain (OpenAI)", "OpenAI Settings/Plain.json", stPresetJson({ extensions: { someVendorState: { a: 1 } } }))],
    });

    expect(importPresetScripts).not.toHaveBeenCalled();
    expect(result.notes[0]?.fields.map((f) => f.field)).toContain("extensions.someVendorState");
  });

  // #1469 item 7 — the lift op was awaited with NO try/catch inside the wave loop, so ONE throwing lift
  // rejected `importPresets` whole: every preset already imported in that run lost its count and its note,
  // and the operator got an exception instead of a partial report. Per-preset isolation is the wave's stated
  // contract (the header says so) and the lift is the one call that did not honour it.
  test("a THROWING script lift is one recorded skip — the presets already imported keep their counts", async () => {
    const importPreset = vi.fn((_args: unknown) => Promise.resolve({ ok: true, created: true, presetId: castId<PresetId>("preset_row_4") }));
    // Typed at the op's OWN return type rather than double-cast: a rejection IS a legal value of that
    // Promise, so the fake stays honest if the op's shape changes.
    const importPresetScripts: NonNullable<ImportProfileDeps["importPresetScripts"]> = vi.fn(() =>
      Promise.reject(new Error("regex library write failed\nUNIQUE constraint failed: regex_scripts.name")),
    );
    const service = createImportService(ctxWith(importPreset, importPresetScripts));

    const result = await service.importPresets({
      presets: [
        collected("Plain (OpenAI)", "OpenAI Settings/Plain.json"),
        collected("Marinara (OpenAI)", "OpenAI Settings/Marinara.json", MARINARA_WITH_SCRIPTS),
      ],
    });

    // BOTH presets are still counted — the accumulated work survived the failing lift.
    expect(result.presetsImported).toBe(2);
    expect(result.presetsCreated).toBe(2);
    expect(result.notes).toHaveLength(2);
    expect(result.skippedPresets).toEqual([
      {
        file: "OpenAI Settings/Marinara.json",
        reason: "1 preset regex script(s) not lifted (the preset imported; the lift failed): UNIQUE constraint failed: regex_scripts.name",
      },
    ]);
    expect(result.notes[1]).toMatchObject({ scriptsLifted: 0, scriptsReused: 0 });
  });
});
