// @orb/contracts/rpg/extraction — the real projected schema against each wire's keyword subset.

import { NAME_MAP_KEYWORDS, scrubWireSchema } from "@orb/contracts/inference";
import type { ExtractionRefs } from "@orb/contracts/rpg";
import { buildTrackerWriteGroups, constrainExtractionSchema, rpgExtractionSchema, rpgPopulateSchema } from "@orb/contracts/rpg";
import { isPlainObject } from "@orb/kit/guards";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { BARE_REFS, carrier, MANA, tracker } from "./_extraction-support.ts";

// ── the WIRE-SUBSET pins, over the REAL projected schema ─────────────────────────────────────────────
// `tests/legacy/contracts/inference/wire-subset.test.ts` pins the ENGINE against a synthetic payload; these pin the
// PRODUCT — what THIS schema actually puts on each wire after `projectJsonSchema` + `constrainExtractionSchema`.
// No static gate can compute it (it needs zod evaluated), and the synthetic payload cannot catch it: a NEW
// refinement in `contracts/src/rpg/tools.ts` (a `.regex()` → `pattern`, a `.length()` → `minLength`) lands a
// keyword the engine's table never heard of, and the hosted request 400s in production instead of here.
// Vendor sources (fetched 2026-08-03, 2026-08-03):
//   • Anthropic — string/numeric/array/object BOUND keywords are NOT supported by the structured-output subset.
//   • OpenAI — string bounds unsupported; numeric supported. The hosted mode carries the strictest COMMON subset.
//   • vLLM/xgrammar — guided decoding ENFORCES the bounds, so they must SURVIVE there (the populate lever: an
//     8B skips optional fields unless the compiled grammar requires the shape).

/** Every KEYWORD in a schema tree, position-aware: under `properties`/`$defs`/`definitions` the keys are field
 *  NAMES, not keywords, so they are stepped over (a field called `title` is data, not an annotation). */
function wireKeywords(node: unknown, acc: Set<string> = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) {
      wireKeywords(item, acc);
    }
    return acc;
  }
  if (!isPlainObject(node)) {
    return acc;
  }
  for (const [key, value] of Object.entries(node)) {
    acc.add(key);
    if (NAME_MAP_KEYWORDS.has(key) && isPlainObject(value)) {
      for (const child of Object.values(value)) {
        wireKeywords(child, acc);
      }
      continue;
    }
    wireKeywords(value, acc);
  }
  return acc;
}

// The keywords NO hosted request may carry — the union of what Anthropic documents as unsupported and what
// `z.toJSONSchema` stamps outside either vendor's list. Spelled out here on purpose: this is the VENDOR
// contract restated independently of the engine, so an engine edit that quietly drops a keyword from its own
// table cannot also quietly relax this pin.
const HOSTED_BANNED = [
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "$schema",
  "$id",
] as const;

// The keywords a hosted request MAY carry. An addition here is an owner decision — check it against A1/O1's
// supported list first. This is the arm that catches a NEW keyword class (`pattern`, `format`, `const`,
// `propertyNames`, `contains`, `dependentRequired`, `unevaluatedProperties`) the day a refinement introduces it.
const HOSTED_ALLOWED = new Set<string>([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "additionalProperties",
  "description",
  "default",
  "anyOf",
  "allOf",
  "$defs",
  "$ref",
]);

const WIRE_REFS: ExtractionRefs = { ...BARE_REFS, actorRefs: ["You"] };

test("WIRE: the real extraction schema carries NO banned keyword on either hosted projection", () => {
  const projected = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), WIRE_REFS);
  // The UNSCRUBBED projection really does emit them — otherwise these pins would be vacuously green.
  const raw = wireKeywords(projected);
  expect([...raw].filter((k) => (HOSTED_BANNED as readonly string[]).includes(k)).sort()).toEqual(["$schema", "maxLength", "maximum", "minLength", "minimum"]);
  for (const mode of ["hosted-common", "anthropic-format"] as const) {
    const keywords = wireKeywords(scrubWireSchema(projected, mode).schema);
    expect({ mode, banned: HOSTED_BANNED.filter((k) => keywords.has(k)) }).toEqual({ mode, banned: [] });
    // …and nothing OUTSIDE the documented subset either — the arm that catches a keyword class nobody knew about.
    expect({ mode, unknown: [...keywords].filter((k) => !HOSTED_ALLOWED.has(k)).sort() }).toEqual({ mode, unknown: [] });
  }
});

test("WIRE: guided decoding KEEPS the bounds — the xgrammar populate lever survives the scrub", () => {
  const projected = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), WIRE_REFS);
  const keywords = wireKeywords(scrubWireSchema(projected, "guided-decoding").schema);
  // These COMPILE into the grammar. A blanket strip would silently disarm the only enforcing wire we drive.
  for (const kept of ["minLength", "maxLength", "minimum", "maximum"]) {
    expect({ kept, present: keywords.has(kept) }).toEqual({ kept, present: true });
  }
  // The dialect meta key still comes off (the vLLM `--json-schema` validator refuses it), as do the annotations.
  expect(keywords.has("$schema")).toBe(false);
  expect(keywords.has("default")).toBe(false);
  // The populate schema rides the same wire under the same rule.
  expect(wireKeywords(scrubWireSchema(projectJsonSchema(rpgPopulateSchema), "guided-decoding").schema).has("minLength")).toBe(true);
});

test("WIRE: the Anthropic wire REFUSES the multi-group extraction schema (oneOf), and accepts the single-group one", () => {
  // One tracker write group ⇒ a flat schema; several ⇒ a `oneOf` branch each, which is exactly the construct
  // Anthropic's subset omits. The refusal is LOUD by design (D93: flatten at build time, never ship it).
  const bound = tracker({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: "npcs" });
  const groups = buildTrackerWriteGroups(
    [MANA, bound],
    [carrier("Kael", "party", { grants: ["bound_will"] }), carrier("Sola", "party", { revokes: ["mana"] })],
  );
  const multi = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), { ...WIRE_REFS, actorRefs: ["Kael", "Sola"], trackerWriteGroups: groups });
  expect(wireKeywords(multi).has("oneOf")).toBe(true);
  expect(scrubWireSchema(multi, "anthropic-format").refused.map((refusal) => refusal.keyword)).toEqual(["oneOf"]);
  // Every other wire carries it: the forced-tool vehicle compiles no grammar, and xgrammar accepts unions.
  expect(scrubWireSchema(multi, "hosted-common").refused).toEqual([]);
  expect(scrubWireSchema(multi, "guided-decoding").refused).toEqual([]);
  // The common single-group game is clean on all four.
  const flat = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), WIRE_REFS);
  expect(scrubWireSchema(flat, "anthropic-format").refused).toEqual([]);
});
