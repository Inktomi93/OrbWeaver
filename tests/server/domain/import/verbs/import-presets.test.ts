// biome-ignore-all lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange
// format and appear verbatim in the fixtures.
// domain/import/verbs/import-presets — the ST chat-completion preset wave. Pins the verb's own contract: it
// SERIALIZES the already-mapped orb-native file and delegates the write to the preset domain's injected op
// (owning no serde and no collision rule), isolates a refusal PER PRESET, separates ACCEPTED from NET-NEW, and
// emits a note for every preset that landed — including the empty-fields "landed whole" note.

import type { UserId } from "@orb/kit/ids";
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
    openai_max_tokens: 1200,
    wrap_in_quotes: true,
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "main", enabled: true }] }],
    prompts: [{ identifier: "main", name: "| Prompt", system_prompt: true, role: "system", content: "You are a storyteller." }],
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
function ctxWith(importPreset: ImportProfileDeps["importPreset"]): ImportContext {
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
      ...(importPreset === undefined ? {} : { importPreset }),
    },
  };
}

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
});
