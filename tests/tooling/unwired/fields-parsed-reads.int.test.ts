// A value a schema's parse produced keeps its members when the code widens it to a record: each literal string key
// read on it, or on a record narrowed out of one of its members, reads that schema member.
import { expect, test } from "@orb/testkit/tooling";
import { fieldsScan, GRAPH_SOURCE, fieldRows as named, ZOD_MODULE } from "./_planted.ts";

const FILE = "parsed.ts";

const PARSED = {
  ...ZOD_MODULE,
  [`${GRAPH_SOURCE}/${FILE}`]: [
    'import { z } from "zod";',
    "type Json = Record<string, unknown>;",
    'const isRecord = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);',
    "export const lineSchema = z.object({",
    "  done: z.string().optional(),",
    "  message: z.object({",
    "    content: z.string().optional(),",
    "    calls: z.array(z.object({ id: z.string().optional(), fn: z.object({ name: z.string(), spare: z.string() }) })).optional(),",
    "  }).optional(),",
    "});",
    "export const parseLine = (text: string): Json => lineSchema.parse(JSON.parse(text));",
    "const callsOf = (calls: unknown): string[] =>",
    '  Array.isArray(calls) ? calls.filter(isRecord).map((call) => { const fn = isRecord(call["fn"]) ? call["fn"] : {}; return String(call["id"]) + String(fn["name"]); }) : [];',
    'const slotOf = (message: unknown): string => { const msg = isRecord(message) ? message : {}; return String(msg["content"]) + callsOf(msg["calls"]).join(); };',
    'export const chunkOf = (line: Json): string => (line["done"] === "yes" ? "" : slotOf(line["message"]));',
    'export const shown = chunkOf(parseLine("{}"));',
    "export const otherSchema = z.object({ id: z.string(), name: z.string() });",
    "export const other = otherSchema.parse({});",
    'export const table: Json = { id: "i" };',
    'export const unrelated = String(table["id"]) + String(table["name"]);',
  ].join("\n"),
};

test("a literal key read on a parsed value widened to a record reads that schema member; an unrelated record read credits none", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await fieldsScan(plantedTree, PARSED);
  expect(named(report.validated, FILE)).toEqual([
    "lineSchema.message.calls.fn.spare unreferenced",
    "otherSchema.id unreferenced",
    "otherSchema.name unreferenced",
  ]);
});
