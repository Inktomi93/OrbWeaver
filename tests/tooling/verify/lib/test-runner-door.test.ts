// The fixture doctrine asks which door a test NAMED, which canonical origin structurally cannot answer:
// both composed doors re-export the same vitest declaration. Both directions are planted — a runner
// package, a composed project door, a package door whose types resolve to a real node_modules file, and a
// `#`/relative door that resolves to nothing (UNRESOLVED, never absent).
import { Project, SyntaxKind } from "ts-morph";
import { readFixtureDoor, registersSnapshotSerializer } from "../../../../tooling/src/verify/lib/test-runner-door.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function specifierIn(project: Project, path: string): import("ts-morph").Node {
  return project.getSourceFileOrThrow(`${ROOT}/${path}`).getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
}

const PLAIN_DOOR = 'export { expect, test } from "vitest";\n';
const TOOL_DOOR =
  'import { expect, test as houseTest } from "./fixtures.ts";\nexport const test = houseTest;\nexport { expect } from "./fixtures.ts";\nexpect.addSnapshotSerializer({ serialize: () => "" });\n';

test("a runner package named directly is a RUNNER door", () => {
  const project = projectOf({ "tests/server/x.test.ts": 'import { test } from "vitest";\nexport const t = test;\n' });

  expect(readFixtureDoor(specifierIn(project, "tests/server/x.test.ts"))).toMatchObject({ kind: "runner", specifier: "vitest" });
});

test("a composed door in the repo is a PROJECT door, even though its export canonically comes from vitest", () => {
  const project = projectOf({
    "tests/support/fixtures.ts": PLAIN_DOOR,
    "tests/server/y.test.ts": 'import { test } from "../support/fixtures.ts";\nexport const t = test;\n',
  });
  const door = readFixtureDoor(specifierIn(project, "tests/server/y.test.ts"));

  // This is the whole reason the reader exists: canonical origin would answer "vitest" for BOTH composed
  // doors, so it cannot separate the plain door from the tool door.
  expect(door.kind).toBe("project");
  expect(door.kind === "project" ? door.sourceFile.getBaseName() : "").toBe("fixtures.ts");
});

test("a namespace member resolves to the same door as a named import", () => {
  const project = projectOf({ "tests/server/ns.test.ts": 'import * as runner from "vitest";\nexport const t = runner.test;\n' });
  const member = project.getSourceFileOrThrow(`${ROOT}/tests/server/ns.test.ts`).getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression);

  expect(readFixtureDoor(member)).toMatchObject({ kind: "runner", specifier: "vitest" });
});

test("a PACKAGE door whose types resolve to a real node_modules file is EXTERNAL, not a project door", () => {
  const project = projectOf({
    "node_modules/@playwright/experimental-ct-react/index.ts": "export declare const test: unknown;\nexport declare const expect: unknown;\n",
    "tests/tooling/overflow.ct.tsx": 'import { test } from "@playwright/experimental-ct-react";\nexport const t = test;\n',
  });

  // A typed workspace answers `getModuleSpecifierSourceFile()` with the package's shipped declarations.
  // Reading that as a composed project door made the tooling mirror demand a serializer registration from a
  // third-party runner — four false positives on the real tree.
  expect(readFixtureDoor(specifierIn(project, "tests/tooling/overflow.ct.tsx"))).toMatchObject({
    kind: "external",
    specifier: "@playwright/experimental-ct-react",
  });
});

test("a bare package name with no resolvable module is EXTERNAL — a third-party helper, not a broken door", () => {
  const project = projectOf({ "tests/tooling/third-party.test.ts": 'import { expect } from "chai";\nexport const e = expect;\n' });

  expect(readFixtureDoor(specifierIn(project, "tests/tooling/third-party.test.ts"))).toMatchObject({ kind: "external", specifier: "chai" });
});

test("a `#` subpath door that resolves to nothing is UNRESOLVED, never absent", () => {
  const project = projectOf({ "tests/tooling/subpath.test.ts": 'import { test } from "#support/fixtures";\nexport const t = test;\n' });
  const door = readFixtureDoor(specifierIn(project, "tests/tooling/subpath.test.ts"));

  // `#` is one of the repo's own internal door prefixes, so an unresolvable one is a BROKEN door and the
  // caller must fail closed on it — the opposite verdict from the bare-package row above.
  expect(door.kind).toBe("unresolved");
  expect(door.kind === "unresolved" ? door.detail : "").toContain("#support/fixtures");
});

test("a relative door that resolves to nothing is UNRESOLVED too", () => {
  const project = projectOf({ "tests/tooling/broken.test.ts": 'import { test } from "./missing-door.ts";\nexport const t = test;\n' });

  expect(readFixtureDoor(specifierIn(project, "tests/tooling/broken.test.ts")).kind).toBe("unresolved");
});

test("a node that is neither an import specifier nor a namespace read is UNRESOLVED, which is how a member read stays out of subject", () => {
  const project = projectOf({ "tests/kit/regex.test.ts": "export const matches = (pattern: RegExp, value: string): boolean => pattern.test(value);\n" });
  const member = project.getSourceFileOrThrow(`${ROOT}/tests/kit/regex.test.ts`).getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression);

  // `pattern.test(value)` spells one of the doctrine's three words on a receiver that is no namespace
  // import. Reading THIS refusal as fail-closed produced 89 false positives; the caller scopes fail-closure
  // to a declared import door instead.
  expect(readFixtureDoor(member).kind).toBe("unresolved");
});

test("the serializer registration separates the two composed doors, and it survives a rename", () => {
  const project = projectOf({
    "tests/support/fixtures.ts": PLAIN_DOOR,
    "tests/support/tool-fixtures.ts": TOOL_DOOR,
    "tests/support/renamed-tool-door.ts": TOOL_DOOR,
  });

  expect(registersSnapshotSerializer(project.getSourceFileOrThrow(`${ROOT}/tests/support/tool-fixtures.ts`))).toBe(true);
  expect(registersSnapshotSerializer(project.getSourceFileOrThrow(`${ROOT}/tests/support/renamed-tool-door.ts`))).toBe(true);
  expect(registersSnapshotSerializer(project.getSourceFileOrThrow(`${ROOT}/tests/support/fixtures.ts`))).toBe(false);
});
