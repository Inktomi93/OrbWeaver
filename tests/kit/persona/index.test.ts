import type { PersonaDescriptionPosition } from "@orb/kit/persona";
import { PERSONA_DESCRIPTION_POSITIONS, resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import { expect, test } from "../../support/fixtures.ts";

// ST defaults the at-depth placement applies when `inject` is absent/partial (depth 2, role system).
const DEFAULT_AT_DEPTH = 2;

test("position 'none' resolves to the none placement (no injection)", () => {
  expect(resolvePersonaDescriptionPlacement({ descriptionPosition: "none" })).toEqual({
    kind: "none",
  });
});

test("position 'in_prompt' resolves to the in_prompt placement (system marker slot)", () => {
  expect(resolvePersonaDescriptionPlacement({ descriptionPosition: "in_prompt" })).toEqual({
    kind: "in_prompt",
  });
});

test("position 'at_depth' with a full inject preserves the explicit depth + role", () => {
  expect(
    resolvePersonaDescriptionPlacement({
      descriptionPosition: "at_depth",
      inject: { depth: 5, role: "user" },
    }),
  ).toEqual({ kind: "at_depth", depth: 5, role: "user" });
});

test("at_depth honors role 'assistant' at depth 0 on read (write-side guard is not kit's concern)", () => {
  expect(
    resolvePersonaDescriptionPlacement({
      descriptionPosition: "at_depth",
      inject: { depth: 0, role: "assistant" },
    }),
  ).toEqual({ kind: "at_depth", depth: 0, role: "assistant" });
});

test("at_depth with inject missing role falls back to the default role (system)", () => {
  expect(
    resolvePersonaDescriptionPlacement({
      descriptionPosition: "at_depth",
      inject: { depth: 9 },
    }),
  ).toEqual({ kind: "at_depth", depth: 9, role: "system" });
});

test("at_depth with no inject applies both ST defaults (depth 2, role system)", () => {
  expect(resolvePersonaDescriptionPlacement({ descriptionPosition: "at_depth" })).toEqual({
    kind: "at_depth",
    depth: DEFAULT_AT_DEPTH,
    role: "system",
  });
});

test("at_depth with a malformed inject falls back to defaults (field isolation)", () => {
  // A bad `inject` sibling must not poison the placement decision — position still wins,
  // the inject just resolves to the ST defaults.
  expect(
    resolvePersonaDescriptionPlacement({
      descriptionPosition: "at_depth",
      inject: { depth: -1 },
    }),
  ).toEqual({ kind: "at_depth", depth: DEFAULT_AT_DEPTH, role: "system" });
});

test("default/fallback: undefined metadata resolves to in_prompt", () => {
  expect(resolvePersonaDescriptionPlacement(undefined)).toEqual({ kind: "in_prompt" });
});

test("default/fallback: empty metadata blob resolves to in_prompt", () => {
  expect(resolvePersonaDescriptionPlacement({})).toEqual({ kind: "in_prompt" });
});

test("non-object metadata (string, array, null) resolves to in_prompt", () => {
  expect(resolvePersonaDescriptionPlacement("nope")).toEqual({ kind: "in_prompt" });
  expect(resolvePersonaDescriptionPlacement(["descriptionPosition", "none"])).toEqual({
    kind: "in_prompt",
  });
  expect(resolvePersonaDescriptionPlacement(null)).toEqual({ kind: "in_prompt" });
});

test("an unrecognized descriptionPosition value resolves to in_prompt", () => {
  expect(resolvePersonaDescriptionPlacement({ descriptionPosition: "TOP_AN" })).toEqual({
    kind: "in_prompt",
  });
});

test("PERSONA_DESCRIPTION_POSITIONS is the exact tuple and every member resolves", () => {
  expect(PERSONA_DESCRIPTION_POSITIONS).toEqual(["none", "in_prompt", "at_depth"]);
  // Each tuple member is a valid PersonaDescriptionPosition and drives a placement.
  for (const position of PERSONA_DESCRIPTION_POSITIONS) {
    const member: PersonaDescriptionPosition = position;
    const placement = resolvePersonaDescriptionPlacement({ descriptionPosition: member });
    expect(["none", "in_prompt", "at_depth"]).toContain(placement.kind);
  }
});
