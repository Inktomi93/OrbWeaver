// The procedure ladder — the 2-layer auth gates + the injected rate-limit seam, driven through the real
// `appRouter` via `createCaller` (core/Tier-4-Transport.md). Proves: authedProcedure rejects anon;
// adminProcedure rejects a plain user but passes owner ∪ admin (LAYER-1, no db); a representative router
// delegates to the injected service verb with the Principal; the CSRF gate fires on cookie mutations only;
// the injected rate-limit gate's throw maps to TOO_MANY_REQUESTS.

import { DomainRateLimitError } from "@orb/kit/errors";
import type { AdminService } from "@orb/server/domain/admin";
import type { BuddyService } from "@orb/server/domain/buddy";
import { describe, expect, test, vi } from "vitest";
import { caller, denyRateLimit, makeContext, principal } from "./_support.ts";

describe("authedProcedure", () => {
  test("rejects an anonymous caller with UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).buddy.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("admits an authenticated caller (the gate passes through to the verb)", async () => {
    const get = vi.fn<BuddyService["get"]>();
    const ctx = makeContext({ auth: principal("user"), services: { buddy: { get } } });
    await caller(ctx).buddy.get();
    expect(get).toHaveBeenCalledWith({ principal: ctx.auth });
  });
});

describe("adminProcedure (LAYER-1, owner ∪ admin, no db round-trip)", () => {
  test("rejects a plain user with FORBIDDEN", async () => {
    const ctx = makeContext({ auth: principal("user") });
    await expect(caller(ctx).admin.vllmEngines()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("rejects an anonymous caller with UNAUTHORIZED (auth gate fires first)", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).admin.vllmEngines()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("passes an owner through to the verb", async () => {
    const vllmEngines = vi.fn<AdminService["vllmEngines"]>();
    const ctx = makeContext({ auth: principal("owner"), services: { admin: { vllmEngines } } });
    await caller(ctx).admin.vllmEngines();
    expect(vllmEngines).toHaveBeenCalledTimes(1);
  });

  test("passes a delegated admin through to the verb", async () => {
    const vllmEngines = vi.fn<AdminService["vllmEngines"]>();
    const ctx = makeContext({ auth: principal("admin"), services: { admin: { vllmEngines } } });
    await caller(ctx).admin.vllmEngines();
    expect(vllmEngines).toHaveBeenCalledTimes(1);
  });
});

describe("a representative router delegates to the injected service verb", () => {
  test("admin.vllmEngines calls ctx.services.admin.vllmEngines with the Principal (PD-3)", async () => {
    const vllmEngines = vi.fn<AdminService["vllmEngines"]>();
    const ctx = makeContext({ auth: principal("admin"), services: { admin: { vllmEngines } } });
    await caller(ctx).admin.vllmEngines();
    expect(vllmEngines).toHaveBeenCalledWith({ principal: ctx.auth });
  });
});

describe("CSRF gate (cookie-authed mutations only)", () => {
  test("a cookie mutation WITHOUT the custom header → FORBIDDEN", async () => {
    const setAgency = vi.fn<BuddyService["setAgency"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: false,
      services: { buddy: { setAgency } },
    });
    await expect(caller(ctx).buddy.setAgency({ enabled: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(setAgency).not.toHaveBeenCalled();
  });

  test("a cookie mutation WITH the custom header passes", async () => {
    const setAgency = vi.fn<BuddyService["setAgency"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: true,
      services: { buddy: { setAgency } },
    });
    await caller(ctx).buddy.setAgency({ enabled: true });
    expect(setAgency).toHaveBeenCalledWith({ principal: ctx.auth, enabled: true });
  });

  test("a header-authed mutation is exempt (no cross-site surface)", async () => {
    const setAgency = vi.fn<BuddyService["setAgency"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "header" }),
      csrfHeaderPresent: false,
      services: { buddy: { setAgency } },
    });
    await caller(ctx).buddy.setAgency({ enabled: true });
    expect(setAgency).toHaveBeenCalledTimes(1);
  });

  test("a query is never CSRF-gated (even cookie-authed without the header)", async () => {
    const get = vi.fn<BuddyService["get"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: false,
      services: { buddy: { get } },
    });
    await caller(ctx).buddy.get();
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("the injected rate-limit gate", () => {
  test("a DomainRateLimitError from the gate maps to TOO_MANY_REQUESTS", async () => {
    const ctx = makeContext({
      auth: principal("user"),
      rateLimit: denyRateLimit(new DomainRateLimitError("slow down")),
    });
    await expect(caller(ctx).buddy.get()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
