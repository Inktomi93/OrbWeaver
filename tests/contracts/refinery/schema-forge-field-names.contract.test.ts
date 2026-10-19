import type { ForgeDesignEnvelope } from "@orb/contracts/refinery";
import { refinerySchemaDocumentSchema, transpileForgeDesign } from "@orb/contracts/refinery";
import { expect, test } from "vitest";

type Row = ForgeDesignEnvelope["fields"][number];

function row(path: string): Row {
  return { path, type: "string", description: "d", required: true };
}

// The design rows are model structured output, so a path segment may spell any identifier.
test("a designed field named like an inherited object member lands as its own field", () => {
  const design: ForgeDesignEnvelope = { name: "vibe_scorer", description: "a readout", fields: [row("constructor"), row("meta.toString"), row("valueOf")] };
  const { schema, dropped } = transpileForgeDesign(design, "score");
  expect(dropped).toEqual([]);
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  expect(Object.keys(properties)).toEqual(expect.arrayContaining(["constructor", "meta", "valueOf"]));
  expect(Object.keys(properties["meta"]?.["properties"] as object)).toEqual(["toString"]);
  expect(refinerySchemaDocumentSchema.safeParse({ name: design.name, description: design.description, stage: "score", schema }).success).toBe(true);
});

test("a designed __proto__ segment is dropped with a reason and never reshapes a schema node", () => {
  const design: ForgeDesignEnvelope = { name: "vibe_scorer", description: "a readout", fields: [row("__proto__"), row("nest.__proto__.leaf"), row("kept")] };
  const { schema, dropped } = transpileForgeDesign(design, "score");
  expect(dropped.map((drop) => drop.path)).toEqual(["__proto__", "nest.__proto__.leaf"]);
  const properties = schema["properties"] as Record<string, unknown>;
  expect(Object.getPrototypeOf(properties)).toBe(Object.prototype);
  expect(Object.keys(properties)).not.toContain("nest");
  expect(Object.keys(properties)).toContain("kept");
});
