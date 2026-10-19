import { evalCel, isCelParseError, parseCel } from "@orb/kit/cel";
import { isPlainObject } from "@orb/kit/guards";
import { JsonSchemaLiftError, liftJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// JSON.parse keeps `__proto__` as an own key; a copy into `{}` would hand it to the inherited setter instead.
const PROTO_DATA = '{"__proto__":{"inherited":"smuggled"},"kept":2}';

test("a CEL map value keeps a __proto__ key as its own data", () => {
  const program = parseCel("data");
  if (isCelParseError(program)) {
    throw new Error(program.message);
  }
  const value = evalCel(program, { data: JSON.parse(PROTO_DATA) });
  expect(typeof value === "object" && value !== null ? Object.keys(value).toSorted() : value).toEqual(["__proto__", "kept"]);
  expect(JSON.stringify(value)).toBe(PROTO_DATA);
});

test("a JSON Schema property named __proto__ is refused, not silently dropped from the lifted validator", () => {
  const schema: unknown = JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"},"name":{"type":"string"}},"required":["__proto__","name"]}');
  if (!isPlainObject(schema)) {
    throw new Error("the fixture schema is not an object");
  }
  expect(() => liftJsonSchema(schema)).toThrow(JsonSchemaLiftError);
});
