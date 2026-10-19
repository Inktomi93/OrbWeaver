// Every @orb/ui primitive keeps its file trio, one correctly named variants export, a data-slot locator and a
// co-located CT (UI-Primitives-and-Reuse §13.7). The checks run over the real tree; planted trees prove they bite.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { LEGACY_TEST_ROOT } from "@orb/tooling/floor/testing/test-population";
import ts from "typescript";

const PRIMITIVES = "packages/ui/src/primitives";

interface Site {
  readonly kind: "missing-file" | "variants-count" | "variants-name" | "no-data-slot" | "no-ct";
  readonly detail: string;
}

// Sealed satellites with no skin of their own (§13.7). Each entry must still fail the shape contract, or it is stale.
const SKINLESS = {
  "aria-announcer": "The headless announcer owns accessibility behavior without visual styling.",
  "file-trigger": "The headless file trigger delegates its rendered trigger and styling to the caller.",
  icons: "The lucide export barrel has no styled primitive body.",
  "message-list": "The virtual message wrapper delegates row styling to the caller renderItem.",
  "virtual-list": "The virtual wrapper delegates row styling to the caller renderItem.",
} as const satisfies Record<string, string>;
// The icon satellite is nonvisual, so it owes no co-located CT.
const CT_EXEMPT = { icons: "The nonvisual satellite is exempt from the styled-primitive co-located CT obligation." } as const satisfies Record<string, string>;

const camelCase = (kebab: string): string => kebab.replace(/-(?<letter>[a-z])/gu, (_match, letter: string) => letter.toUpperCase());
const parse = (source: string): ts.SourceFile => ts.createSourceFile("probe.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** Code, not comments: a locator named only in a comment declares nothing. */
function declaresLocator(source: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    const text = ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateLiteralToken(node) ? node.text : "";
    found ||= text.includes("data-slot");
    ts.forEachChild(node, visit);
  };
  visit(parse(source));
  return found;
}

/** The literal `tv(...)` consts a variants module exports; an inferred alias is not a variants constructor. */
function tvExports(source: string): readonly string[] {
  return parse(source).statements.flatMap((statement) =>
    ts.isVariableStatement(statement) && statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) === true
      ? statement.declarationList.declarations.flatMap((declaration) =>
          declaration.initializer !== undefined &&
          ts.isCallExpression(declaration.initializer) &&
          declaration.initializer.expression.getText() === "tv" &&
          ts.isIdentifier(declaration.name)
            ? [declaration.name.text]
            : [],
        )
      : [],
  );
}

function primitiveNames(root: string): readonly string[] {
  return readdirSync(join(root, PRIMITIVES), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .toSorted();
}

function shapeSites(root: string, name: string): readonly Site[] {
  const dir = join(root, PRIMITIVES, name);
  const sites: Site[] = [];
  for (const required of [`${name}.tsx`, "index.ts", "variants.ts"]) {
    if (!existsSync(join(dir, required))) {
      sites.push({ kind: "missing-file", detail: required });
    }
  }
  if (existsSync(join(dir, "variants.ts"))) {
    const exported = tvExports(readFileSync(join(dir, "variants.ts"), "utf8"));
    const expected = `${camelCase(name)}Variants`;
    if (exported.length !== 1) {
      sites.push({ kind: "variants-count", detail: `${String(exported.length)} tv() exports` });
    } else if (exported[0] !== expected) {
      sites.push({ kind: "variants-name", detail: `${exported[0] ?? ""} should be ${expected}` });
    }
  }
  if (existsSync(join(dir, `${name}.tsx`)) && !declaresLocator(readFileSync(join(dir, `${name}.tsx`), "utf8"))) {
    sites.push({ kind: "no-data-slot", detail: `${name}.tsx` });
  }
  return sites;
}

function ctSites(root: string, name: string): readonly Site[] {
  const ct = `ui/primitives/${name}/${name}.ct.tsx`;
  // A legacy CT still proves the primitive until its rebuilt CT lands at the mirror path.
  return [`tests/${ct}`, `${LEGACY_TEST_ROOT}/${ct}`].some((path) => existsSync(join(root, path))) ? [] : [{ kind: "no-ct", detail: ct }];
}

function plant(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "ui-topology-"));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

const THING = {
  "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;',
  "packages/ui/src/primitives/thing/index.ts": 'export {Thing} from "./thing";',
  "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({base: "block"});',
  "tests/ui/primitives/thing/thing.ct.tsx": "export const proof = true;",
} satisfies Record<string, string>;

function without(key: keyof typeof THING): Record<string, string> {
  return Object.fromEntries(Object.entries(THING).filter(([path]) => path !== key));
}

const planted: readonly (readonly [name: string, files: Record<string, string>, shape: readonly Site[], ct: readonly Site[]])[] = [
  ["complete topology and CT ownership", THING, [], []],
  [
    "a styled primitive missing its variants file",
    without("packages/ui/src/primitives/thing/variants.ts"),
    [{ kind: "missing-file", detail: "variants.ts" }],
    [],
  ],
  ["a primitive missing its index", without("packages/ui/src/primitives/thing/index.ts"), [{ kind: "missing-file", detail: "index.ts" }], []],
  ["a primitive missing its component", without("packages/ui/src/primitives/thing/thing.tsx"), [{ kind: "missing-file", detail: "thing.tsx" }], []],
  ["a primitive missing its CT", without("tests/ui/primitives/thing/thing.ct.tsx"), [], [{ kind: "no-ct", detail: "ui/primitives/thing/thing.ct.tsx" }]],
  [
    "a legacy CT twin still owns the primitive",
    { ...without("tests/ui/primitives/thing/thing.ct.tsx"), [`${LEGACY_TEST_ROOT}/ui/primitives/thing/thing.ct.tsx`]: "export const proof = true;" },
    [],
    [],
  ],
  [
    "two tv exports",
    { ...THING, "packages/ui/src/primitives/thing/variants.ts": "export const thingVariants = tv({});export const extraVariants = tv({});" },
    [{ kind: "variants-count", detail: "2 tv() exports" }],
    [],
  ],
  [
    "a variants constructor under the wrong name",
    { ...THING, "packages/ui/src/primitives/thing/variants.ts": "export const thingStyles = tv({});" },
    [{ kind: "variants-name", detail: "thingStyles should be thingVariants" }],
    [],
  ],
  [
    "an aliased constructor is not a literal tv export",
    { ...THING, "packages/ui/src/primitives/thing/variants.ts": "const make = tv;export const thingVariants = make({});" },
    [{ kind: "variants-count", detail: "0 tv() exports" }],
    [],
  ],
  [
    "an unexported tv const is not the export",
    { ...THING, "packages/ui/src/primitives/thing/variants.ts": "const thingVariants = tv({});export {};" },
    [{ kind: "variants-count", detail: "0 tv() exports" }],
    [],
  ],
  [
    "a non-tv export beside the tv export is allowed",
    { ...THING, "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({});export const SIZES = ["a"] as const;' },
    [],
    [],
  ],
  [
    "a locator named only in a comment",
    { ...THING, "packages/ui/src/primitives/thing/thing.tsx": "// data-slot\nexport const Thing = () => <div />;" },
    [{ kind: "no-data-slot", detail: "thing.tsx" }],
    [],
  ],
  [
    "a locator declared through an object key",
    { ...THING, "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div {...{ "data-slot": "thing" }} />;' },
    [],
    [],
  ],
];

test.for(planted)("topology control: $0", ([, files, shape, ct]) => {
  const root = plant(files);
  try {
    expect(shapeSites(root, "thing")).toEqual(shape);
    expect(ctSites(root, "thing")).toEqual(ct);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a kebab-case name takes a camelCase variants constant", () => {
  const root = plant({
    "packages/ui/src/primitives/two-words/two-words.tsx": 'export const A = () => <i data-slot="a" />;',
    "packages/ui/src/primitives/two-words/index.ts": "export {};",
    "packages/ui/src/primitives/two-words/variants.ts": "export const twoWordsVariants = tv({});",
  });
  try {
    expect(shapeSites(root, "two-words")).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every real primitive keeps the shape contract", ({ repoRoot }) => {
  const names = primitiveNames(repoRoot);
  expect(names.length).toBeGreaterThan(0);
  const failures = names.flatMap((name) => (name in SKINLESS ? [] : shapeSites(repoRoot, name).map((site) => `${name}: ${site.kind} ${site.detail}`)));
  expect(failures).toEqual([]);
});

test("every real primitive owns a co-located CT", ({ repoRoot }) => {
  const failures = primitiveNames(repoRoot).flatMap((name) => (name in CT_EXEMPT ? [] : ctSites(repoRoot, name).map((site) => `${name}: ${site.detail}`)));
  expect(failures).toEqual([]);
});

test("a skinless or CT-exempt primitive still exists and still needs its exemption", ({ repoRoot }) => {
  const names = new Set(primitiveNames(repoRoot));
  for (const name of Object.keys(SKINLESS)) {
    expect(names.has(name), `${name} is exempt but gone`).toBe(true);
    expect(shapeSites(repoRoot, name), `${name} satisfies the shape contract; drop its exemption`).not.toEqual([]);
  }
  for (const name of Object.keys(CT_EXEMPT)) {
    expect(names.has(name), `${name} is exempt but gone`).toBe(true);
    expect(ctSites(repoRoot, name), `${name} owns a CT; drop its exemption`).not.toEqual([]);
  }
});
