// A seal is a claim about where a symbol is DECLARED. Both directions are planted: an alias, a namespace
// member and a name-preserving re-export of the sealed declaration are SEALED, a same-named export of
// another module is FOREIGN, and a door that resolves to nothing is UNRESOLVED rather than absent.
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { SealedHome } from "../../../../tooling/src/verify/lib/sealed-origin.ts";
import { originModuleSpecifier, readSealedOrigin } from "../../../../tooling/src/verify/lib/sealed-origin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const HOME: SealedHome = { pathInfix: "/packages/server/src/infra/providers/", exportedNames: new Set(["deriveRunner"]) };

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function specifierIn(project: Project, path: string): Node {
  return project.getSourceFileOrThrow(`${ROOT}/${path}`).getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
}

const SEALED_HOME_MODULE = "packages/server/src/infra/providers/roles/dispatch.ts";
const SEALED_SOURCE = "export function deriveRunner(api: string): string {\n  return api;\n}\n";

test("an alias of the sealed export is the same declaration", () => {
  const project = projectOf({
    [SEALED_HOME_MODULE]: SEALED_SOURCE,
    "packages/server/src/domain/chat/x.ts": 'import { deriveRunner as pick } from "../../infra/providers/roles/dispatch.ts";\nexport const r = pick;\n',
  });

  expect(readSealedOrigin(specifierIn(project, "packages/server/src/domain/chat/x.ts"), HOME)).toMatchObject({
    kind: "sealed",
    exportedName: "deriveRunner",
  });
});

test("a name-preserving re-export through a barrel is still the sealed declaration", () => {
  const project = projectOf({
    [SEALED_HOME_MODULE]: SEALED_SOURCE,
    "packages/server/src/infra/providers/index.ts": 'export { deriveRunner } from "./roles/dispatch.ts";\n',
    "packages/server/src/domain/chat/barrel.ts": 'import { deriveRunner } from "../../infra/providers/index.ts";\nexport const r = deriveRunner;\n',
  });

  expect(readSealedOrigin(specifierIn(project, "packages/server/src/domain/chat/barrel.ts"), HOME)).toMatchObject({ kind: "sealed" });
});

test("a namespace member of the sealed module resolves through the same reader", () => {
  const project = projectOf({
    [SEALED_HOME_MODULE]: SEALED_SOURCE,
    "packages/server/src/domain/chat/ns.ts":
      'import * as providers from "../../infra/providers/roles/dispatch.ts";\nexport const r = providers.deriveRunner("x");\n',
  });
  const member = project
    .getSourceFileOrThrow(`${ROOT}/packages/server/src/domain/chat/ns.ts`)
    .getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression);

  expect(readSealedOrigin(member, HOME)).toMatchObject({ kind: "sealed", exportedName: "deriveRunner" });
});

test("THE COUNTERFACTUAL — a same-named declaration OUTSIDE the sealed home is foreign", () => {
  const project = projectOf({
    [SEALED_HOME_MODULE]: SEALED_SOURCE,
    "packages/server/src/domain/chat/util/runner.ts": SEALED_SOURCE,
    "packages/server/src/domain/chat/foreign.ts": 'import { deriveRunner } from "./util/runner.ts";\nexport const r = deriveRunner;\n',
  });
  const verdict = readSealedOrigin(specifierIn(project, "packages/server/src/domain/chat/foreign.ts"), HOME);

  // Everything the reader keys on matches — the name, a clean resolution, an export that genuinely exists.
  // Only the declaration HOME separates the two, which is the whole claim a seal makes.
  expect(verdict.kind).toBe("foreign");
  expect(verdict.kind === "foreign" ? originModuleSpecifier(verdict.origin) : "").toBe("./util/runner.ts");
});

test("an export the home does not seal is foreign even from inside the home", () => {
  const project = projectOf({
    "packages/server/src/infra/providers/roles/dispatch.ts": "export function runRole(role: string): string {\n  return role;\n}\n",
    "packages/server/src/domain/chat/other.ts": 'import { runRole } from "../../infra/providers/roles/dispatch.ts";\nexport const r = runRole;\n',
  });

  expect(readSealedOrigin(specifierIn(project, "packages/server/src/domain/chat/other.ts"), HOME).kind).toBe("foreign");
});

test("a door that resolves to no module is UNRESOLVED, never absent", () => {
  const project = projectOf({
    "packages/server/src/domain/chat/broken.ts": 'import { deriveRunner } from "./missing-barrel.ts";\nexport const r = deriveRunner;\n',
  });
  const verdict = readSealedOrigin(specifierIn(project, "packages/server/src/domain/chat/broken.ts"), HOME);

  // The caller decides what to do with it; the reader's contract is that it never answers "not sealed".
  expect(verdict.kind).toBe("unresolved");
  expect(verdict.kind === "unresolved" ? verdict.fact.reason : "").toBe("missing");
});

test("originModuleSpecifier reports the external package for a door with no project source", () => {
  const project = projectOf({ "packages/server/src/domain/chat/pkg.ts": 'import { deriveRunner } from "some-package";\nexport const r = deriveRunner;\n' });
  const verdict = readSealedOrigin(specifierIn(project, "packages/server/src/domain/chat/pkg.ts"), HOME);

  expect(verdict.kind).toBe("foreign");
  expect(verdict.kind === "foreign" ? originModuleSpecifier(verdict.origin) : "").toBe("some-package");
});
