import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { MODE_RESOLVERS } from "#server/infra/auth/index.ts";
import { headers, makeAuthConfig } from "../_support.ts";

// `single-user` mode resolver — ALWAYS null: it never gates, never reads a cookie/header, and delegates
// entirely to the UNCONDITIONAL owner fallback in `resolve`. The load-bearing invariant is that it does
// NOT short-circuit on any input (a cookie/header present must still yield null, so the fallback owns the
// decision). Reached via MODE_RESOLVERS["single-user"] (the resolver isn't on the barrel).

const resolveSingleUser = MODE_RESOLVERS["single-user"];

describe("resolveSingleUser", () => {
  test("empty headers + empty deps → null", async () => {
    expect(await resolveSingleUser(headers(), makeAuthConfig(), {})).toBeNull();
  });

  test("a session cookie is IGNORED → still null (never short-circuits)", async () => {
    expect(await resolveSingleUser(headers({ cookie: "__Host-orb_session=t" }), makeAuthConfig(), {})).toBeNull();
  });

  test("an SSO-style forward header is IGNORED → still null", async () => {
    expect(await resolveSingleUser(headers({ "x-authentik-username": "alice" }), makeAuthConfig(), {})).toBeNull();
  });
});
