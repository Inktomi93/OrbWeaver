import {
  injectionDirectiveSchema,
  MAX_INJECTION_DEPTH,
  resolveInjectionPlacement,
} from "@orb/kit/injection";
import { expect, test } from "../../support/fixtures";

// ── injectionDirectiveSchema (depth REQUIRED, role optional) — the opt-in-or-null shape ──

test("injectionDirectiveSchema accepts a full directive and a role-less one", () => {
  expect(injectionDirectiveSchema.safeParse({ depth: 4, role: "assistant" }).success).toBe(true);
  expect(injectionDirectiveSchema.safeParse({ depth: 0 }).success).toBe(true);
});

test("injectionDirectiveSchema requires depth and rejects an out-of-range / non-int depth", () => {
  expect(injectionDirectiveSchema.safeParse({ role: "user" }).success).toBe(false);
  expect(injectionDirectiveSchema.safeParse({ depth: -1 }).success).toBe(false);
  expect(injectionDirectiveSchema.safeParse({ depth: 1.5 }).success).toBe(false);
  expect(injectionDirectiveSchema.safeParse({ depth: MAX_INJECTION_DEPTH + 1 }).success).toBe(
    false,
  );
});

test("injectionDirectiveSchema rejects an unknown role", () => {
  expect(injectionDirectiveSchema.safeParse({ depth: 1, role: "narrator" }).success).toBe(false);
});

// ── resolveInjectionPlacement (field-isolated, per-consumer defaults) ──

const DEFAULTS = { depth: 2, role: "system" } as const;

test("resolveInjectionPlacement honors an explicit depth + role", () => {
  expect(resolveInjectionPlacement({ depth: 5, role: "assistant" }, DEFAULTS)).toEqual({
    depth: 5,
    role: "assistant",
  });
});

test("resolveInjectionPlacement fills each missing field from the caller's defaults", () => {
  expect(resolveInjectionPlacement(undefined, DEFAULTS)).toEqual({ depth: 2, role: "system" });
  expect(resolveInjectionPlacement({}, DEFAULTS)).toEqual({ depth: 2, role: "system" });
});

test("resolveInjectionPlacement is field-isolated — a missing/bad role keeps a valid depth, and vice versa", () => {
  // role present, depth absent → depth from defaults, role honored (NOT collapsed to both-defaults).
  expect(resolveInjectionPlacement({ role: "user" }, DEFAULTS)).toEqual({ depth: 2, role: "user" });
  // depth present, role absent → role from defaults, depth honored.
  expect(resolveInjectionPlacement({ depth: 9 }, DEFAULTS)).toEqual({ depth: 9, role: "system" });
  // bad role, good depth → role falls back, depth survives.
  expect(resolveInjectionPlacement({ depth: 3, role: "narrator" }, DEFAULTS)).toEqual({
    depth: 3,
    role: "system",
  });
  // bad depth, good role → depth falls back, role survives.
  expect(resolveInjectionPlacement({ depth: -1, role: "assistant" }, DEFAULTS)).toEqual({
    depth: 2,
    role: "assistant",
  });
});

test("resolveInjectionPlacement uses each consumer's OWN defaults (the systems aren't tied)", () => {
  // guided defaults depth 0; world-info-ish defaults role user — the same primitive, different initials.
  expect(resolveInjectionPlacement({}, { depth: 0, role: "system" })).toEqual({
    depth: 0,
    role: "system",
  });
  expect(resolveInjectionPlacement({}, { depth: 4, role: "user" })).toEqual({
    depth: 4,
    role: "user",
  });
});
