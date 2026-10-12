// entry/import/run-profile-dir-import — the ST chat-completion presets in the profile directory.

import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { runProfileDirImport } from "#server/entry/import/index.ts";
import { cardPng, deps, ENC, fakes, memoryFs, openAiPresetJson, presetAndGroupFiles } from "./_profile-dir-import-support.ts";

describe("runProfileDirImport — ST chat-completion presets", () => {
  test("the four preset planes leave the unhandled lists, and the saved file + live blob both import", async () => {
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    // The affordance a user reads: the report no longer says these planes were left behind.
    expect(report.unhandled).not.toContain("OpenAI Settings/");
    expect(report.unhandledSettings).not.toContain("oai_settings");
    // The saved preset is FAMILY-QUALIFIED (ST ships a `Default.json`; an unqualified name would merge onto an
    // owner's own preset of that name), and the live blob lands under its own distinct name.
    expect(f.presetWrites).toEqual(["Marinara (OpenAI)", "OpenAI (active)"]);
    expect(report.presetsImported).toBe(2);
    expect(report.skippedPresets).toEqual([]);
  });

  test("the TEXT-completion families stay unhandled, with the owner's ruling as the reason", async () => {
    // Owner ruling 2026-08-08: orb has no text-completion mode, so these are a deliberate refusal, not a gap.
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/TextGen Settings/Universal-Creative.json": ENC.encode(JSON.stringify({ temp: 1.5, top_p: 1, min_p: 0.1, rep_pen: 1 })),
      "root/userA/KoboldAI Settings/Universal-Creative.json": ENC.encode(JSON.stringify({ temp: 1.5, top_a: 0, typical: 1 })),
      "root/userA/NovelAI Settings/Carefree-Kayra.json": ENC.encode(JSON.stringify({ temperature: 1.35, repetition_penalty: 2.8 })),
      "root/userA/settings.json": ENC.encode(JSON.stringify({ textgenerationwebui_settings: {}, kai_settings: {}, nai_settings: {} })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unhandled).toEqual(expect.arrayContaining(["TextGen Settings/", "KoboldAI Settings/", "NovelAI Settings/"]));
    expect(report.unhandledSettings).toEqual(expect.arrayContaining(["textgenerationwebui_settings", "kai_settings", "nai_settings"]));
    // Not one of them was written as a preset.
    expect(f.presetWrites).toEqual([]);
  });

  test("a preset's ST fields with no orb seat are REPORTED, per preset", async () => {
    const files: Record<string, Uint8Array> = { "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson()) };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    const note = report.presetNotes.find((n) => n.name === "Marinara (OpenAI)");
    expect(note?.sourceFile).toBe("OpenAI Settings/Marinara.json");
    // `wrap_in_quotes: true` is a real ST field orb has no knob for — it must appear with its reason.
    expect(note?.fields.map((x) => x.field)).toContain("wrap_in_quotes");
  });

  test("an unparseable preset file is recorded, never silent, and never aborts the run", async () => {
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/OpenAI Settings/broken.json": ENC.encode("{not json"),
      "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson()),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unreadablePresets).toEqual(["OpenAI Settings/broken.json"]);
    expect(f.presetWrites).toEqual(["Marinara (OpenAI)"]);
    // The good card still imported — one bad preset is not an aborted profile.
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(1);
  });
});
