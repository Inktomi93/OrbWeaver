// The drift-proof pairing test (hub-caps-parity style, `the retired hub-caps-fixture-parity review`): every `{{rpg...}}`
// slot RPG_GM_PRESET_CONFIG references must be a name the macro registry actually registers. Without this,
// a macro rename in `packages/kit/src/macro/registry.ts` (or `builtin-metadata.ts`) leaves the packaged
// preset silently rendering a literal `{{typo'd}}` — this test REDs instead.

import { createDefaultRegistry, queryMacros } from "@orb/kit/macro";
import { describe } from "vitest";
import { PACKAGED_PRESETS } from "../../../../../packages/server/src/domain/preset/contract/packaged.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const RPG_GM_CONFIG = PACKAGED_PRESETS["rpg-gm"].config;

/** Every `{{name}}` macro reference across the config's section content/templates. */
function macroReferences(): readonly string[] {
  const refs: string[] = [];
  for (const section of RPG_GM_CONFIG.sections) {
    let text = "";
    if (section.type === "literal") {
      text = section.content;
    } else if ("template" in section) {
      text = section.template ?? "";
    }
    for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
      refs.push(match[1] ?? "");
    }
  }
  return refs;
}

describe("RPG_GM_PRESET_CONFIG macro slots", () => {
  test("references only registered rpg* macros (exact name match)", () => {
    const registry = createDefaultRegistry();
    const registeredRpgNames = new Set(queryMacros(registry, { prefix: "rpg" }).map((m) => m.name));
    const rpgRefs = macroReferences().filter((name) => name.toLowerCase().startsWith("rpg"));

    expect(rpgRefs.length).toBeGreaterThan(0);
    for (const ref of rpgRefs) {
      expect(registeredRpgNames.has(ref)).toBe(true);
    }
  });

  test("references all 8 rpg gather macros — the full-mode gather slots the packaged preset now renders", () => {
    const rpgRefs = new Set(macroReferences().filter((name) => name.toLowerCase().startsWith("rpg")));
    expect(rpgRefs).toEqual(new Set(["rpgWorld", "rpgSceneState", "rpgMorale", "rpgPerception", "rpgMap", "rpgSecrets", "rpgContinuity", "rpgCast"]));
  });

  test("carries the rating_guidelines section (06 §1 #4) — STATIC, keyed off config.rating, no 9th macro", () => {
    const rating = RPG_GM_CONFIG.sections.find((s) => s.id === "rating-guidelines");
    expect(rating?.type).toBe("literal");
    const content = rating?.type === "literal" ? rating.content : "";
    expect(content).toContain("SFW");
    expect(content).toContain("NSFW");
    // it introduces no `{{rpg…}}` macro — the value reaches the model via the game frame, not a 9th gather macro.
    expect(content.toLowerCase()).not.toContain("{{rpg");
    // slot order (06 §1): rating_guidelines sits between gm_instructions (#3) and server_context (#5).
    const ids = RPG_GM_CONFIG.sections.map((s) => s.id);
    expect(ids.indexOf("rating-guidelines")).toBe(ids.indexOf("gm-instructions") + 1);
    expect(ids.indexOf("rating-guidelines")).toBe(ids.indexOf("server-context") - 1);
  });
});
