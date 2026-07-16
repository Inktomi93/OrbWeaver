// support/fixtures — self-test for the caller fixtures over the REAL composed graph (createServices →
// createContext → createCaller, the full middleware ladder). Pins the three-way doctrine the fixtures
// encode (fixtures.ts header):
//   • anon → UNAUTHORIZED on an authed surface (authedProcedure 401s auth:null).
//   • cross-user read → NOT_FOUND, NEVER FORBIDDEN — "missing" and "not yours" collapse into one answer
//     (a 403 would be an existence oracle / foreign-existence leak).
//   • admin-gated surface by a non-admin → FORBIDDEN (the caller exists; the action is gated).
// Also proves the happy paths (owner round-trip; admin passes the gate) and that these callers ride the
// REAL tRPC error mapping — the matchers see genuine ladder-thrown TRPCErrors, not ducks.

import { describe } from "vitest";
import { expect, test } from "./fixtures.ts";

describe("anonCaller — the unauthenticated request", () => {
  test("an authed surface rejects UNAUTHORIZED", async ({ anonCaller }) => {
    await expect(anonCaller.persona.list()).toThrowTRPCError("UNAUTHORIZED");
  });

  test("the public health surface still answers (anon is a caller, not a brick)", async ({ anonCaller }) => {
    expect(await anonCaller.health()).toEqual({ ok: true });
  });
});

describe("cross-user isolation — NOT_FOUND, never FORBIDDEN", () => {
  test("another user's persona is indistinguishable from a missing one", async ({ ownerCaller, otherCaller }) => {
    const created = await ownerCaller.persona.create({
      input: { name: "Secret", description: "the owner's private persona" },
    });
    await expect(otherCaller.persona.get({ personaId: created.id })).toThrowTRPCError("NOT_FOUND");
  });
});

describe("admin gating — FORBIDDEN for a plain user, open for admin/owner", () => {
  test("an admin-gated mutation by a non-admin rejects FORBIDDEN", async ({ otherCaller }) => {
    await expect(otherCaller.admin.createUser({ handle: "sneaky", password: "not-gonna-happen-1234" })).toThrowTRPCError("FORBIDDEN");
  });

  test("an admin-gated query by a non-admin rejects FORBIDDEN (gate, not oracle — admin surfaces are advertised)", async ({ otherCaller }) => {
    await expect(otherCaller.admin.listUsers()).toThrowTRPCError("FORBIDDEN");
  });

  test("adminCaller and ownerCaller both pass the owner∪admin gate (D17)", async ({ adminCaller, ownerCaller }) => {
    const viaAdmin = await adminCaller.admin.listUsers();
    const viaOwner = await ownerCaller.admin.listUsers();
    // Both fixture users are seeded (each caller seeds its own row before acting).
    expect(viaAdmin.length).toBeGreaterThanOrEqual(2);
    expect(viaOwner.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the owner happy path", () => {
  test("ownerCaller round-trips its own entity through the real ladder", async ({ ownerCaller }) => {
    const created = await ownerCaller.persona.create({
      input: { name: "Nyx", description: "d" },
    });
    const got = await ownerCaller.persona.get({ personaId: created.id });
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("Nyx");
  });
});
