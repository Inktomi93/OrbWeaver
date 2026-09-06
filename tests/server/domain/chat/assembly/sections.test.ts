// assembly/sections — the ONE generation-aware section predicate (#1462). `sectionTriggers` is what the BUILD
// walk keeps a section on; `hasActiveMarker` is what every MARKER-FALLBACK decision asks before standing down
// (the guided steer's injection, the implicit compact-summary synthesis, the two world-info anchors' bucket
// routing). They were two different questions, and the weaker one — "is a section of this type enabled?" —
// is TRUE for a section the walk is about to drop for a trigger mismatch, so the fallback stood down and the
// content reached the model nowhere. These pin that the two answers cannot diverge.

import type { GenerationType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, GENERATION_TYPES } from "@orb/contracts/preset";
import { describe } from "vitest";
import { hasActiveMarker, sectionTriggers } from "../../../../../packages/server/src/domain/chat/assembly/sections.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function marker(over: Partial<Extract<PromptSection, { type: "marker" }>> = {}): PromptSection {
  const base: Extract<PromptSection, { type: "marker" }> = { type: "marker", id: "m1", name: "m", marker: "guided_instruction", role: "system", enabled: true };
  return { ...base, ...over };
}

function configOf(sections: PromptSection[]): PromptConfig {
  return { ...DEFAULT_PROMPT_CONFIG, sections };
}

describe("sectionTriggers — the ST shouldTrigger gate", () => {
  test("an absent or empty trigger fires on EVERY generation type", () => {
    for (const type of GENERATION_TYPES) {
      expect(sectionTriggers(marker(), type)).toBe(true);
      expect(sectionTriggers(marker({ trigger: [] }), type)).toBe(true);
    }
  });

  test("a set trigger fires only on its own types", () => {
    const gated = marker({ trigger: ["continue"] });
    expect(sectionTriggers(gated, "continue")).toBe(true);
    expect(sectionTriggers(gated, "normal")).toBe(false);
    expect(sectionTriggers(gated, "quiet")).toBe(false);
  });

  test("swipe and regenerate are ONE bucket, in both positions", () => {
    expect(sectionTriggers(marker({ trigger: ["swipe"] }), "regenerate")).toBe(true);
    expect(sectionTriggers(marker({ trigger: ["regenerate"] }), "swipe")).toBe(true);
    // …and the alias never leaks into a third type.
    expect(sectionTriggers(marker({ trigger: ["swipe"] }), "normal")).toBe(false);
  });

  test("a PLAIN marker carries the gate too (#1462 ST parity) — it is not a templated-only field", () => {
    const anchor = marker({ marker: "world_info_before", trigger: ["swipe"] });
    expect(sectionTriggers(anchor, "swipe")).toBe(true);
    expect(sectionTriggers(anchor, "normal")).toBe(false);
  });
});

describe("hasActiveMarker — will this marker RENDER on this turn?", () => {
  test("present + enabled + trigger-matched ⇒ true", () => {
    const config = configOf([marker({ trigger: ["normal"] })]);
    expect(hasActiveMarker(config, "guided_instruction", "normal")).toBe(true);
  });

  test("ENABLED but trigger-mismatched ⇒ false — the defect that let every fallback stand down", () => {
    const config = configOf([marker({ trigger: ["swipe"] })]);
    expect(hasActiveMarker(config, "guided_instruction", "normal")).toBe(false);
    // …and the same section on its own turn is active again — the gate is per-TURN, not per-preset.
    expect(hasActiveMarker(config, "guided_instruction", "swipe")).toBe(true);
  });

  test("disabled ⇒ false, and absent ⇒ false", () => {
    expect(hasActiveMarker(configOf([marker({ enabled: false })]), "guided_instruction", "normal")).toBe(false);
    expect(hasActiveMarker(configOf([]), "guided_instruction", "normal")).toBe(false);
  });

  test("ANY active section of that marker counts — a duplicated marker is active if either arm fires", () => {
    const config = configOf([marker({ id: "a", trigger: ["swipe"] }), marker({ id: "b", trigger: ["normal"] })]);
    for (const type of ["normal", "swipe"] as const satisfies readonly GenerationType[]) {
      expect(hasActiveMarker(config, "guided_instruction", type)).toBe(true);
    }
    expect(hasActiveMarker(config, "guided_instruction", "quiet")).toBe(false);
  });

  test("it answers about the ASKED marker only — a different active marker is not a yes", () => {
    expect(hasActiveMarker(configOf([marker({ marker: "memory" })]), "guided_instruction", "normal")).toBe(false);
  });

  test("it agrees with `sectionTriggers` by construction — the whole point of one predicate", () => {
    for (const trigger of [undefined, [], ["normal"], ["swipe"], ["swipe", "normal"]] as const) {
      const section = marker(trigger === undefined ? {} : { trigger: [...trigger] });
      for (const type of GENERATION_TYPES) {
        expect(hasActiveMarker(configOf([section]), "guided_instruction", type)).toBe(sectionTriggers(section, type));
      }
    }
  });
});
