// The reach walk's edge shapes that no `test-reach` proof row can carry: a CT through its story module, mocks that
// must not count, a type-only helper edge, a namespace member, and a helper that re-exports a product module.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { testReach } from "../../../../tooling/src/verify/lib/test-reach.ts";

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
