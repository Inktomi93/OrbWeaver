// The PIN for the CITATION SUBJECT GRAMMAR (#2156's filed join, built 2026-09-13 on codex review F1).
//
// WHAT THIS DEFENDS. The barrier's original hard arm was "the cited id resolves", which is blind to the
// defect that filed #2156: #2153 crossed two ids that BOTH exist. The join below is the missing half, and
// it is only worth what its grammar is worth — so every arm here is a way the grammar could quietly stop
// discriminating: a key read past its `·`, an emphasis marker left in, a `**Where:**` quoted inside prose
// read as a declaration, and the substring trap where `L1` matches `L11`.
import { declaredSubjectKey, parseSubject, subjectKey, subjectVerdict } from "../../../../tooling/src/verify/lib/citation-subject.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const L5_BODY =
  "Verifier `cb-v-parity-instruments` over three shas — ledger row L6.\n\n**Where:** cb-v-parity-instruments L5 · `tooling/src/verify/contract/population.ts:74`\n\n**Defect:** …";

test("subjectKey cuts at the first `·` and strips the authored markup", () => {
  expect(subjectKey("cb-v-parity-instruments L5 · `population.ts:74` · `x.ts:1`")).toBe("cb-v-parity-instruments L5");
  expect(subjectKey("  **cb-v-fix-wave-1  L3**  ")).toBe("cb-v-fix-wave-1 L3");
  expect(subjectKey("")).toBeUndefined();
  expect(subjectKey(" · only a tail")).toBeUndefined();
});

test("declaredSubjectKey reads the row's OWN `**Where:**` line, anchored to the line start", () => {
  expect(declaredSubjectKey(L5_BODY)).toBe("cb-v-parity-instruments L5");
  expect(declaredSubjectKey("no declaration here")).toBeUndefined();
  // A quotation of the grammar mid-sentence is prose, not this row's claim about itself.
  expect(declaredSubjectKey("the body should carry a **Where:** cb-v-other L9 line, but this one does not")).toBeUndefined();
});

test("parseSubject accepts the one authored row spelling and refuses the rest, rather than guessing", () => {
  expect(parseSubject("cb-v-parity-instruments L11")).toEqual({ family: "cb-v-parity-instruments", row: "L11" });
  // Older wave labels (`w6 :157`) and family-only labels carry no row: `unkeyed`, never a guessed match.
  expect(parseSubject("w6 :157")).toBeUndefined();
  expect(parseSubject("cb-v-wave-9b")).toBeUndefined();
  expect(parseSubject(undefined)).toBeUndefined();
});

test("SAME wave, DIFFERENT row is crossed — the #2153 shape, and `L1` must not match `L11`", () => {
  expect(subjectVerdict("cb-v-parity-instruments L5", L5_BODY)).toBe("matched");
  // The founding pair: the L5 row citing the issue that owns L4.
  expect(subjectVerdict("cb-v-parity-instruments L4", L5_BODY)).toBe("crossed");
  // THE SUBSTRING TRAP: a containment test would call this matched, because `cb-v-x L1` is a prefix of
  // `cb-v-x L11`. The join compares parsed rows, so it does not.
  expect(subjectVerdict("cb-v-parity-instruments L1", "**Where:** cb-v-parity-instruments L11 · `x.ts:1`")).toBe("crossed");
});

test("a different wave is cross-family, an unparsable key is unkeyed, and no declaration is undeclared", () => {
  expect(subjectVerdict("cb-v-wave-8c L5", "**Where:** cb-v-fix-wave-1 L1 · `x.ts:1`")).toBe("cross-family");
  expect(subjectVerdict("w6 :157", "**Where:** cb-v-fix-wave-1 L1 · `x.ts:1`")).toBe("unkeyed");
  expect(subjectVerdict("cb-v-fix-wave-1 L1", "a thematic row that declares no subject")).toBe("undeclared");
  // A citing row with no wave column of its own still cannot be judged against a declaring row.
  expect(subjectVerdict(undefined, L5_BODY)).toBe("unkeyed");
});
