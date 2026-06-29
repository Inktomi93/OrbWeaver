// `@orb/contracts/memory` — the §9 reserved seam unions (Clips/Trackers/world-state), typed NOW with ZERO
// behavior. Pins the three axes' membership + that each Zod schema DERIVES its canonical `as const` tuple
// (one home — the type AND the schema mirror the tuple; no re-spelled union, no re-spelled enum list).

import type { ClipKind, ClipScope, ClipSourceKind } from "@orb/contracts/memory";
import {
  CLIP_KINDS,
  CLIP_SCOPES,
  CLIP_SOURCE_KINDS,
  clipKindSchema,
  clipScopeSchema,
  clipSourceKindSchema,
} from "@orb/contracts/memory";
import { expect, test } from "vitest";

test("CLIP_KINDS is exactly [fact, trait, relationship, world-state, plot-thread]", () => {
  expect([...CLIP_KINDS]).toEqual(["fact", "trait", "relationship", "world-state", "plot-thread"]);
  // The Zod schema derives the SAME tuple (no re-spelled member list).
  expect(clipKindSchema.options).toEqual(CLIP_KINDS);
  const all: ClipKind[] = [...CLIP_KINDS];
  expect(new Set(all).size).toBe(CLIP_KINDS.length);
});

test("CLIP_SOURCE_KINDS is exactly [user, synthesized, promoted]", () => {
  expect([...CLIP_SOURCE_KINDS]).toEqual(["user", "synthesized", "promoted"]);
  expect(clipSourceKindSchema.options).toEqual(CLIP_SOURCE_KINDS);
  const all: ClipSourceKind[] = [...CLIP_SOURCE_KINDS];
  expect(new Set(all).size).toBe(CLIP_SOURCE_KINDS.length);
});

test("CLIP_SCOPES is exactly [character, chat, global]", () => {
  expect([...CLIP_SCOPES]).toEqual(["character", "chat", "global"]);
  expect(clipScopeSchema.options).toEqual(CLIP_SCOPES);
  const all: ClipScope[] = [...CLIP_SCOPES];
  expect(new Set(all).size).toBe(CLIP_SCOPES.length);
});

test("each clip schema round-trips every member and rejects a non-member", () => {
  for (const k of CLIP_KINDS) {
    expect(clipKindSchema.parse(k)).toBe(k);
  }
  expect(clipKindSchema.safeParse("note").success).toBe(false);
  expect(clipSourceKindSchema.safeParse("auto").success).toBe(false);
  expect(clipScopeSchema.safeParse("room").success).toBe(false);
});
