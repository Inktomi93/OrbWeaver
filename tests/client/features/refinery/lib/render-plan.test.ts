// Unit: the schema→widget RENDER PLAN (schema-renderer §3) — the behavioral half of the totality
// theorem. The tsc `satisfies Record<LiftableNodeKind, …>` proves the dispatch has an arm per kind;
// these tests prove the arms are the DESIGNED ones: honest scales (the schema's OWN bounds, never a
// guessed /10), the single structural hero elevation, hint-elevates-never-carries (a hintless schema
// renders well; a malformed hint heals to structure), and the fixed-payload corpus planning clean.

import { REFINERY_STAGE_PAYLOADS, REFINERY_STAGES } from "@orb/contracts/refinery";
import { projectJsonSchema, RENDER_HINT_KEY } from "@orb/kit/json-schema";
import { BUILTIN_STAGE_HINTS } from "../../../../../packages/client/src/features/refinery/lib/builtin-hints.ts";
import type { PlanField } from "../../../../../packages/client/src/features/refinery/lib/render-plan.ts";
import { buildRenderPlan, formatLabel } from "../../../../../packages/client/src/features/refinery/lib/render-plan.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const KNOWN_WIDGETS = new Set(["gauge", "stat", "chip-enum", "text", "prose", "boolean", "bullets", "number-list", "rows", "section", "const", "union"]);

function walk(fields: readonly PlanField[], visit: (f: PlanField) => void): void {
  for (const field of fields) {
    visit(field);
    if (field.widget.kind === "section") {
      walk(field.widget.fields, visit);
    }
    if (field.widget.kind === "rows") {
      walk([...field.widget.row.header, ...(field.widget.row.score ? [field.widget.row.score] : []), ...field.widget.row.body], visit);
    }
  }
}

test("the FIXED payload corpus plans totally — every node lands on a designed widget, no raw arm exists", () => {
  for (const stage of REFINERY_STAGES) {
    const plan = buildRenderPlan(projectJsonSchema(REFINERY_STAGE_PAYLOADS[stage]), BUILTIN_STAGE_HINTS[stage]);
    expect(plan.fields.length).toBeGreaterThan(0);
    walk(plan.fields, (f) => {
      expect(KNOWN_WIDGETS.has(f.widget.kind)).toBe(true);
    });
  }
});

test("scale honesty: a /5 schema gauges at 5, an unbounded number is a stat (never a guessed bar)", () => {
  const plan = buildRenderPlan({
    type: "object",
    properties: {
      rating: { type: "integer", minimum: 1, maximum: 5 },
      wordCount: { type: "integer", minimum: 0 },
    },
    required: ["rating"],
  });
  const rating = plan.fields.find((f) => f.key === "rating");
  expect(rating?.widget).toEqual({ kind: "gauge", min: 1, max: 5, hero: true });
  const count = plan.fields.find((f) => f.key === "wordCount");
  expect(count?.widget).toEqual({ kind: "stat" });
});

test("hero elevation is STRUCTURAL and unique: two both-bounded root numbers ⇒ no hero without a hint", () => {
  const two = buildRenderPlan({
    type: "object",
    properties: {
      alpha: { type: "number", minimum: 0, maximum: 10 },
      beta: { type: "number", minimum: 0, maximum: 10 },
    },
    required: [],
  });
  for (const f of two.fields) {
    expect(f.widget).toEqual({ kind: "gauge", min: 0, max: 10, hero: false });
  }
  // A hero HINT elevates one of them — elevation by authored intent, never by value.
  const hinted = buildRenderPlan({
    type: "object",
    properties: {
      alpha: { type: "number", minimum: 0, maximum: 10, [RENDER_HINT_KEY]: { role: "hero" } },
      beta: { type: "number", minimum: 0, maximum: 10 },
    },
    required: [],
  });
  expect(hinted.fields.find((f) => f.key === "alpha")?.widget).toMatchObject({ kind: "gauge", hero: true });
  expect(hinted.fields.find((f) => f.key === "beta")?.widget).toMatchObject({ kind: "gauge", hero: false });
});

test("hints ELEVATE, never carry: a malformed hint heals to structure; a hintless schema still plans", () => {
  const plan = buildRenderPlan({
    type: "object",
    properties: {
      // Malformed role → the healing read drops the whole hint; the short maxLength still says "text".
      title: { type: "string", maxLength: 80, [RENDER_HINT_KEY]: { role: "explode" } },
      // Non-object hint → same heal.
      note: { type: "string", maxLength: 40, [RENDER_HINT_KEY]: "loud" },
      essay: { type: "string" },
      mood: { type: "string", enum: ["cozy", "tense"], [RENDER_HINT_KEY]: { tone: { cozy: "good", tense: "bad" } } },
    },
    required: [],
  });
  expect(plan.fields.find((f) => f.key === "title")?.widget).toEqual({ kind: "text" });
  expect(plan.fields.find((f) => f.key === "note")?.widget).toEqual({ kind: "text" });
  // Unbounded string = prose (the designed floor for long text).
  expect(plan.fields.find((f) => f.key === "essay")?.widget).toEqual({ kind: "prose" });
  // The tone map rides the hint verbatim — never inferred from the member spellings.
  expect(plan.fields.find((f) => f.key === "mood")?.widget).toEqual({
    kind: "chip-enum",
    members: ["cozy", "tense"],
    tones: { cozy: "good", tense: "bad" },
    verdict: false,
  });
});

test("array<object> plans the fixed ROW anatomy: short strings/enums head, the bounded number scores, prose bodies", () => {
  const plan = buildRenderPlan({
    type: "object",
    properties: {
      assay: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string", maxLength: 40 },
            score: { type: "integer", minimum: 1, maximum: 10 },
            critique: { type: "string" },
          },
          required: ["field", "score"],
        },
      },
    },
    required: [],
  });
  const widget = plan.fields.find((f) => f.key === "assay")?.widget as Extract<PlanField["widget"], { kind: "rows" }>;
  expect(widget.kind).toBe("rows");
  expect(widget.row.header.map((f) => f.key)).toEqual(["field"]);
  expect(widget.row.score?.key).toBe("score");
  expect(widget.row.body.map((f) => f.key)).toEqual(["critique"]);
});

test("the ANALYZE anatomy derives from plan + hints alone: the axis-hinted soul number is NOT stolen by the structural hero elevation", () => {
  // soulScore is the analyze root's ONLY both-bounded number — without the axis-claim rule the
  // structural elevation would hero it away from the verdict banner's side pill (the mock anatomy).
  const plan = buildRenderPlan(projectJsonSchema(REFINERY_STAGE_PAYLOADS.analyze), BUILTIN_STAGE_HINTS.analyze);
  const soul = plan.fields.find((f) => f.key === "soulScore");
  expect(soul?.widget).toMatchObject({ kind: "gauge", hero: false });
  const verdict = plan.fields.find((f) => f.key === "verdict");
  expect(verdict?.widget).toMatchObject({ kind: "chip-enum", verdict: true });
});

test("the assay ROW's score member is the REQUIRED bounded number — an optional bounded index cannot claim the row bar", () => {
  // fieldScores items carry TWO both-bounded numbers: `greetingIndex` (optional, 0..99, an address) and
  // `score` (required, 1..10, the datum). First-gauge-wins would bar the address.
  const plan = buildRenderPlan(projectJsonSchema(REFINERY_STAGE_PAYLOADS.score), BUILTIN_STAGE_HINTS.score);
  const widget = plan.fields.find((f) => f.key === "fieldScores")?.widget as Extract<PlanField["widget"], { kind: "rows" }>;
  expect(widget.kind).toBe("rows");
  expect(widget.row.score?.key).toBe("score");
  expect(widget.row.header.map((f) => f.key)).toEqual(["field", "greetingIndex"]);
  expect(widget.row.body.map((f) => f.key)).toEqual(["strengths", "weaknesses", "suggestions"]);
});

test("labels prettify from the key unless a hint names one", () => {
  expect(formatLabel("overallScore")).toBe("Overall score");
  expect(formatLabel("field_scores")).toBe("Field scores");
  const plan = buildRenderPlan({
    type: "object",
    properties: { soulScore: { type: "number", minimum: 1, maximum: 10, [RENDER_HINT_KEY]: { label: "Soul" } } },
    required: [],
  });
  expect(plan.fields[0]?.label).toBe("Soul");
});
