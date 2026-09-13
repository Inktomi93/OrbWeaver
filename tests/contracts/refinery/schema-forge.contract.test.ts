// contracts/refinery/schema-forge — the forge's WIRE GRAMMAR + its transpiler (task #36, the owner's
// structured-output veto). The contract these pin is the MIRROR OBLIGATION: everything the grammar can
// produce passes the save belt, one-directionally. That is not a property you can eyeball off two files,
// so it is asserted here per construct — including the belt refusals the grammar makes UNREACHABLE, each
// with a planted control showing the belt still refuses that construct when it arrives by hand.

import type { ForgeDesignEnvelope, RefinerySchemaStage } from "@orb/contracts/refinery";
import {
  applyForgeHints,
  forgeDesignEnvelopeSchema,
  REFINERY_FORGE_ARMS,
  REFINERY_FORGE_CORE_NODES,
  REFINERY_FORGE_MAX_PATH_SEGMENTS,
  refinerySchemaDocumentSchema,
  transpileForgeDesign,
} from "@orb/contracts/refinery";
import { projectJsonSchema, scrubWireSchema } from "@orb/kit/json-schema";
import { expect, test } from "../../support/fixtures.ts";

type Row = ForgeDesignEnvelope["fields"][number];

/** An open `additionalProperties` map made hosted grammars collapse to "no keys permitted". */
const OPEN_KEY_MAP_RE = /"additionalProperties":\{/;

function row(over: Partial<Row> & Pick<Row, "path">): Row {
  return { type: "string", description: "d", required: true, ...over };
}

function design(fields: readonly Row[], over: Partial<ForgeDesignEnvelope> = {}): ForgeDesignEnvelope {
  return { name: "vibe_scorer", description: "a readout", fields: [...fields], ...over };
}

/** The belt's verdict on a transpiled design — the mirror obligation, run for real. */
function beltOf(d: ForgeDesignEnvelope, stage: RefinerySchemaStage = "score"): { ok: boolean; message: string } {
  const { schema } = transpileForgeDesign(d, stage);
  const parsed = refinerySchemaDocumentSchema.safeParse({ name: d.name, description: d.description, stage, schema });
  return { ok: parsed.success, message: parsed.success ? "" : (parsed.error.issues[0]?.message ?? "") };
}

test("every leaf construct the grammar can emit transpiles into a document the save belt accepts", () => {
  const everything = design([
    row({ path: "mood", enum: ["calm", "tense"], role: "verdict", tones: [{ member: "calm", tone: "good" }] }),
    row({ path: "summary", maxLength: 900, role: "prose" }),
    row({ path: "pace", type: "number", minimum: 1, maximum: 5, role: "axis", group: "axes", chart: "bars" }),
    row({ path: "spoilers", type: "boolean" }),
    row({ path: "issues[].severity", enum: ["low", "high"], required: true }),
    row({ path: "issues[].note", maxLength: 280, required: false }),
    row({ path: "author.name", label: "Author" }),
  ]);
  const verdict = beltOf(everything);
  expect(verdict.message).toBe("");
  expect(verdict.ok).toBe(true);

  // …and the same design under the ANALYZE stage, whose core is a different node.
  expect(beltOf(everything, "analyze").ok).toBe(true);
});

test("the well-known core is SPLICED, so the belt's core refusal is unreachable from a design", () => {
  // A design that mentions nothing about the core still yields a document carrying it, required.
  const { schema, dropped } = transpileForgeDesign(design([row({ path: "summary" })]), "score");
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  expect(properties["overallScore"]).toEqual(REFINERY_FORGE_CORE_NODES.score.node);
  expect(schema["required"]).toContain("overallScore");
  expect(dropped).toEqual([]);

  // A design that TRIES to redefine the core loses — the row is dropped with its reason, and the canonical
  // node stands. (The belt would otherwise accept a 0-100 "overallScore" and break every library sort.)
  const hostile = transpileForgeDesign(design([row({ path: "overallScore", type: "number", minimum: 0, maximum: 100 })]), "score");
  expect(hostile.dropped.map((d) => d.path)).toEqual(["overallScore"]);
  expect((hostile.schema["properties"] as Record<string, unknown>)["overallScore"]).toEqual(REFINERY_FORGE_CORE_NODES.score.node);

  // PLANTED CONTROL — the belt itself still refuses a hand-authored document with a wrong-scale core, so
  // the assertion above is about the transpiler, not about a belt that stopped caring.
  const byHand = refinerySchemaDocumentSchema.safeParse({
    name: "x",
    description: "",
    stage: "score",
    schema: { type: "object", properties: { overallScore: { type: "number", minimum: 0, maximum: 100 } }, required: ["overallScore"] },
  });
  expect(byHand.success).toBe(false);
});

test("the spliced core is the ONLY hero — an author row claiming role:hero is re-roled, never a second headline", () => {
  // The live custom-schema drive (2026-08-14) hit this: the model, asked for a "rating 1-10", designed its
  // OWN overall-rating field AND got the spliced well-known core, BOTH hinted `role:"hero"`. Two heroes in
  // one design let the renderer's order-dependent "first hero wins" demote the canonical `overallScore` (the
  // card's score stamp) behind the model's field. The transpiler now guarantees exactly one hero — the core.
  const { schema } = transpileForgeDesign(
    design([
      row({ path: "vividness", type: "number", minimum: 1, maximum: 10, role: "hero", label: "Vividness" }),
      row({ path: "mood", enum: ["calm", "tense"] }),
    ]),
    "score",
  );
  // Exactly one `role:"hero"` survives in the whole document, and it is the canonical core node.
  const heroCount = (JSON.stringify(schema).match(/"role":"hero"/g) ?? []).length;
  expect(heroCount).toBe(1);
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  expect(properties["overallScore"]?.["x-orb-ui"]).toEqual({ role: "hero" });
  // The author's field SURVIVES (re-role, not drop) — its bounds and label stand; only the hero elevation is
  // stripped, so it renders as a plain bounded gauge instead of stealing the headline.
  expect(properties["vividness"]).toMatchObject({ type: "number", minimum: 1, maximum: 10 });
  expect((properties["vividness"]?.["x-orb-ui"] as Record<string, unknown> | undefined)?.["role"]).toBeUndefined();
  expect((properties["vividness"]?.["x-orb-ui"] as Record<string, unknown> | undefined)?.["label"]).toBe("Vividness");
});

test("the belt's OTHER refusal classes are unreachable from the grammar — by refusal or by strip", () => {
  // The CLOSED vocabularies refuse outright: a hint role or leaf type outside its enum is not a design.
  // This is what "the retry bridge shrank" rests on — these can no longer produce a belt round trip.
  for (const bad of [
    { path: "p", type: "string", description: "", required: true, role: "sparkle" },
    { path: "p", type: "object", description: "", required: true },
    { path: "p", type: "string", description: "", required: true, chart: "pie" },
  ]) {
    // @orb-waive no-test-fabrication(unknown): these ARE the invalid inputs under test — the point is that `Row` cannot describe them. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    expect(forgeDesignEnvelopeSchema.safeParse(design([bad as unknown as Row])).success).toBe(false);
  }

  // An unknown JSON-SCHEMA keyword takes the other route: zod's object parse is strip mode (repo-wide —
  // `@orb/kit/json-schema`'s header states it), so a smuggled `pattern`/`$ref` is dropped at the parse and
  // is structurally incapable of reaching the transpiled document. Both routes end in the same place, which
  // is the property that matters; asserting a refusal here would have been asserting the wrong mechanism.
  const smuggled = forgeDesignEnvelopeSchema.parse(
    // @orb-waive no-test-fabrication(unknown): a model smuggling a JSON-Schema keyword into a row is exactly the input under test. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    design([{ path: "p", type: "string", description: "", required: true, pattern: "a+", $ref: "#/x" } as unknown as Row]),
  );
  const { schema } = transpileForgeDesign(smuggled, "score");
  const text = JSON.stringify(schema);
  expect(text).not.toContain("pattern");
  expect(text).not.toContain("$ref");
  expect(refinerySchemaDocumentSchema.safeParse({ name: "ok_name", description: "", stage: "score", schema }).success).toBe(true);
});

test("a path deeper than the budget is DROPPED with a reason, never silently flattened or over-nested", () => {
  const tooDeep = `a.${"b.".repeat(REFINERY_FORGE_MAX_PATH_SEGMENTS)}c`;
  const { schema, dropped } = transpileForgeDesign(design([row({ path: tooDeep }), row({ path: "kept" })]), "score");
  expect(dropped.map((d) => d.path)).toEqual([tooDeep]);
  expect(dropped[0]?.reason).toContain("field path");
  expect(Object.keys(schema["properties"] as object).sort()).toEqual(["kept", "overallScore"]);
});

test("a path whose prefix is already a value is dropped — a leaf never becomes a container behind the author's back", () => {
  const { dropped } = transpileForgeDesign(design([row({ path: "mood" }), row({ path: "mood.tone" })]), "score");
  expect(dropped.map((d) => d.path)).toEqual(["mood.tone"]);
  expect(dropped[0]?.reason).toContain("already a value");
});

test("a duplicate path is dropped rather than overwriting the first row", () => {
  const { schema, dropped } = transpileForgeDesign(design([row({ path: "note", maxLength: 10 }), row({ path: "note", maxLength: 99 })]), "score");
  expect(dropped.map((d) => d.path)).toEqual(["note"]);
  expect((schema["properties"] as Record<string, Record<string, unknown>>)["note"]?.["maxLength"]).toBe(10);
});

test("tones survive only for members the enum actually declares", () => {
  const { schema } = transpileForgeDesign(
    design([
      row({
        path: "mood",
        enum: ["calm"],
        tones: [
          { member: "calm", tone: "good" },
          { member: "ghost", tone: "bad" },
        ],
      }),
    ]),
    "score",
  );
  const mood = (schema["properties"] as Record<string, Record<string, unknown>>)["mood"] ?? {};
  expect(mood["x-orb-ui"]).toEqual({ tone: { calm: "good" } });
});

test("a container is required exactly when something inside it is", () => {
  const { schema } = transpileForgeDesign(design([row({ path: "block.kept", required: true }), row({ path: "loose.maybe", required: false })]), "score");
  expect(schema["required"]).toContain("block");
  expect(schema["required"]).not.toContain("loose");
});

test("two-stage hints merge by path; a hint for an unknown path is counted, never applied to a guess", () => {
  const base = design([row({ path: "mood", enum: ["calm"] }), row({ path: "summary" })]);
  const merged = applyForgeHints(base, [
    { path: "mood", role: "verdict", tones: [{ member: "calm", tone: "good" }] },
    { path: "nope", role: "hero" },
  ]);
  expect(merged.unmatched).toBe(1);
  expect(merged.design.fields[0]?.role).toBe("verdict");
  expect(merged.design.fields[1]?.role).toBeUndefined();
});

// ── the numeric range must be SATISFIABLE (#1371 item 1) ─────────────────────────────────────────────
// `minimum`/`maximum` were independent optionals and `writeNumericBounds` wrote both verbatim, so an
// inverted pair transpiled straight into `ResponseFormat.schema`. A guided-decoding backend then has no
// legal token for that field — a stall or a 500 — and a loosely-validating one emits a value that fails
// every strict validator downstream. The refusal is at AUTHORING, never a silent swap: swapping would
// rewrite the author's stated intent without telling them.

test("an inverted minimum/maximum is REFUSED by the grammar, not transpiled", () => {
  const inverted = design([row({ path: "pace", type: "number", minimum: 10, maximum: 5 })]);
  const parsed = forgeDesignEnvelopeSchema.safeParse(inverted);
  expect(parsed.success).toBe(false);
  expect(parsed.error?.issues[0]?.message).toContain("minimum must be less than or equal to maximum");
});

test("the bounds a design MAY carry are unchanged — equal bounds and one-sided bounds still pass", () => {
  for (const bounds of [{ minimum: 1, maximum: 5 }, { minimum: 5, maximum: 5 }, { minimum: 5 }, { maximum: 5 }, {}]) {
    expect(forgeDesignEnvelopeSchema.safeParse(design([row({ path: "pace", type: "number", ...bounds })])).success).toBe(true);
  }
});

test("the ordering check does NOT disturb the projection — the row is still a walkable closed object", () => {
  // A zod-4 `.refine()` keeps the object class and its `shape`, so `projectJsonSchema` still descends into
  // the field row. This is the arm that would have broken silently (an unwalkable row projects to `{}`,
  // which is the "no keys permitted" collapse the whole grammar exists to avoid).
  const projected = projectJsonSchema(forgeDesignEnvelopeSchema);
  const text = JSON.stringify(projected);
  for (const key of ["path", "type", "description", "required", "minimum", "maximum"]) {
    expect(text).toContain(`"${key}"`);
  }
});

test("the projected grammar is servable: no $ref, no open key maps, and it survives both wire scrubs", () => {
  const projected = projectJsonSchema(forgeDesignEnvelopeSchema);
  const text = JSON.stringify(projected);
  // `$ref`/`$defs` — the Anthropic-family compiler documents recursive schemas as unsupported, and the live
  // probe (2026-08-09) measured the open-key-map variant of this grammar returning an EMPTY design on that
  // family. Both failure modes are structural, so they are pinned structurally.
  expect(text).not.toContain("$ref");
  expect(text).not.toContain("$defs");
  expect(text).not.toContain("propertyNames");
  // An `additionalProperties` that is a SCHEMA (rather than `false`) is the open key map that collapsed.
  expect(text).not.toMatch(OPEN_KEY_MAP_RE);
  // The hosted vehicle sends the all-required shape; it must still be a closed object tree.
  const strict = JSON.stringify(scrubWireSchema(projected, "strict-compatible").schema);
  expect(strict).not.toContain("$ref");
  expect(scrubWireSchema(projected, "strict-compatible").refused).toEqual([]);
  expect(scrubWireSchema(projected, "guided-decoding").refused).toEqual([]);
});

test("the arm vocabulary is closed and its default is a member", () => {
  expect([...REFINERY_FORGE_ARMS]).toEqual(["single", "guided", "two-stage"]);
});
