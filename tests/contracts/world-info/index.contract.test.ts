import type { EntryMetadata, WorldBookRole, WorldInfoScope } from "@orb/contracts/world-info";
import {
  createBookSchema,
  createEntrySchema,
  entryMetadataSchema,
  entryMetadataWriteSchema,
  updateBookSchema,
  updateEntrySchema,
  WORLD_BOOK_ROLES,
  WORLD_INFO_SCOPES,
  worldBookRoleSchema,
  worldInfoScopeSchema,
} from "@orb/contracts/world-info";
import { expect, test } from "../../support/fixtures";

// ── Role axis (D-deviation pin: exactly primary|auxiliary, one home) ────────
test("worldBookRoleSchema round-trips both members and rejects others", () => {
  for (const role of WORLD_BOOK_ROLES) {
    expect(worldBookRoleSchema.parse(role)).toBe(role);
  }
  expect(worldBookRoleSchema.safeParse("primary").success).toBe(true);
  expect(worldBookRoleSchema.safeParse("auxiliary").success).toBe(true);
  expect(worldBookRoleSchema.safeParse("character").success).toBe(false);
  // The tuple is the exact two-member axis — no drift.
  expect(WORLD_BOOK_ROLES).toEqual(["primary", "auxiliary"]);
});

test("worldInfoScopeSchema round-trips always|keyword and rejects others", () => {
  for (const scope of WORLD_INFO_SCOPES) {
    expect(worldInfoScopeSchema.parse(scope)).toBe(scope);
  }
  expect(worldInfoScopeSchema.safeParse("auto").success).toBe(false);
});

test("createBookSchema accepts a valid book and round-trips", () => {
  const book = { name: "Lore", description: "world background" };
  expect(createBookSchema.parse(book)).toEqual(book);
  // description is optional.
  expect(createBookSchema.parse({ name: "Lore" })).toEqual({ name: "Lore" });
});

test("createBookSchema rejects an empty name", () => {
  expect(createBookSchema.safeParse({ name: "" }).success).toBe(false);
});

test("updateBookSchema makes every field optional", () => {
  expect(updateBookSchema.parse({})).toEqual({});
  expect(updateBookSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
});

test("createEntrySchema accepts a valid entry and round-trips", () => {
  const entry = {
    title: "The Capital",
    description: "memo",
    content: "A walled city on the river.",
    keys: ["capital", "city"],
    enabled: true,
    priority: 10,
    ignoreBudget: false,
    metadata: { scopeMode: "keyword" },
  };
  expect(createEntrySchema.parse(entry)).toEqual(entry);
});

test("createEntrySchema requires title and content; keys/priority are optional", () => {
  expect(createEntrySchema.safeParse({ title: "x", content: "y" }).success).toBe(true);
  expect(createEntrySchema.safeParse({ title: "", content: "y" }).success).toBe(false);
  expect(createEntrySchema.safeParse({ title: "x", content: "" }).success).toBe(false);
});

test("updateEntrySchema makes every field optional and allows null description/metadata", () => {
  expect(updateEntrySchema.parse({})).toEqual({});
  expect(updateEntrySchema.parse({ description: null, metadata: null })).toEqual({
    description: null,
    metadata: null,
  });
});

// ── Entry metadata read shape (lenient, field-isolated, typed inject) ───────
test("entryMetadataSchema is lenient — unknown keys ride through untouched", () => {
  const blob = {
    scopeMode: "always",
    position: "after",
    inject: { depth: 3, role: "system" },
    // a preserved ST import field the schema doesn't model:
    stExtraField: "kept",
  };
  expect(entryMetadataSchema.parse(blob)).toEqual(blob);
});

test("entryMetadataSchema inject carries the shared {depth, role?} directive (role optional)", () => {
  const onlyDepth = { inject: { depth: 2 } };
  expect(entryMetadataSchema.parse(onlyDepth)).toEqual(onlyDepth);
  // an empty metadata blob is valid (all fields optional).
  expect(entryMetadataSchema.parse({})).toEqual({});
});

test("entryMetadataWriteSchema accepts a valid blob and a lenient open record", () => {
  expect(entryMetadataWriteSchema.safeParse({ scopeMode: "always" }).success).toBe(true);
  // unknown keys are tolerated (open record).
  expect(entryMetadataWriteSchema.safeParse({ whatever: 1 }).success).toBe(true);
  // a non-system/user assistant injection at a safe depth passes.
  expect(
    entryMetadataWriteSchema.safeParse({ inject: { depth: 1, role: "assistant" } }).success,
  ).toBe(true);
});

// D66-B (W5, ruling A): the assistant@depth-0 WRITE-reject is REMOVED — authored prefill is now
// persistable; the SHAPE delivery gate normalizes it on a `assistantPrefill:false` model. Shape
// validation stays.
test("entryMetadataWriteSchema ACCEPTS assistant-role at depth 0 (normalized at SHAPE delivery, D66-B)", () => {
  const prefill = { inject: { depth: 0, role: "assistant" } };
  expect(entryMetadataWriteSchema.safeParse(prefill).success).toBe(true);
  // depth 0 with role user/system stays valid.
  expect(entryMetadataWriteSchema.safeParse({ inject: { depth: 0, role: "user" } }).success).toBe(
    true,
  );
  expect(entryMetadataWriteSchema.safeParse({ inject: { depth: 0, role: "system" } }).success).toBe(
    true,
  );
});

test("entryMetadataWriteSchema rejects a typo'd scopeMode at write time", () => {
  expect(entryMetadataWriteSchema.safeParse({ scopeMode: "alwyas" }).success).toBe(false);
});

// ── Type-level pins (compile-time; assertions keep them load-bearing) ───────
test("EntryMetadata is the typed read shape (not Record<string, unknown>)", () => {
  const meta: EntryMetadata = { scopeMode: "always", inject: { depth: 4, role: "user" } };
  expect(meta.inject?.role).toBe("user");
  const role: WorldBookRole = "primary";
  const scope: WorldInfoScope = "keyword";
  expect(role).toBe("primary");
  expect(scope).toBe("keyword");
});
