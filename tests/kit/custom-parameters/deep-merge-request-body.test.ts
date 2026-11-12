// @subject packages/kit/src/custom-parameters/index.ts
// A request body merged with user-authored extras never carries a `__proto__`, `constructor` or `prototype` key, at any
// depth, from either side, and the merge never writes through to Object.prototype (Layer 2 of the prototype-pollution
// defense; the preset schema is Layer 1).
import { deepMergeRequestBody } from "@orb/kit/custom-parameters";
import { expect, test } from "@orb/testkit/node";

const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"] as const;
const POLLUTED = "polluted";

// The extras as the user authored them: JSON text, so a `__proto__` key is an own property, as it is on the wire.
function authored(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("an extras object");
  }
  return Object.fromEntries(Object.entries(value));
}

// Every key the merged body holds, at every depth, with any it reads through a prototype the merge set: an assigned
// `__proto__` leaves no own key, only a new prototype.
function keysOf(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysOf);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const inherited = POLLUTED in value ? [POLLUTED] : [];
  return [...inherited, ...Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)])];
}

test.for(FORBIDDEN_KEYS)("a %s key in user-authored extras never reaches the merged body, at any depth, and pollutes nothing", (key) => {
  const extras = authored(
    `{${JSON.stringify(key)}:{"${POLLUTED}":true},"temperature":0.5,"nested":{${JSON.stringify(key)}:{"${POLLUTED}":true},"top_k":40},"fresh":{"list":[{${JSON.stringify(key)}:{"${POLLUTED}":true}}]}}`,
  );
  const merged = deepMergeRequestBody({ model: "m", nested: { ["top_p"]: 0.9 } }, extras);

  expect(keysOf(merged)).not.toContain(key);
  expect(keysOf(merged)).not.toContain(POLLUTED);
  expect(Object.hasOwn(Object.prototype, POLLUTED)).toBe(false);
  // Positive control: the user's ordinary extras are merged, nested ones beside the base's.
  expect(merged).toEqual({ model: "m", temperature: 0.5, nested: { ["top_p"]: 0.9, ["top_k"]: 40 }, fresh: { list: [{}] } });
});

test.for(FORBIDDEN_KEYS)("a %s key on the base side never reaches the merged body either", (key) => {
  const merged = deepMergeRequestBody(authored(`{${JSON.stringify(key)}:{"${POLLUTED}":true},"model":"m"}`), { temperature: 0.5 });
  expect(keysOf(merged)).not.toContain(key);
  expect(keysOf(merged)).not.toContain(POLLUTED);
  expect(merged).toEqual({ model: "m", temperature: 0.5 });
});
