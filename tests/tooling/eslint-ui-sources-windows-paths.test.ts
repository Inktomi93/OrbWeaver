// The tree reads behind the ESLint config's computed inputs give the same answer under Windows path behavior as on
// POSIX. `node:path` switches to win32 for repo-relative paths while `windows.on` is set; an absolute root keeps the
// native form, so this box's filesystem still reads it. A Windows glob result is planted as file names carrying `\`,
// because tooling tests replace no filesystem module.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { vi } from "vitest";
import { componentTables, declaredVariants, listSlotSurfacePaths } from "../../tooling/src/eslint/index.ts";
import { loadUiSources } from "../../tooling/src/eslint/ui-classes/source.ts";

const windows = vi.hoisted(() => ({ on: false }));

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  const relativeOnly =
    (name: "basename" | "dirname" | "join" | "normalize") =>
    (...parts: string[]): string =>
      (windows.on && !parts.some((part) => actual.isAbsolute(part)) ? actual.win32 : actual)[name](...(parts as [string]));
  const shimmed = {
    ...actual,
    basename: relativeOnly("basename"),
    dirname: relativeOnly("dirname"),
    join: relativeOnly("join"),
    normalize: relativeOnly("normalize"),
  };
  return { ...shimmed, default: shimmed };
});

const ROOT = join(import.meta.dirname, "../..");

function underWindows<T>(read: () => T): T {
  windows.on = true;
  try {
    return read();
  } finally {
    windows.on = false;
  }
}

const recipeCount = (tables: ReturnType<typeof componentTables>): number => [...tables.values()].reduce((sum, door) => sum + door.size, 0);

// The POSIX answers, read once at import: each scan parses every client or ui source.
const POSIX_SURFACES = listSlotSurfacePaths(ROOT);
const POSIX_UI = loadUiSources(ROOT);
const POSIX_TABLES = componentTables(ROOT, POSIX_UI);
const POSIX_VARIANTS = declaredVariants(ROOT, POSIX_UI);

test("the list-slot files and the ui recipe tables read the same under Windows path behavior as on POSIX", () => {
  expect(underWindows(() => join("packages/ui", "./src/x.ts"))).toBe(String.raw`packages\ui\src\x.ts`);
  expect(POSIX_SURFACES.length).toBeGreaterThan(0);
  expect(recipeCount(POSIX_TABLES)).toBeGreaterThan(0);
  expect(POSIX_VARIANTS.carriers.size).toBeGreaterThan(0);

  expect(underWindows(() => listSlotSurfacePaths(ROOT))).toEqual(POSIX_SURFACES);
  const ui = underWindows(() => loadUiSources(ROOT));
  const tables = underWindows(() => componentTables(ROOT, ui));
  expect(recipeCount(tables)).toBe(recipeCount(POSIX_TABLES));
  expect([...tables.keys()]).toEqual([...POSIX_TABLES.keys()]);
  const variants = underWindows(() => declaredVariants(ROOT, ui));
  expect(variants.axes).toEqual(POSIX_VARIANTS.axes);
  expect(variants.carriers).toEqual(POSIX_VARIANTS.carriers);
});

test("a glob result spelled with `\\` still yields its list surface as a POSIX repository path", async ({ plantedTree }) => {
  const root = await plantedTree({
    [String.raw`packages/client/src/features\demo\lib\demo-section.tsx`]:
      'import { DemoListSurface } from "../surfaces/demo-list-surface.tsx";\nexport const DEMO_SECTION = { list: <DemoListSurface /> };\n',
    [String.raw`packages/client/src/features\demo\surfaces\demo-list-surface.tsx`]: "export function DemoListSurface() {\n  return <div />;\n}\n",
  });
  expect(underWindows(() => listSlotSurfacePaths(root))).toEqual(["packages/client/src/features/demo/surfaces/demo-list-surface.tsx"]);
});
