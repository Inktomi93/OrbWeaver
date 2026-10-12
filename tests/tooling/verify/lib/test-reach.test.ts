// The reach walk's edge shapes that no `test-reach` proof row can carry: a CT through its story module, mocks that
// must not count, a type-only helper edge, a namespace member, and a helper that re-exports a product module.
import { Project } from "ts-morph";
import { testReach } from "../../../../tooling/src/verify/lib/test-reach.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/repo";
const COMPONENT = "packages/client/src/features/chat/composer.tsx";
const STORE = "packages/client/src/state/drafts.ts";
const STORE_SOURCE = "export const saveDraft = (): number => 1;\nexport const clearDraft = (): number => 2;\n";

function reach(files: Readonly<Record<string, string>>, subjects: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4, allowImportingTsExtensions: true, noEmit: true } });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  const subjectSet = new Set(subjects);
  return testReach({
    files: project.getSourceFiles(),
    relativePath: (file) => file.getFilePath().slice(ROOT.length + 1),
    checker: project.getTypeChecker(),
    isSubject: (path) => subjectSet.has(path),
  }).reachedBy;
}

test("a CT reaches the component its story module mounts, under the component family", () => {
  const reached = reach(
    {
      [COMPONENT]: "export function Composer(): null {\n  return null;\n}\n",
      "tests/client/features/chat/_ct-stories.tsx":
        'import { Composer } from "../../../../packages/client/src/features/chat/composer.tsx";\nexport function ComposerStory(): null {\n  return <Composer />;\n}\n',
      "tests/client/features/chat/composing.ct.tsx": 'import { ComposerStory } from "./_ct-stories.tsx";\nexport const story = ComposerStory;\n',
    },
    [COMPONENT],
  );

  expect([...(reached.get(COMPONENT) ?? [])]).toEqual(["component"]);
});

// Spine-Testing §3 bans mocking an internal module, so a mock is never reach: neither the bare specifier nor a binding
// imported from a module the same file replaces. The control imports the same export unmocked.
test("a mocked module is not reached, by its mock call or by a binding imported from it", () => {
  const importing = 'import { saveDraft } from "../../../packages/client/src/state/drafts.ts";\nexport const saved = saveDraft();\n';
  const bare = reach(
    { [STORE]: STORE_SOURCE, "tests/client/state/draft-mocking.test.ts": 'import { vi } from "vitest";\nvi.mock("#client/state/drafts.ts");\n' },
    [STORE],
  );
  const faked = reach(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/draft-mocking.test.ts": `import { vi } from "vitest";\n${importing}vi.mock("../../../packages/client/src/state/drafts.ts", () => ({ saveDraft: () => 0 }));\n`,
    },
    [STORE],
  );
  const real = reach({ [STORE]: STORE_SOURCE, "tests/client/state/drafts.test.ts": importing }, [STORE]);

  expect(bare.has(STORE)).toBe(false);
  expect(faked.has(STORE)).toBe(false);
  expect([...(real.get(STORE) ?? [])]).toEqual(["unit"]);
});

// A type-only edge to a helper carries no runtime reach, so the helper's own references never reach the test.
test("a type-only import of a helper does not carry the helper's reach", () => {
  const helper =
    'import { clearDraft } from "../../../packages/client/src/state/drafts.ts";\nexport const harness = { clear: clearDraft };\nexport type Harness = typeof harness;\n';
  const typed = reach(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/_support.ts": helper,
      "tests/client/state/clearing.test.ts": 'import type { Harness } from "./_support.ts";\nexport const shape: Harness | null = null;\n',
    },
    [STORE],
  );
  const valued = reach(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/_support.ts": helper,
      "tests/client/state/clearing.test.ts": 'import { harness } from "./_support.ts";\nexport const cleared = harness.clear();\n',
    },
    [STORE],
  );

  expect(typed.has(STORE)).toBe(false);
  expect([...(valued.get(STORE) ?? [])]).toEqual(["unit"]);
});

test("a namespace import reaches only through a member it reads", () => {
  const reading = reach(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/drafts.test.ts":
        'import * as drafts from "../../../packages/client/src/state/drafts.ts";\nexport const saved = drafts.saveDraft();\n',
    },
    [STORE],
  );
  const idle = reach(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/drafts.test.ts": 'import * as drafts from "../../../packages/client/src/state/drafts.ts";\nexport const named = typeof drafts;\n',
    },
    [STORE],
  );

  expect(reading.has(STORE)).toBe(true);
  expect(idle.has(STORE)).toBe(false);
});

function called(files: Readonly<Record<string, string>>, asked: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4, allowImportingTsExtensions: true, noEmit: true } });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  const result = testReach({
    files: project.getSourceFiles(),
    relativePath: (file) => file.getFilePath().slice(ROOT.length + 1),
    checker: project.getTypeChecker(),
    isSubject: (path) => path === STORE,
    calls: new Map([[STORE, new Set(asked)]]),
  });
  return result.calledBy.get(STORE) ?? new Map();
}

// A call is the unit a store action is driven by: an import that is only read, a commented or quoted call, a call of a
// same-named local and a call through a mocked module are not. The renamed import, the namespace member and the barrel are.
test("an action counts as called only when a test calls the binding it imports", { timeout: scaledBudget(15_000) }, () => {
  const importing = (body: string): Record<string, string> => ({
    [STORE]: STORE_SOURCE,
    "tests/client/state/drafts.test.ts": `import { saveDraft as save, clearDraft } from "../../../packages/client/src/state/drafts.ts";\n${body}\n`,
  });

  expect([...called(importing("export const a = save();"), ["saveDraft", "clearDraft"]).keys()]).toEqual(["saveDraft"]);
  expect(called(importing("export const a = [save, clearDraft];"), ["saveDraft", "clearDraft"]).size).toBe(0);
  expect(called(importing('// save();\nexport const a = "clearDraft()";'), ["saveDraft", "clearDraft"]).size).toBe(0);
  expect(called(importing("export const a = save<number>();"), ["saveDraft"]).has("saveDraft")).toBe(true);
  expect(called(importing("export const a = ((save: () => number) => save())(() => 1);"), ["saveDraft"]).size).toBe(0);
});

test("an action is called through a namespace member or a barrel, and not through a mocked module", () => {
  const barrel = { "packages/client/src/state/index.ts": 'export { saveDraft, clearDraft } from "./drafts.ts";\n' };
  const namespace = called(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/drafts.test.ts":
        'import * as drafts from "../../../packages/client/src/state/drafts.ts";\nexport const a = drafts.saveDraft();\nexport const b = drafts.clearDraft;\n',
    },
    ["saveDraft", "clearDraft"],
  );
  const viaBarrel = called(
    {
      [STORE]: STORE_SOURCE,
      ...barrel,
      "tests/client/state/drafts.test.ts": 'import { saveDraft } from "../../../packages/client/src/state/index.ts";\nexport const a = saveDraft();\n',
    },
    ["saveDraft"],
  );
  const mocked = called(
    {
      [STORE]: STORE_SOURCE,
      ...barrel,
      "tests/client/state/drafts.test.ts":
        'import { vi } from "vitest";\nimport { saveDraft } from "../../../packages/client/src/state/index.ts";\nvi.mock("../../../packages/client/src/state/drafts.ts");\nexport const a = saveDraft();\n',
    },
    ["saveDraft"],
  );

  expect([...namespace.keys()]).toEqual(["saveDraft"]);
  expect([...(viaBarrel.get("saveDraft") ?? [])]).toEqual(["unit"]);
  expect(mocked.size).toBe(0);
});

test("a member call counts through a dynamically imported module's type, and a same-named object method does not", () => {
  const dynamic = called(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/drafts.test.ts":
        'export async function run(): Promise<number> {\n  const drafts = await import("../../../packages/client/src/state/drafts.ts");\n  return drafts.saveDraft();\n}\n',
    },
    ["saveDraft"],
  );
  const method = called(
    {
      [STORE]: `${STORE_SOURCE}export const api = { saveDraft: (): number => 3 };\n`,
      "tests/client/state/drafts.test.ts": 'import { api } from "../../../packages/client/src/state/drafts.ts";\nexport const a = api.saveDraft();\n',
    },
    ["saveDraft"],
  );

  expect([...dynamic.keys()]).toEqual(["saveDraft"]);
  expect(method.size).toBe(0);
});

const STATE = "../../../packages/client/src/state";
const STATE_BARREL = { "packages/client/src/state/index.ts": 'export { saveDraft, clearDraft } from "./drafts.ts";\n' };

// A call through anything the file replaces is a fake: a binding imported from a mocked barrel (by name or by namespace),
// and a local object merely typed as the module. The controls mock a different module, or import the module for real.
test("a call is not credited when its binding is imported from a mocked barrel or is a local object typed as the module", {
  timeout: scaledBudget(15_000),
}, () => {
  const mockBarrel = `import { vi } from "vitest";\nvi.mock("${STATE}/index.ts");\n`;
  const named = called(
    {
      [STORE]: STORE_SOURCE,
      ...STATE_BARREL,
      "tests/client/state/drafts.test.ts": `${mockBarrel}import { saveDraft } from "${STATE}/index.ts";\nexport const a = saveDraft();\n`,
    },
    ["saveDraft"],
  );
  const namespace = called(
    {
      [STORE]: STORE_SOURCE,
      ...STATE_BARREL,
      "tests/client/state/drafts.test.ts": `${mockBarrel}import * as s from "${STATE}/index.ts";\nexport const a = s.saveDraft();\n`,
    },
    ["saveDraft"],
  );
  const fake = called(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/drafts.test.ts": `const fake: typeof import("${STATE}/drafts.ts") = { saveDraft: () => 1, clearDraft: () => 2 };\nexport const a = fake.saveDraft();\n`,
    },
    ["saveDraft"],
  );
  const other = {
    "packages/client/src/state/other.ts": "export const other = (): number => 3;\n",
    "tests/client/state/drafts.test.ts": `import { vi } from "vitest";\nvi.mock("${STATE}/other.ts");\nimport * as s from "${STATE}/index.ts";\nexport const a = s.saveDraft();\n`,
  };
  const control = called({ [STORE]: STORE_SOURCE, ...STATE_BARREL, ...other }, ["saveDraft"]);

  expect(named.size).toBe(0);
  expect(namespace.size).toBe(0);
  expect(fake.size).toBe(0);
  expect([...control.keys()]).toEqual(["saveDraft"]);
});

// Vitest types `vi.mock(import("x"))`, so the import() argument names the mocked module as a string does.
test("a module mocked through an import() argument is not reached and not called", () => {
  const importing = `import { saveDraft } from "${STATE}/drafts.ts";\nexport const saved = saveDraft();\n`;
  const files = (mock: string): Record<string, string> => ({
    [STORE]: STORE_SOURCE,
    "packages/client/src/state/other.ts": "export const other = (): number => 3;\n",
    "tests/client/state/drafts.test.ts": `import { vi } from "vitest";\n${importing}${mock}\n`,
  });
  const faked = files(`vi.mock(import("${STATE}/drafts.ts"), () => ({ saveDraft: () => 0 }));`);
  const doMocked = files(`vi.doMock(import("${STATE}/drafts.ts"));`);
  const unrelated = files(`vi.mock(import("${STATE}/other.ts"));`);

  expect(reach(faked, [STORE]).has(STORE)).toBe(false);
  expect(reach(doMocked, [STORE]).has(STORE)).toBe(false);
  expect(called(faked, ["saveDraft"]).size).toBe(0);
  expect(reach(unrelated, [STORE]).has(STORE)).toBe(true);
  expect(called(unrelated, ["saveDraft"]).has("saveDraft")).toBe(true);
});

test("a helper that re-exports a product export carries reach to the test that imports it", () => {
  const reached = reach(
    {
      [STORE]: STORE_SOURCE,
      "tests/client/state/_support.ts": 'export { clearDraft } from "../../../packages/client/src/state/drafts.ts";\n',
      "tests/client/state/clearing.test.ts": 'import { clearDraft } from "./_support.ts";\nexport const cleared = clearDraft();\n',
    },
    [STORE],
  );

  expect([...(reached.get(STORE) ?? [])]).toEqual(["unit"]);
});
