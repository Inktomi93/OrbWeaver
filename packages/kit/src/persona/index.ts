import { z } from "zod";
import { isPlainObject } from "#guards";
import { resolveInjectionPlacement } from "#injection";
import type { MessageRole } from "#message-role";

// ── Persona description placement (ST persona_description_position, per-persona) ──────────────────
// ST stores this on the persona DESCRIPTOR (power_user.persona_descriptions[avatar]) and hydrates
// the active fields on persona switch (personas.js:907). We mirror that: placement lives on the
// persona's `metadata` blob and is resolved against the ACTIVE persona at assemble time — ONE source
// of truth (the persona menu), replacing the removed global UserSettings.persona.descriptionInject.
//
// Three placements. We drop ST's TOP_AN / BOTTOM_AN: author's-note anchoring is just "inject at a
// position", which our depth-injection system already expresses uniformly — the SAME shared `{depth,
// role}` shape (`@orb/kit/injection`) every injector uses, over the canonical `MessageRole` axis
// (`@orb/kit/message-role`); persona imports both rather than re-spell them (D32):
//   • "in_prompt" (default) — render via the preset's `persona` marker section (the system slot)
//   • "at_depth"            — splice into the chat HISTORY at depth/role (the injection system)
//   • "none"                — don't inject the description at all (ST NONE)
// Exactly one fires per turn (the assembler suppresses the marker unless placement is in_prompt), so
// — unlike before — the description can never double-inject.
//
// The wire schemas (createPersonaSchema / updatePersonaSchema / personaMetadataSchema) live in
// @orb/contracts/persona and import this tuple DOWN — only the pure tuple + resolver belong in kit.
export const PERSONA_DESCRIPTION_POSITIONS = ["none", "in_prompt", "at_depth"] as const;
export type PersonaDescriptionPosition = (typeof PERSONA_DESCRIPTION_POSITIONS)[number];

// ST DEFAULT_DEPTH / DEFAULT_ROLE for the at-depth placement (power-user.js:292-293; role 0 = system).
// These are persona's OWN initial values, passed into the SHARED injection resolver (`@orb/kit/injection`,
// ledger D32) — the `{depth, role}` shape + the `MessageRole` axis are shared across every injector, but
// each one supplies its own defaults (persona's absent-role default is `system`, vs world-info's `user`).
const PERSONA_INJECT_DEFAULT_DEPTH = 2;
const PERSONA_INJECT_DEFAULT_ROLE: MessageRole = "system";

/** The resolved persona-description placement for one persona. `at_depth` carries the resolved
 *  depth + role (persona's defaults applied per-field when `inject` is absent/partial). */
export type PersonaDescriptionPlacement =
  | { kind: "none" }
  | { kind: "in_prompt" }
  | { kind: "at_depth"; depth: number; role: MessageRole };

/** Field-isolated read of a metadata blob — a malformed sibling field never poisons this one
 *  (read-side leniency: one bad `descriptionPosition` must not also drop a valid `inject`). */
function metadataField(metadata: unknown, key: "descriptionPosition" | "inject"): unknown {
  if (!isPlainObject(metadata)) {
    return;
  }
  return metadata[key];
}

/** Resolve a persona's description placement from its metadata blob. Default `in_prompt` (the
 *  marker-only behavior that predates this knob). Reads each field in isolation so a malformed
 *  sibling never poisons the decision. */
export function resolvePersonaDescriptionPlacement(metadata: unknown): PersonaDescriptionPlacement {
  const pos = z
    .enum(PERSONA_DESCRIPTION_POSITIONS)
    .safeParse(metadataField(metadata, "descriptionPosition"));
  const position = pos.success ? pos.data : "in_prompt";
  if (position === "none") {
    return { kind: "none" };
  }
  if (position === "at_depth") {
    // Field-isolated: a missing/invalid depth OR role each falls back to persona's own default
    // independently (the shared resolver, ledger D32).
    const placement = resolveInjectionPlacement(metadataField(metadata, "inject"), {
      depth: PERSONA_INJECT_DEFAULT_DEPTH,
      role: PERSONA_INJECT_DEFAULT_ROLE,
    });
    return { kind: "at_depth", depth: placement.depth, role: placement.role };
  }
  return { kind: "in_prompt" };
}
