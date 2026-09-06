// The role-comparison reader is ARMED on both halves. The SYNTAX half normalizes operand order, the bracket
// spelling and a const-aliased literal into one comparison fact (a literal-text match reads none of the
// three). The AXIS half answers by the read's own TYPE, which is what separates the participant role from
// the message-row role and from a StreamAuthority tier that merely shares a lexeme — the distinction a
// hardcoded literal set structurally cannot make. The HOME half refuses a vocabulary declared anywhere but
// its own module, so a same-named tuple elsewhere is never adopted.
import { Project, SyntaxKind } from "ts-morph";
import type { TupleVocabularyFact } from "../../../../tooling/src/verify/contract/tuple-vocabulary-fact.ts";
import { readAxisVerdict, readRoleComparison, vocabularyAtHome, vocabularyMembers } from "../../../../tooling/src/verify/lib/role-vocabulary.ts";
import { createTupleVocabularyFacts, TUPLE_VOCABULARY_VISITOR_KINDS } from "../../../../tooling/src/verify/lib/tuple-vocabulary-fact.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const HOME = "packages/contracts/src/identity/index.ts";
const VOCABULARY = 'export const PARTICIPANT_ROLES = ["host", "member"] as const;\nexport type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];\n';
const PARTICIPANT = new Set(["host", "member"]);

function comparisonsIn(files: Readonly<Record<string, string>>, path: string): readonly import("ts-morph").Node[] {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [file, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${file}`, source);
  }
  return project.getSourceFileOrThrow(`${ROOT}/${path}`).getDescendantsOfKind(SyntaxKind.BinaryExpression);
}

function readOne(source: string): ReturnType<typeof readRoleComparison> {
  const [first] = comparisonsIn({ [HOME]: VOCABULARY, "use.ts": source }, "use.ts").flatMap((node) => {
    const comparison = readRoleComparison(node);
    return comparison === undefined ? [] : [comparison];
  });
  return first;
}

test("operand order, the bracket spelling and a const-aliased literal are ONE comparison fact", () => {
  expect(readOne('export const a = (r: { role: string }): boolean => r.role === "host";\n')).toMatchObject({ value: "host" });
  expect(readOne('export const b = (r: { role: string }): boolean => "host" === r.role;\n')).toMatchObject({ value: "host" });
  expect(readOne('export const c = (r: { role: string }): boolean => r["role"] === "host";\n')).toMatchObject({ value: "host" });
  expect(readOne('const HOST = "host";\nexport const d = (r: { role: string }): boolean => r.role === HOST;\n')).toMatchObject({ value: "host" });
  expect(readOne('export const e = (r: { role: string }): boolean => r.role !== "member";\n')).toMatchObject({ value: "member" });
});

test("a non-equality operator and a non-`role` read are not comparisons at all", () => {
  expect(readOne('export const a = (r: { role: string }): boolean => r.role > "host";\n')).toBeUndefined();
  expect(readOne('export const b = (r: { kind: string }): boolean => r.kind === "host";\n')).toBeUndefined();
});

function verdictOf(source: string): ReturnType<typeof readAxisVerdict> {
  const comparison = readOne(source);
  expect(comparison).toBeDefined();
  return readAxisVerdict((comparison as NonNullable<typeof comparison>).read, PARTICIPANT);
}

test("the AXIS is the read's own TYPE — the distinction a hardcoded literal set cannot make", () => {
  expect(verdictOf('export const a = (r: { role: "host" | "member" }): boolean => r.role === "host";\n')).toBe("on-axis");

  // The message-row axis shares the property NAME and, for `user`, a lexeme with the global-role axis. It
  // omits a participant member, so it is PROVABLY another axis.
  expect(verdictOf('export const b = (m: { role: "system" | "user" | "assistant" }): boolean => m.role === "user";\n')).toBe("foreign");

  // A narrowed binding is the ONE declared narrowing: a proper subset is not a lattice comparison.
  expect(verdictOf('export const c = (r: { role: "host" }): boolean => r.role === "host";\n')).toBe("foreign");
});

test("an axis the checker cannot CLOSE is unreadable, never foreign — the fail-open the boolean verdict left", () => {
  // `string` is the shape the LEGACY hardcoded-literal readers bit; answering `foreign` here would make the
  // conversion a narrowing.
  expect(verdictOf('export const a = (r: { role: string }): boolean => r.role === "host";\n')).toBe("unreadable");
  expect(verdictOf('declare const r: any;\nexport const b = (): boolean => r.role === "host";\n')).toBe("unreadable");
  // A strict SUPERSET still carries the whole vocabulary: the axis plus something, not another axis.
  expect(verdictOf('export const c = (r: { role: "host" | "member" | "observer" }): boolean => r.role === "host";\n')).toBe("unreadable");
});

function vocabularyFrom(files: Readonly<Record<string, string>>, exportedName: string): TupleVocabularyFact {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [file, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${file}`, source);
  }
  const collector = createTupleVocabularyFacts();
  for (const file of project.getSourceFiles()) {
    for (const kind of TUPLE_VOCABULARY_VISITOR_KINDS) {
      for (const node of file.getDescendantsOfKind(kind)) {
        collector.visit(node);
      }
    }
  }
  return collector.read(exportedName);
}

test("a vocabulary is BOUND to its declaring module: the same tuple elsewhere refuses instead of being adopted", () => {
  const home = vocabularyAtHome(vocabularyFrom({ [HOME]: VOCABULARY }, "PARTICIPANT_ROLES"), "PARTICIPANT_ROLES", "/packages/contracts/src/identity/");
  expect(home.kind).toBe("resolved");
  expect([...vocabularyMembers(home)].toSorted()).toEqual(["host", "member"]);

  const relocated = vocabularyAtHome(
    vocabularyFrom({ "packages/server/src/domain/chat/roles.ts": VOCABULARY }, "PARTICIPANT_ROLES"),
    "PARTICIPANT_ROLES",
    "/packages/contracts/src/identity/",
  );
  expect(relocated).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
  expect(vocabularyMembers(relocated).size).toBe(0);
});

test("an ABSENT vocabulary yields an empty member set, which is what takes a consumer's receipt to zero", () => {
  const absent = vocabularyAtHome(
    vocabularyFrom({ [HOME]: "export const OTHER = 1;\n" }, "PARTICIPANT_ROLES"),
    "PARTICIPANT_ROLES",
    "/packages/contracts/src/identity/",
  );
  expect(absent.kind).toBe("absent");
  expect(vocabularyMembers(absent).size).toBe(0);
});
