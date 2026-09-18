import type { TagSource, TagTargetType, TagView, TagWithUsage } from "@orb/contracts/tag";
import {
  createTagSchema,
  TAG_FOLDER_TYPES,
  TAG_SOURCES,
  TAG_STATUSES,
  TAG_TARGET_TYPES,
  tagFolderTypeSchema,
  tagSourceSchema,
  tagStatusSchema,
  tagTargetTypeSchema,
  updateTagSchema,
} from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// Sample branded values built at the sanctioned `castId` seam — no pasted high-entropy literals (noSecrets).
const SAMPLE_TAG_ID = castId<TagId>("tag-romance");

// ── D24 PIN: the target axis is EXACTLY the five per-type-FK junctions, one home ──────────────────────
test("tagTargetTypeSchema round-trips the 5 D24 members and rejects others", () => {
  for (const t of TAG_TARGET_TYPES) {
    expect(tagTargetTypeSchema.parse(t)).toBe(t);
  }
  // D24: per-type FK junctions — exactly these five, no polymorphic catch-all member.
  expect(TAG_TARGET_TYPES).toEqual(["character", "chat", "worldBook", "persona", "preset"]);
  expect(tagTargetTypeSchema.options).toEqual(TAG_TARGET_TYPES);
  expect(tagTargetTypeSchema.safeParse("message").success).toBe(false);
  expect(tagTargetTypeSchema.safeParse("").success).toBe(false);
});

// Exhaustiveness over the union (a `Record<TagTargetType, …>` fails `tsc` if a member is added/removed).
const TARGET_SEEN: Record<TagTargetType, true> = {
  character: true,
  chat: true,
  worldBook: true,
  persona: true,
  preset: true,
};
test("TagTargetType has no member beyond the tuple", () => {
  expect(Object.keys(TARGET_SEEN).sort()).toEqual(TAG_TARGET_TYPES.toSorted());
});

// ── Source axis (invariant #5: no semantic-facet members — those are discovery's) ─────────────────────
test("tagSourceSchema round-trips manual|auto|card and rejects facet-ish values", () => {
  for (const s of TAG_SOURCES) {
    expect(tagSourceSchema.parse(s)).toBe(s);
  }
  expect(TAG_SOURCES).toEqual(["manual", "auto", "card"]);
  // Semantic facets live in `discovery`, never here.
  expect(tagSourceSchema.safeParse("theme").success).toBe(false);
  expect(tagSourceSchema.safeParse("facet").success).toBe(false);
});

test("tagFolderTypeSchema round-trips NONE|OPEN|CLOSED and rejects others", () => {
  for (const f of TAG_FOLDER_TYPES) {
    expect(tagFolderTypeSchema.parse(f)).toBe(f);
  }
  expect(TAG_FOLDER_TYPES).toEqual(["NONE", "OPEN", "CLOSED"]);
  expect(tagFolderTypeSchema.safeParse("none").success).toBe(false);
});

// ── Status axis (the proposedTags → character_tags.status redesign) ───────────────────────────────────
test("tagStatusSchema round-trips the one-surface pending|accepted axis and rejects others", () => {
  for (const s of TAG_STATUSES) {
    expect(tagStatusSchema.parse(s)).toBe(s);
  }
  // One surface (the junction status column) — NOT neo's parallel `proposedTags` JSON store.
  expect(TAG_STATUSES).toEqual(["pending", "accepted"]);
  expect(tagStatusSchema.safeParse("proposed").success).toBe(false);
  expect(tagStatusSchema.safeParse("rejected").success).toBe(false);
});

test("createTagSchema accepts a valid tag, round-trips, and defaults source to optional", () => {
  const full = { name: "Romance", color: "#c0ffee", source: "card" as const };
  expect(createTagSchema.parse(full)).toEqual(full);
  // color + source are optional.
  const minimal = { name: "Slowburn" };
  expect(createTagSchema.parse(minimal)).toEqual(minimal);
  // name is required and non-empty.
  expect(createTagSchema.safeParse({ name: "" }).success).toBe(false);
  expect(createTagSchema.safeParse({}).success).toBe(false);
  // a non-member source is rejected (derives from the one tagSourceSchema).
  expect(createTagSchema.safeParse({ name: "X", source: "theme" }).success).toBe(false);
});

test("updateTagSchema is a partial patch; null color clears, undefined leaves untouched", () => {
  const patch = {
    name: "Romance",
    color: null,
    color2: "#222222",
    source: "manual" as const,
    folderType: "OPEN" as const,
    isHiddenOnCard: true,
  };
  expect(updateTagSchema.parse(patch)).toEqual(patch);
  // empty patch is valid (no-op edit).
  expect(updateTagSchema.parse({})).toEqual({});
  // null = clear-to-theme-default (distinct from undefined = untouched).
  expect(updateTagSchema.parse({ color: null })).toEqual({ color: null });
  // a non-member folderType is rejected.
  expect(updateTagSchema.safeParse({ folderType: "open" }).success).toBe(false);
});

test("TagView pins the row shape (theme-default + unordered nulls)", () => {
  const view: TagView = {
    id: SAMPLE_TAG_ID,
    name: "Romance",
    color: null,
    color2: null,
    source: "manual",
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
  };
  // The `TagView` annotation enforces the exact shape at compile time (excess-property check on the
  // literal); the key count is the runtime belt against drift. (Field names are accessed, not pasted as
  // string literals, to avoid the noSecrets high-entropy heuristic.)
  const ViewFieldCount = 8;
  expect(Object.keys(view)).toHaveLength(ViewFieldCount);
  expect(view.id).toBe(SAMPLE_TAG_ID);
  expect(view.color).toBeNull();
  expect(view.color2).toBeNull();
  expect(view.sortOrder).toBeNull();
  expect(view.isHiddenOnCard).toBe(false);
  // source may be null (no provenance recorded).
  const noSource: TagView["source"] = null;
  expect(noSource).toBeNull();
});

test("TagWithUsage extends TagView with the five-junction rollup", () => {
  const usage = { characters: 3, chats: 1, worldBooks: 0, personas: 2, presets: 0, total: 6 };
  const row: TagWithUsage = {
    id: SAMPLE_TAG_ID,
    name: "Romance",
    color: null,
    color2: null,
    source: "card",
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
    usage,
  };
  expect(Object.keys(row.usage).sort()).toEqual(["characters", "chats", "personas", "presets", "total", "worldBooks"].sort());
  expect(row.usage.total).toBe(6);
});

// TagAttachmentView test DELETED (#1033 viewgap decision 1): the wire shape was test-only and is removed.

// Type-level pin: the source axis is the inferred union, not a widened string (a drift would fail tsc).
test("TagSource is the narrow union (derives from tagSourceSchema)", () => {
  const sources: TagSource[] = [...TAG_SOURCES];
  expect(sources).toHaveLength(TAG_SOURCES.length);
});
