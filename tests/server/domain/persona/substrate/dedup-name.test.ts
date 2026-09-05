// substrate: dedup-name — the ONE normalisation a persona name is deduped under, and the index built from
// it. It exists because the two import doors used to fold names differently (the single-FILE door compared
// the stored string byte-for-byte; the BULK door compared `trim().toLowerCase()`), so "Alice" one way and
// " alice " the other minted two rows for one person. What is pinned here is the FOLD itself and the
// collision rule the index applies — the two things a second copy would get subtly wrong.

import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { dedupPersonaName, indexByDedupName } from "../../../../../packages/server/src/domain/persona/substrate/dedup-name.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const id = (n: string): PersonaId => castId<PersonaId>(`persona_${n}`);

test("the fold is trim + case, and nothing else — inner spacing and punctuation are part of the name", () => {
  expect(dedupPersonaName("  Alice  ")).toBe("alice");
  expect(dedupPersonaName("ALICE")).toBe("alice");
  expect(dedupPersonaName("\tAlice\n")).toBe("alice");
  // Two DIFFERENT people, and the fold must keep them apart: inner whitespace is authored, not incidental.
  expect(dedupPersonaName("Mary Anne")).not.toBe(dedupPersonaName("MaryAnne"));
  // …and it is Unicode-aware case folding, which is exactly why the comparison happens in JS and never in
  // SQL: SQLite's `lower()` is ASCII-only, so a SQL-side fold would be a SECOND, disagreeing normalisation.
  expect(dedupPersonaName("École")).toBe("école");
});

test("the index keys on the folded name, so every spelling of one person resolves to one id", () => {
  const index = indexByDedupName([
    { id: id("alice"), name: " Alice " },
    { id: id("bob"), name: "Bob" },
  ]);

  expect(index.get(dedupPersonaName("ALICE"))).toBe(id("alice"));
  expect(index.get(dedupPersonaName("alice  "))).toBe(id("alice"));
  expect(index.get(dedupPersonaName("Bob"))).toBe(id("bob"));
  expect(index.size).toBe(2);
});

test("FIRST row wins a folded-name collision — the caller's ordering IS the collision rule", () => {
  // Persistence hands these newest-first, so this is what makes "newest wins" the answer for BOTH doors.
  const index = indexByDedupName([
    { id: id("newest"), name: "Alice" },
    { id: id("oldest"), name: "alice" },
  ]);

  expect(index.get("alice")).toBe(id("newest"));
  expect(index.size).toBe(1);
});
