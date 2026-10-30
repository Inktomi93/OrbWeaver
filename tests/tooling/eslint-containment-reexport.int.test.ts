// The containment rules judge the symbol a JSX name is ultimately declared as, so a feature module that re-exports an
// `@orb/ui` modal root or layout primitive is no escape. A module that declares its own Container is a different symbol.
//
// Fixtures are real files under the production client glob, linted through the real `eslint.config.ts` with type
// information; the `@orb/ui` doors map to the repository sources so a declaration resolves to its true file.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint } from "eslint";

const SURFACE_RULE = "orb/surface-consumes-container";
const ANCHOR_RULE = "orb/anchor-provides-container";
const FEATURE = "packages/client/src/features/chat";
const DOORS = {
  "@orb/ui/dialog": "packages/ui/src/primitives/dialog/index.ts",
  "@orb/ui/alert-dialog": "packages/ui/src/primitives/alert-dialog/index.ts",
  "@orb/ui/layout": "packages/ui/src/layout/index.ts",
} as const;

const SHARED = {
  // Re-exports of the sealed doors, one of them renamed.
  [`${FEATURE}/components/reexports.tsx`]: [
    'export { Dialog } from "@orb/ui/dialog";',
    'export { AlertDialog as Confirm } from "@orb/ui/alert-dialog";',
    'export { Container, Stack } from "@orb/ui/layout";',
  ].join("\n"),
  // A module that declares its own symbols under the same names: no @orb/ui identity.
  [`${FEATURE}/components/own-names.tsx`]: [
    "export function Container({ children }: { readonly children?: unknown }) { return <div>{String(children)}</div>; }",
    "export function Dialog({ children }: { readonly children?: unknown }) { return <div>{String(children)}</div>; }",
  ].join("\n"),
} as const;

/** One fixture per case: the file, the rule it is judged by, and the findings it must draw. */
const CASES = {
  surfaceReexportedDialog: {
    path: `${FEATURE}/surfaces/reexported-dialog-surface.tsx`,
    rule: SURFACE_RULE,
    findings: 1,
    source: 'import { Dialog } from "../components/reexports.tsx";\nexport const S = () => <Dialog>x</Dialog>;\n',
  },
  surfaceReexportedRenamedAlertDialog: {
    path: `${FEATURE}/surfaces/reexported-confirm-surface.tsx`,
    rule: SURFACE_RULE,
    findings: 1,
    source: 'import { Confirm } from "../components/reexports.tsx";\nexport const S = () => <Confirm>x</Confirm>;\n',
  },
  surfaceReexportedContainer: {
    path: `${FEATURE}/surfaces/reexported-container-surface.tsx`,
    rule: SURFACE_RULE,
    findings: 1,
    source: 'import { Container } from "../components/reexports.tsx";\nexport const S = () => <Container>x</Container>;\n',
  },
  surfaceReexportedStackWithComputedContainer: {
    path: `${FEATURE}/surfaces/reexported-stack-surface.tsx`,
    rule: SURFACE_RULE,
    findings: 1,
    source:
      'import { Stack } from "../components/reexports.tsx";\nexport const S = ({ wide }: { readonly wide: boolean }) => <Stack container={wide}>x</Stack>;\n',
  },
  // Controls: the same names, declared by another module, are not the @orb/ui primitives.
  surfaceOwnContainer: {
    path: `${FEATURE}/surfaces/own-container-surface.tsx`,
    rule: SURFACE_RULE,
    findings: 0,
    source: 'import { Container } from "../components/own-names.tsx";\nexport const S = () => <Container>x</Container>;\n',
  },
  surfaceOwnDialog: {
    path: `${FEATURE}/surfaces/own-dialog-surface.tsx`,
    rule: SURFACE_RULE,
    findings: 0,
    source: 'import { Dialog } from "../components/own-names.tsx";\nexport const S = () => <Dialog>x</Dialog>;\n',
  },
  // An anchor that renders a re-exported Container provides containment; one rendering another module's Container does not.
  anchorReexportedContainer: {
    path: `${FEATURE}/anchors/reexported-container-anchor.tsx`,
    rule: ANCHOR_RULE,
    findings: 0,
    source: 'import { Container } from "../components/reexports.tsx";\nexport const A = () => <Container>x</Container>;\n',
  },
  anchorOwnContainer: {
    path: `${FEATURE}/anchors/own-container-anchor.tsx`,
    rule: ANCHOR_RULE,
    findings: 1,
    source: 'import { Container } from "../components/own-names.tsx";\nexport const A = () => <Container>x</Container>;\n',
  },
} as const;

test("a re-export of an @orb/ui door is still that primitive, and another module's same-named symbol is not", async ({
  scratch,
}: {
  readonly scratch: string;
}) => {
  const repoRoot = process.cwd();
  const files: Record<string, string> = { ...SHARED, ...Object.fromEntries(Object.values(CASES).map(({ path, source }) => [path, source])) };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        module: "nodenext",
        moduleResolution: "nodenext",
        noEmit: true,
        strict: true,
        target: "es2022",
        paths: Object.fromEntries(Object.entries(DOORS).map(([door, target]) => [door, [join(repoRoot, target)]])),
      },
      include: ["packages/client/src/**/*.tsx"],
    }),
  );
  const productionConfigUrl = pathToFileURL(join(repoRoot, "eslint.config.ts")).href;
  writeFileSync(
    join(scratch, "eslint.config.mjs"),
    `import production from ${JSON.stringify(productionConfigUrl)};\nexport default [...production, { files: ["packages/client/src/**/*.tsx"], languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: ${JSON.stringify(scratch)} } } }];\n`,
  );

  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: scratch, overrideConfigFile: join(scratch, "eslint.config.mjs") });
  const results = await eslint.lintFiles(Object.values(CASES).map(({ path }) => join(scratch, path)));

  const seen: Record<string, number> = {};
  for (const [name, { path, rule }] of Object.entries(CASES)) {
    const result = results.find((candidate) => candidate.filePath === join(scratch, path));
    seen[name] = result?.messages.filter((message) => message.ruleId === rule).length ?? -1;
  }
  expect(seen).toStrictEqual(Object.fromEntries(Object.entries(CASES).map(([name, { findings }]) => [name, findings])));
}, 60_000);
