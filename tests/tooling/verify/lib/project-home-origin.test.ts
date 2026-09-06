// The file-grain home reader: a home is LOCATED in the delivered file list and MEASURED (an absent file is
// zero members, a renamed export is unresolved — both refuse at the policy's receipt), and a reference is
// judged by the canonical declaring FILE plus the canonical export name. Both directions are planted here:
// an alias, a namespace member and a name-preserving re-export are the HOME, while a same-named export of
// another module, a local declaration and an unreachable door are not.
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import {
  classifyPackageMemberOrigin,
  classifyProjectDirectoryOrigin,
  classifyProjectHomeOrigin,
  locateProjectHome,
  readPackageExportOrigin,
  readsAmbientGlobalPath,
} from "../../../../tooling/src/verify/lib/project-home-origin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const HOME_PATH = "packages/client/src/state/chat-stream.ts";
const HOME_SOURCE = "export const chatStream = {\n  push(): void {},\n};\n";
const HOME = { path: HOME_PATH, names: ["chatStream"] };
const STATE_DIR = "/packages/client/src/state/";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function filesOf(project: Project): readonly SourceFile[] {
  return project.getSourceFiles();
}

function relativePath(sourceFile: SourceFile): string {
  return sourceFile.getFilePath().replace(`${ROOT}/`, "");
}

function specifierIn(project: Project, path: string): Node {
  return project.getSourceFileOrThrow(`${ROOT}/${path}`).getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
}

function memberIn(project: Project, path: string): Node {
  return project.getSourceFileOrThrow(`${ROOT}/${path}`).getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression);
}

test("an aliased import of the home's export is the HOME", () => {
  const project = projectOf({
    [HOME_PATH]: HOME_SOURCE,
    "packages/client/src/features/x.ts": 'import { chatStream as stream } from "../state/chat-stream.ts";\nexport const s = stream;\n',
  });
  const home = locateProjectHome(filesOf(project), relativePath, HOME);

  expect(home).toMatchObject({ members: 1, unresolved: 0 });
  expect(classifyProjectHomeOrigin(specifierIn(project, "packages/client/src/features/x.ts"), home)).toBe("home");
});

test("a name-preserving re-export through a barrel still resolves to the home", () => {
  const project = projectOf({
    [HOME_PATH]: HOME_SOURCE,
    "packages/client/src/state/index.ts": 'export { chatStream } from "./chat-stream.ts";\n',
    "packages/client/src/features/x.ts": 'import { chatStream } from "../state/index.ts";\nexport const s = chatStream;\n',
  });
  const home = locateProjectHome(filesOf(project), relativePath, HOME);

  expect(classifyProjectHomeOrigin(specifierIn(project, "packages/client/src/features/x.ts"), home)).toBe("home");
});

test("a namespace member of the home module resolves through the same reader", () => {
  const project = projectOf({
    [HOME_PATH]: HOME_SOURCE,
    "packages/client/src/features/x.ts": 'import * as state from "../state/chat-stream.ts";\nexport const s = state.chatStream;\n',
  });
  const home = locateProjectHome(filesOf(project), relativePath, HOME);

  expect(classifyProjectHomeOrigin(memberIn(project, "packages/client/src/features/x.ts"), home)).toBe("home");
});

test("THE COUNTERFACTUAL: the same export name from another module is OTHER", () => {
  const project = projectOf({
    [HOME_PATH]: HOME_SOURCE,
    "packages/client/src/features/other-stream.ts": HOME_SOURCE,
    "packages/client/src/features/x.ts": 'import { chatStream } from "./other-stream.ts";\nexport const s = chatStream;\n',
  });
  const home = locateProjectHome(filesOf(project), relativePath, HOME);

  expect(classifyProjectHomeOrigin(specifierIn(project, "packages/client/src/features/x.ts"), home)).toBe("other");
});

test("a home whose file is absent resolves ZERO members, and every candidate reads unreadable", () => {
  const project = projectOf({
    "packages/client/src/features/x.ts": "const chatStream = {\n  push(): void {},\n};\nexport const s = chatStream.push;\n",
  });
  const home = locateProjectHome(filesOf(project), relativePath, HOME);

  expect(home).toMatchObject({ members: 0, unresolved: 0, sourceFile: undefined });
  // The policy's receipt refuses on `members === 0`; the reader says so rather than silently passing.
  expect(classifyProjectHomeOrigin(memberIn(project, "packages/client/src/features/x.ts"), home)).toBe("unreadable");
});

test("a home whose file EXISTS but no longer exports the name leaves the receipt unresolved", () => {
  const project = projectOf({ [HOME_PATH]: "export const chatSocket = {\n  push(): void {},\n};\n" });

  expect(locateProjectHome(filesOf(project), relativePath, HOME)).toMatchObject({ members: 0, unresolved: 1 });
});

test("the DIRECTORY reader admits the vocabulary declared under the home tree and nothing else", () => {
  const project = projectOf({
    "packages/client/src/state/active-chat-store.ts": 'export function useActiveChatId(): string {\n  return "x";\n}\n',
    "packages/client/src/features/local.ts": 'export function useActiveChatId(): string {\n  return "y";\n}\n',
    "packages/client/src/features/reader.ts":
      'import { useActiveChatId } from "../state/active-chat-store.ts";\nimport { useActiveChatId as local } from "./local.ts";\nexport const a = useActiveChatId;\nexport const b = local;\n',
  });
  const [shared, impostor] = project.getSourceFileOrThrow(`${ROOT}/packages/client/src/features/reader.ts`).getDescendantsOfKind(SyntaxKind.ImportSpecifier);
  const names = new Set(["useActiveChatId"]);

  expect(shared === undefined ? "missing" : classifyProjectDirectoryOrigin(shared, STATE_DIR, names)).toBe("home");
  expect(impostor === undefined ? "missing" : classifyProjectDirectoryOrigin(impostor, STATE_DIR, names)).toBe("other");
});

test("the PACKAGE-export reader keys on the canonical export, not the local spelling", () => {
  const project = projectOf({
    "node_modules/vendor-pkg/index.d.ts": "export declare function useForm(options?: unknown): unknown;\n",
    "node_modules/other-pkg/index.d.ts": "export declare function useForm(options?: unknown): unknown;\n",
    "packages/client/src/features/x.ts":
      'import { useForm as buildForm } from "vendor-pkg";\nimport { useForm } from "other-pkg";\nexport const a = buildForm;\nexport const b = useForm;\n',
  });
  const [aliased, foreign] = project.getSourceFileOrThrow(`${ROOT}/packages/client/src/features/x.ts`).getDescendantsOfKind(SyntaxKind.ImportSpecifier);
  const names = new Set(["useForm"]);

  expect(aliased === undefined ? "missing" : readPackageExportOrigin(aliased, ["vendor-pkg"], names)).toMatchObject({
    verdict: "home",
    exportedName: "useForm",
  });
  expect(foreign === undefined ? "missing" : readPackageExportOrigin(foreign, ["vendor-pkg"], names)).toMatchObject({ verdict: "other" });
});

test("the PACKAGE-member reader separates a vendor method from a project method of the same name", () => {
  const project = projectOf({
    "node_modules/vendor-pkg/index.d.ts":
      "export declare class Client {\n  setQueryData(key: unknown): void;\n}\nexport declare function useClient(): Client;\n",
    "packages/client/src/features/vendor.ts": 'import { useClient } from "vendor-pkg";\nexport const run = (): void => useClient().setQueryData("k");\n',
    "packages/client/src/features/local.ts":
      "interface LocalCache {\n  setQueryData(key: unknown): void;\n}\nexport const run = (cache: LocalCache): void => cache.setQueryData('k');\n",
  });

  expect(classifyPackageMemberOrigin(memberIn(project, "packages/client/src/features/vendor.ts"), ["vendor-pkg"])).toBe("home");
  expect(classifyPackageMemberOrigin(memberIn(project, "packages/client/src/features/local.ts"), ["vendor-pkg"])).toBe("other");
});

test("THE CAST AXIS: a cast cannot hide the member's package home, because the RECEIVER is still the vendor's", () => {
  const project = projectOf({
    "node_modules/vendor-pkg/index.d.ts":
      "export declare class Client {\n  setQueryData(key: unknown): void;\n}\nexport declare function useClient(): Client;\n",
    "packages/client/src/features/inline-cast.ts":
      'import { useClient } from "vendor-pkg";\nexport const run = (): void => (useClient() as { setQueryData(key: unknown): void }).setQueryData("k");\n',
    "packages/client/src/features/const-cast.ts":
      'import { useClient } from "vendor-pkg";\nconst raw = useClient();\nconst client = raw as unknown as { setQueryData(key: unknown): void };\nexport const run = (): void => client.setQueryData("k");\n',
  });

  // Both spellings PASSED before the receiver axis: the cast declares the method in its own type literal, so
  // the property-symbol reader answered "a proven different identity".
  expect(classifyPackageMemberOrigin(memberIn(project, "packages/client/src/features/inline-cast.ts"), ["vendor-pkg"])).toBe("home");
  expect(classifyPackageMemberOrigin(memberIn(project, "packages/client/src/features/const-cast.ts"), ["vendor-pkg"])).toBe("home");
});

test("THE CAST AXIS' LIMIT: a value with no real type behind the cast carries no evidence", () => {
  const project = projectOf({
    "node_modules/vendor-pkg/index.d.ts": "export declare class Client {\n  setQueryData(key: unknown): void;\n}\n",
    "packages/client/src/features/typeless.ts":
      'export const run = (raw: string): void => (JSON.parse(raw) as { setQueryData(key: unknown): void }).setQueryData("k");\n',
  });

  expect(classifyPackageMemberOrigin(memberIn(project, "packages/client/src/features/typeless.ts"), ["vendor-pkg"])).toBe("other");
});

test("THE AMBIENT CHAIN: a member path rooted in a cast `globalThis` is still the ambient api", () => {
  const project = projectOf({
    "packages/client/src/features/chain.ts":
      'const g = globalThis as { Intl: { DateTimeFormat: new (locale: string) => unknown } };\nexport const f = (): unknown => new g.Intl.DateTimeFormat("en");\n',
    "packages/client/src/features/project-root.ts":
      "const own = { Intl: { DateTimeFormat: class {} } };\nexport const f = (): unknown => new own.Intl.DateTimeFormat();\n",
  });
  const globals = new Set(["globalThis", "self", "window"]);
  const chain = project
    .getSourceFileOrThrow(`${ROOT}/packages/client/src/features/chain.ts`)
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .find((node) => node.getName() === "DateTimeFormat");
  const impostor = project
    .getSourceFileOrThrow(`${ROOT}/packages/client/src/features/project-root.ts`)
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .find((node) => node.getName() === "DateTimeFormat");

  expect(chain === undefined ? "missing" : readsAmbientGlobalPath(chain, globals, ["Intl", "DateTimeFormat"])).toBe(true);
  // THE COUNTERFACTUAL: the same member path rooted in a PROJECT object is not the ambient api.
  expect(impostor === undefined ? "missing" : readsAmbientGlobalPath(impostor, globals, ["Intl", "DateTimeFormat"])).toBe(false);
});

test("ARMED: comparing the home by NAME instead of by declaring file would admit the impostor", () => {
  // The identity-swap control. `classifyProjectHomeOrigin` compares the canonical SourceFile; the naive
  // reading below compares only the export name, which is what every legacy gate in this family did — and it
  // cannot tell the two modules apart. If the reader ever regresses to that comparison, the counterfactual
  // rows above stop failing, so this test states the difference directly.
  const project = projectOf({
    [HOME_PATH]: HOME_SOURCE,
    "packages/client/src/features/other-stream.ts": HOME_SOURCE,
    "packages/client/src/features/x.ts": 'import { chatStream } from "./other-stream.ts";\nexport const s = chatStream;\n',
  });
  const home = locateProjectHome(filesOf(project), relativePath, HOME);
  const specifier = specifierIn(project, "packages/client/src/features/x.ts");

  expect(classifyProjectHomeOrigin(specifier, home)).toBe("other");
  expect(specifier.getSymbol()?.getName()).toBe("chatStream");
});
