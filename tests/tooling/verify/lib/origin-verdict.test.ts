// The refusal classifier and its mandatory companion, the candidate-name prefilter.
//
// `classifyOriginRefusal` owns the two meanings of a reader's refusal; `referenceNamesExport` owns the
// question asked BEFORE it, because fail-closed reporting over an unprefiltered node population turns every
// unreadable node into an accusation (measured: nineteen false findings in one #1584 pass). The prefilter
// follows an import alias and immutable CONST-ALIAS hops, and this file pins the two properties a reader of
// that walk cannot see from its JSDoc: a REASSIGNABLE binding stops the hop, and an alias CYCLE terminates
// through the visited set instead of recursing forever.
import { Project, SyntaxKind } from "ts-morph";
import { bindsProvenNonModuleDeclaration, classifyOriginRefusal, referenceNamesExport } from "../../../../tooling/src/verify/lib/origin-verdict.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

/** The callee of the LAST `new` in `use.ts` — the exact node a constructor-arm prefilter is handed. */
function constructedCallee(files: Readonly<Record<string, string>>): import("ts-morph").Node {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const news = project.getSourceFileOrThrow(`${ROOT}/use.ts`).getDescendantsOfKind(SyntaxKind.NewExpression);
  const last = news.at(-1);
  if (last === undefined) {
    throw new Error("no new expression in use.ts");
  }
  return last.getExpression();
}

test("the prefilter names an export through its own text, an import ALIAS, and immutable const hops", () => {
  // @orb-waive test-determinism(new Date): FIXTURE SOURCE for the constructed-callee arm — parsed by ts-morph, never evaluated.
  expect(referenceNamesExport(constructedCallee({ "use.ts": "export const d = new Date();\n" }), "Date")).toBe(true);
  expect(referenceNamesExport(constructedCallee({ "use.ts": "const D = Date;\nexport const d = new D();\n" }), "Date")).toBe(true);
  expect(referenceNamesExport(constructedCallee({ "use.ts": "const A = Date;\nconst B = A;\nexport const d = new B();\n" }), "Date")).toBe(true);
  expect(
    referenceNamesExport(
      constructedCallee({
        "events.ts": "export class EventEmitter {}\n",
        "use.ts": 'import { EventEmitter as EE } from "./events.ts";\nexport const b = new EE();\n',
      }),
      "EventEmitter",
    ),
  ).toBe(true);
});

test("a REASSIGNABLE binding stops the hop — the declared limit, bounded in practice by biome's useConst", () => {
  const callee = constructedCallee({ "use.ts": "let D = Date;\nD = Date;\nexport const d = new D();\n" });
  expect(referenceNamesExport(callee, "Date")).toBe(false);
  // And the reason it is SAFE to stop: a reassignable binding is not one identity, so following it would
  // claim an origin the reader cannot prove. The policy's own row states the same limit.
});

test("an alias CYCLE terminates through the visited set — no throw, no stack overflow, a plain false", () => {
  const mutual = constructedCallee({ "use.ts": "const a = b;\nconst b = a;\nexport const d = new a();\n" });
  expect(() => referenceNamesExport(mutual, "Date")).not.toThrow();
  expect(referenceNamesExport(mutual, "Date")).toBe(false);

  const self = constructedCallee({ "use.ts": "const a = a;\nexport const d = new a();\n" });
  expect(() => referenceNamesExport(self, "Date")).not.toThrow();
  expect(referenceNamesExport(self, "Date")).toBe(false);
});

/** The initializer of the named variable — the exact expression a policy's prefilter is handed. */
function initializerOf(source: string, name: string): import("ts-morph").Node {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(`${ROOT}/use.ts`, source);
  const initializer = file.getVariableDeclarationOrThrow(name).getInitializer();
  if (initializer === undefined) {
    throw new Error(`${name} has no initializer`);
  }
  return initializer;
}

test("a member read is named by its PROPERTY, in every spelling, and never by its receiver", () => {
  const source = 'export const dotted = Date.now;\nexport const bracket = Date["now"];\nexport const viaGlobal = globalThis.Date;\n';
  expect(referenceNamesExport(initializerOf(source, "dotted"), "now")).toBe(true);
  expect(referenceNamesExport(initializerOf(source, "bracket"), "now")).toBe(true);
  // The RECEIVER never names the member read: `Date.now` is a `now` candidate, not a `Date` one.
  expect(referenceNamesExport(initializerOf(source, "dotted"), "Date")).toBe(false);
  expect(referenceNamesExport(initializerOf(source, "viaGlobal"), "Date")).toBe(true);
});

test("the classifier separates a PROVEN other binding from an unreadable one — the fail-closed boundary", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    `${ROOT}/use.ts`,
    'import { missing } from "./nowhere.ts";\nfunction local(): void {}\nexport const a = missing;\nexport const b = local;\n',
  );
  const importedUse = file.getVariableDeclarationOrThrow("a").getInitializerOrThrow();
  const localUse = file.getVariableDeclarationOrThrow("b").getInitializerOrThrow();

  // A local function declaration proves a DIFFERENT identity; an import door with no reachable target does
  // not, and only the second may be reported.
  expect(bindsProvenNonModuleDeclaration(localUse)).toBe(true);
  expect(classifyOriginRefusal("missing", localUse)).toBe("other");
  expect(bindsProvenNonModuleDeclaration(importedUse)).toBe(false);
  expect(classifyOriginRefusal("missing", importedUse)).toBe("unreadable");
  // `write`/`cycle`/`ambiguous` are unreadable UNCONDITIONALLY: a written binding declares locally AND still
  // holds the banned identity.
  expect(classifyOriginRefusal("write", localUse)).toBe("unreadable");
});
