// projectJsonSchema — the ONE zod → JSON-Schema rule (D79), golden-pinned: additionalProperties:false on
// EVERY object node (nested included), descriptions survive, output deterministic. The same rule serves a
// tool's args AND ResponseFormat.schema (04 §1) — these goldens are that axis's too.

import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

test("pins additionalProperties:false on every object node, nested objects + array items included", () => {
  const projected = projectJsonSchema(
    z.object({
      target: z.object({ id: z.string() }),
      waypoints: z.array(z.object({ x: z.number(), y: z.number() })),
    }),
  );
  const text = JSON.stringify(projected);
  // Every `"type":"object"` in the projection carries the pin — count them equal.
  const objectNodes = text.split('"type":"object"').length - 1;
  const pinned = text.split('"additionalProperties":false').length - 1;
  expect(objectNodes).toBeGreaterThanOrEqual(3);
  expect(pinned).toBe(objectNodes);
});

test("descriptions survive (they ARE prompt surface) and the projection is deterministic", () => {
  const schema = z.object({
    minutes: z.number().describe("how far to advance the clock"),
  });
  const a = projectJsonSchema(schema);
  const b = projectJsonSchema(schema);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(JSON.stringify(a)).toContain("how far to advance the clock");
});

test("scalar unions keep canonical anyOf arms, constraints and descriptions", () => {
  const schema = z.object({
    value: z.union([z.number(), z.string()]).describe("number or authored text"),
    constrained: z.union([z.number().min(0), z.string().min(2)]),
    nullable: z.string().nullable(),
  });
  const projected = projectJsonSchema(schema);
  expect(projected["properties"]).toEqual({
    value: { anyOf: [{ type: "number" }, { type: "string" }], description: "number or authored text" },
    constrained: {
      anyOf: [
        { type: "number", minimum: 0 },
        { type: "string", minLength: 2 },
      ],
    },
    nullable: { anyOf: [{ type: "string" }, { type: "null" }] },
  });
  expect(schema.safeParse({ value: "text", constrained: "ok", nullable: null }).success).toBe(true);
  expect(schema.safeParse({ value: true, constrained: "x", nullable: 0 }).success).toBe(false);
});

test("schema normalization never rewrites defaults or metadata that look like schema nodes", () => {
  const literal = { type: ["number", "string"] };
  const schema = z
    .object({ type: z.array(z.string()) })
    .default(literal)
    .meta({ examples: [literal], "x-author": literal });
  const projected = projectJsonSchema(schema);
  expect(projected["default"]).toEqual(literal);
  expect(projected["examples"]).toEqual([literal]);
  expect(projected["x-author"]).toEqual(literal);
});
