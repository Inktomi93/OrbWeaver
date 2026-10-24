// orb/no-native-title refuses a JSX `title` the checker binds to React's DOM attribute in the client; a prop a
// component declares for itself (a dialog heading) and an iframe's accessible name pass.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-native-title";
const PROBE = "packages/client/src/features/probe/native-title-probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, PROBE));
}, 120_000);

// The client's own compiler options over one probe file, so `@orb/ui` and React resolve to their real types.
function programFor(fileName: string, source: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(ROOT, "packages/client/tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic): never => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  const options = { ...(parsed?.options ?? {}), noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined =>
    name === fileName ? ts.createSourceFile(name, source, version, true, ts.ScriptKind.TSX) : read(name, version, onError, create);
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => name === fileName || exists(name);
  return ts.createProgram([fileName], options, host);
}

async function findings(body: string, path = PROBE): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, path);
  const source = `import type { ReactElement } from "react";\n${body}\n`;
  const config = await eslint.calculateConfigForFile(fileName);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.tsx"],
      plugins: config?.plugins ?? {},
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: false, projectService: false, programs: [programFor(fileName, source)], ecmaFeatures: { jsx: true } },
      },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: fileName },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    body,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["an intrinsic element", 'export const Probe = (): ReactElement => <span title="hover only">x</span>;'],
  [
    "a primitive that forwards the DOM attribute",
    'import { Button } from "@orb/ui/button";\nexport const Probe = (): ReactElement => <Button aria-label="Reset" title="Reset the value" />;',
  ],
  ["a text primitive", 'import { Text } from "@orb/ui/text";\nexport const Probe = (): ReactElement => <Text title="full name">name</Text>;'],
] as const)("flags %s", async ([, body]) => {
  expect(await findings(body)).toHaveLength(1);
});

test.for([
  ["an iframe, whose title is its accessible name", 'export const Probe = (): ReactElement => <iframe src="about:blank" title="Card preview" />;'],
  [
    "a heading prop a primitive declares itself",
    'import { EmptyState } from "@orb/ui/empty-state";\nexport const Probe = (): ReactElement => <EmptyState action={null} title="No stats yet" />;',
  ],
  [
    "a local component's own title prop",
    'function Card({ title }: { readonly title: string }): ReactElement {\n  return <h3>{title}</h3>;\n}\nexport const Probe = (): ReactElement => <Card title="Heading" />;',
  ],
] as const)("passes %s", async ([, body]) => {
  expect(await findings(body)).toEqual([]);
});

test("the population is the client; @orb/ui primitives own their native titles", async () => {
  const body = 'export const Probe = (): ReactElement => <span title="hover only">x</span>;';
  expect(await findings(body, "packages/ui/src/primitives/probe/native-title-probe.tsx")).toEqual([]);
});
