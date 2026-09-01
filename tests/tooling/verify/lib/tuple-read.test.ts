// tuple-read.ts (#942) — the narrow tuple-spread resolver's TWO-SIDED contract, made permanent. The
// escaping shape it was minted from is live: `CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]`, where a
// direct-element reader saw ONE of four zones while `no-parallel-section-map` reported a healthy file scan
// and `chrome-registry-completeness` rejected the legitimate `rail.brand` entry its copied list omitted.
// The permissive direction is the dangerous one here, so every unsupported composition shape must REFUSE
// loudly rather than yield a smaller set (GATE-AUTHORING.md §4.6 / §5).
import { Project } from "ts-morph";
import { readTupleVocabulary } from "../../../../tooling/src/verify/lib/tuple-read.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project;
}

function members(files: Readonly<Record<string, string>>, name: string): string[] {
  return [...readTupleVocabulary(projectOf(files), name).members];
}

test("an IMPORTED spread contributes its members, and the sources name both declarations", () => {
  const vocabulary = readTupleVocabulary(
    projectOf({
      "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;',
      "packages/client/src/state/chrome-registry.ts":
        'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;',
    }),
    "CHROME_ZONES",
  );
  // THE DEFECT: a direct-element reader returns exactly ["topbar.trail"] here — one member of four.
  expect([...vocabulary.members]).toEqual(["rail.nav", "rail.brand", "rail.end", "topbar.trail"]);
  expect(vocabulary.sources).toEqual(["packages/client/src/state/chrome-registry.ts#CHROME_ZONES", "packages/client/src/state/section-registry.ts#RAIL_ZONES"]);
});

test("a LOCAL spread and an `as const`-wrapped element both resolve", () => {
  expect(members({ "a.ts": 'const B = ["b"] as const;\nexport const Z = [...B, "z" as const] as const;' }, "Z")).toEqual(["b", "z"]);
});

test("an absent tuple is an EMPTY vocabulary with no sources — the caller owns the blindness question", () => {
  const vocabulary = readTupleVocabulary(projectOf({ "a.ts": "export const other = 1;" }), "Z");
  expect(vocabulary.members.size).toBe(0);
  expect(vocabulary.sources).toEqual([]);
});

test("a spread of a CALL refuses instead of dropping the members it cannot resolve", () => {
  expect(() => members({ "a.ts": 'export const Z = [...zones(), "x"] as const;' }, "Z")).toThrow(/unsupported spread/u);
});

test("a spread of an identifier nothing binds refuses", () => {
  expect(() => members({ "a.ts": 'export const Z = [...MISSING, "x"] as const;' }, "Z")).toThrow(/no local declaration or named import/u);
});

test("a composition cycle refuses instead of recursing", () => {
  expect(() => members({ "a.ts": "export const Z = [...Z2] as const;\nexport const Z2 = [...Z] as const;" }, "Z")).toThrow(/composition cycle/u);
});

test("a non-tuple source refuses — a `new Set([...])` vocabulary is not establishable here", () => {
  expect(() => members({ "a.ts": 'export const Z = new Set(["x"]);' }, "Z")).toThrow(/is not an array-literal tuple/u);
});

test("a spread that resolves to ZERO members refuses — an empty contribution is the silent-shrink shape", () => {
  expect(() => members({ "a.ts": "export const B = [] as const;\nexport const Z = [...B] as const;" }, "Z")).toThrow(/resolved to zero members/u);
});
