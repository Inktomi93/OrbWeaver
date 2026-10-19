import { scrubWireSchema, WIRE_SCHEMA_MODES } from "@orb/contracts/inference";
import { isPlainObject } from "@orb/kit/guards";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// A stored schema is user- or model-authored JSON, and JSON.parse keeps `__proto__` as an own key.
const SCHEMA = '{"type":"object","properties":{"__proto__":{"type":"string"},"name":{"type":"string"}},"required":["name"],"additionalProperties":false}';

test.for(WIRE_SCHEMA_MODES)("the %s scrub keeps a __proto__ property as its own key", (mode) => {
  const parsed: unknown = JSON.parse(SCHEMA);
  if (!isPlainObject(parsed)) {
    throw new Error("the fixture schema is not an object");
  }
  const { schema } = scrubWireSchema(parsed, mode);
  const properties = schema["properties"];
  expect(typeof properties === "object" && properties !== null ? Object.keys(properties).toSorted() : properties).toEqual(["__proto__", "name"]);
});
