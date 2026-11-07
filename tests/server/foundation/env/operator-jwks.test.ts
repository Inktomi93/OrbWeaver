// `FORWARD_AUTH_JWKS` admits an https URL or a JWKS literal at boot, and refuses every other value before a sign-in can reach it.
// @subject packages/server/src/foundation/env/operator-jwks.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
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

const SIGNED_KEYS = { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny", ["FORWARD_AUTH_JWKS"]: "https://auth.example.test/jwks" };
const ISSUER = "https://auth.example.test/application/o/orbweaver/";
const AUDIENCE = "orbweaver-client";

test.for<{ name: string; missing: string; env: Record<string, string> }>([
  { name: "no issuer", missing: "FORWARD_AUTH_JWT_ISSUER", env: { ["FORWARD_AUTH_JWT_AUDIENCE"]: AUDIENCE } },
  { name: "no audience", missing: "FORWARD_AUTH_JWT_AUDIENCE", env: { ["FORWARD_AUTH_JWT_ISSUER"]: ISSUER } },
  { name: "an empty issuer", missing: "FORWARD_AUTH_JWT_ISSUER", env: { ["FORWARD_AUTH_JWT_ISSUER"]: "", ["FORWARD_AUTH_JWT_AUDIENCE"]: AUDIENCE } },
  { name: "an empty audience", missing: "FORWARD_AUTH_JWT_AUDIENCE", env: { ["FORWARD_AUTH_JWT_ISSUER"]: ISSUER, ["FORWARD_AUTH_JWT_AUDIENCE"]: "" } },
])("the signed path with $name refuses the boot and names the key", ({ missing, env }) => {
  expect(() => createTestEnv({ ...SIGNED_KEYS, ...env })).toThrow(new RegExp(missing, "u"));
});

test("the signed path boots with its issuer and audience", () => {
  const env = createTestEnv({ ...SIGNED_KEYS, ["FORWARD_AUTH_JWT_ISSUER"]: ISSUER, ["FORWARD_AUTH_JWT_AUDIENCE"]: AUDIENCE });
  expect({ issuer: env.FORWARD_AUTH_JWT_ISSUER, audience: env.FORWARD_AUTH_JWT_AUDIENCE }).toEqual({ issuer: ISSUER, audience: AUDIENCE });
});

test("an unsigned deployment needs no issuer or audience", () => {
  expect(createTestEnv({ ...SIGNED_KEYS, ["FORWARD_AUTH_VERIFY_JWT"]: "false" }).FORWARD_AUTH_VERIFY_JWT).toBe(false);
  expect(createTestEnv({ [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" }).FORWARD_AUTH_JWKS).toBeUndefined();
});
