// `FORWARD_AUTH_JWKS` admits an https URL or a JWKS literal at boot, and refuses every other value before a sign-in can reach it.
// @subject packages/server/src/foundation/env/operator-jwks.ts

import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/helpers";

const KEY = { kty: "EC", crv: "P-256", x: "x-coordinate", y: "y-coordinate" };

function sourceOf(value: string): ReturnType<typeof createTestEnv>["FORWARD_AUTH_JWKS"] {
  return createTestEnv({ ["FORWARD_AUTH_JWKS"]: value }).FORWARD_AUTH_JWKS;
}

test("an https URL parses to the url source", () => {
  expect(sourceOf(" https://auth.example.test/jwks ")).toEqual({ kind: "url", url: new URL("https://auth.example.test/jwks") });
});

test("a JWKS literal parses to the literal source", () => {
  expect(sourceOf(JSON.stringify({ keys: [KEY] }))).toEqual({ kind: "literal", jwks: { keys: [KEY] } });
});

test.for<{ name: string; value: string }>([
  { name: "a plain http URL", value: "http://auth.example.test/jwks" },
  { name: "a value that is not a URL", value: "auth.example.test" },
  { name: "broken JSON", value: "{ not json" },
  { name: "keys that are not a list", value: JSON.stringify({ keys: "nope" }) },
  { name: "keys that are null", value: JSON.stringify({ keys: null }) },
  { name: "no keys member", value: JSON.stringify({ other: [] }) },
  { name: "an empty key list", value: JSON.stringify({ keys: [] }) },
  { name: "a real key beside a scalar member", value: JSON.stringify({ keys: [KEY, 1] }) },
  { name: "a real key beside a list member", value: JSON.stringify({ keys: [KEY, []] }) },
  { name: "a real key beside a null member", value: JSON.stringify({ keys: [KEY, null] }) },
])("$name refuses the boot", ({ value }) => {
  expect(() => sourceOf(value)).toThrow(EnvRefusedError);
});
