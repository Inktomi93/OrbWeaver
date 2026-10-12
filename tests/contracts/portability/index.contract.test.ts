import type { PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_IMPORT_ORDER, PORTABLE_KINDS, PORTABLE_PARSE_FAILURES, portableImportOutcomeSchema } from "@orb/contracts/portability";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("image generation provenance restores after its owned assets, subjects and room files", () => {
  const kinds: readonly string[] = PORTABLE_KINDS;
  const order: readonly string[] = PORTABLE_IMPORT_ORDER;
  const imagery = order.indexOf("imagery");
  expect(kinds).toContain("imagery");
  expect(imagery).toBeGreaterThan(order.indexOf("assets"));
  expect(imagery).toBeGreaterThan(order.indexOf("character"));
  expect(imagery).toBeGreaterThan(order.indexOf("chat"));
});

// ── Kind membership: the closed set is EXACTLY the design's §2 eight, no more, no less ──────────────────
test("PORTABLE_KINDS pins the portable entity kinds", () => {
  expect([...PORTABLE_KINDS]).toEqual([
    "character",
    "chat",
    "persona",
    "world-info",
    "regex",
    "databank",
    "preset",
    "theme",
    "user-settings",
    "tag",
    "gallery",
    "assets",
    "imagery",
  ]);
});

// Exhaustiveness over the derived union: a Record<PortableKind, …> fails tsc if a member is added or removed,
// so the union can never silently drift from the tuple it derives from.
const KIND_SEEN: Record<PortableKind, true> = {
  character: true,
  chat: true,
  persona: true,
  "world-info": true,
  regex: true,
  databank: true,
  preset: true,
  theme: true,
  "user-settings": true,
  tag: true,
  gallery: true,
  assets: true,
  imagery: true,
};
test("PortableKind has no member beyond the tuple", () => {
  expect(Object.keys(KIND_SEEN).sort()).toEqual(PORTABLE_KINDS.toSorted());
});

// ── The fixed dependency import order (the ONE cross-entity rule, as data) ──────────────────────────────
test("PORTABLE_IMPORT_ORDER pins the exact dependency order", () => {
  // personas / world-info / tags / regex before characters; characters + personas before chats. `regex`
  // lands before `character` so a bundled card's carried script references re-link to rows that already exist.
  expect([...PORTABLE_IMPORT_ORDER]).toEqual([
    "assets",
    "user-settings",
    "tag",
    "persona",
    "world-info",
    "regex",
    "character",
    "databank",
    "gallery",
    "preset",
    "theme",
    "chat",
    "imagery",
  ]);
});

test("PORTABLE_IMPORT_ORDER is a permutation of PORTABLE_KINDS (every kind exactly once)", () => {
  expect(PORTABLE_IMPORT_ORDER.toSorted()).toEqual(PORTABLE_KINDS.toSorted());
});

// ── The per-file import result the core aggregates into the bundle report ──────────────────────────────
// `importFile` never throws for one malformed file: it returns ok:false with an error string, so one bad entry
// cannot abort the bundle. The schema is the wire form of that outcome.
test("portableImportOutcomeSchema carries an isolated failure and a success with its notes, and refuses an undeclared field", () => {
  const failed: PortableImportOutcome = { ok: false, error: "bad envelope" };
  expect(portableImportOutcomeSchema.parse(failed)).toEqual(failed);

  const restored: PortableImportOutcome = { ok: true, created: true, notes: ["overlay skipped"], memoryChatIds: [mintTypeId(ID_PREFIX.chat)] };
  expect(portableImportOutcomeSchema.parse(restored)).toEqual(restored);

  expect(portableImportOutcomeSchema.safeParse({ ...failed, reason: "bad envelope" }).success).toBe(false);
  expect(portableImportOutcomeSchema.safeParse({ ok: true, memoryChatIds: ["chat_not_a_typeid"] }).success).toBe(false);
});

// #1460 — `invalid-encoding` is a DISTINCT reason from `not-json`: byte-level corruption (malformed UTF-8) is
// checked before JSON syntax even runs, so a family's decode boundary can say WHICH failed.
test("PORTABLE_PARSE_FAILURES pins the closed set of parse-refusal reasons", () => {
  expect([...PORTABLE_PARSE_FAILURES]).toEqual(["not-json", "invalid-encoding", "foreign-kind", "newer-version", "malformed"]);
});
