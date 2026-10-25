// orb/no-native-title refuses a `title` the checker binds to React's DOM attribute in the client and @orb/ui, whether
// written as a JSX attribute, a spread or a property of an object typed as DOM props; a prop a component declares
// for itself (a dialog heading) and an iframe's accessible name pass.
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
  [
    "an object spread",
    'import { Button } from "@orb/ui/button";\nexport const Probe = ({ reason }: { readonly reason: string }): ReactElement => <Button aria-label="Go" {...{ title: reason }} />;',
  ],
  [
    "a conditional spread",
    'import { Button } from "@orb/ui/button";\nexport const Probe = ({ reason }: { readonly reason: string | undefined }): ReactElement => <Button aria-label="Go" {...(reason === undefined ? {} : { title: reason })} />;',
  ],
  [
    "a spread identifier",
    'import { Button } from "@orb/ui/button";\nexport function Probe({ reason }: { readonly reason: string }): ReactElement {\n  const extra = { title: reason };\n  return <Button aria-label="Go" {...extra} />;\n}',
  ],
  [
    "a title authored into an object typed as React's DOM props",
    'import type { HTMLAttributes } from "react";\nexport function Probe({ reason }: { readonly reason: string }): ReactElement {\n  const props: HTMLAttributes<HTMLSpanElement> = { title: reason };\n  return <span {...props}>x</span>;\n}',
  ],
  [
    "a shorthand title in a DOM-props-typed object",
    'import type { HTMLAttributes } from "react";\nexport function Probe({ title }: { readonly title: string }): ReactElement {\n  const props: HTMLAttributes<HTMLSpanElement> = { title };\n  return <span {...props}>x</span>;\n}',
  ],
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
  [
    "a rest of DOM props forwarded on",
    'import type { ComponentProps } from "react";\nimport { Button } from "@orb/ui/button";\nexport const Probe = (props: ComponentProps<typeof Button>): ReactElement => <Button {...props} />;',
  ],
  [
    "a spread with no title",
    'import { Button } from "@orb/ui/button";\nexport const Probe = ({ off }: { readonly off: boolean }): ReactElement => <Button aria-label="Go" {...(off ? { disabled: true } : {})} />;',
  ],
] as const)("passes %s", async ([, body]) => {
  expect(await findings(body)).toEqual([]);
});

test("an object literal not typed as DOM props may carry a title of its own", async () => {
  const body = 'export const Probe = (): ReactElement => <h3>{({ title: "Heading" } satisfies { readonly title: string }).title}</h3>;';
  expect(await findings(body)).toEqual([]);
});

test("the population includes @orb/ui primitives", async () => {
  const body = 'export const Probe = (): ReactElement => <span title="hover only">x</span>;';
  expect(await findings(body, "packages/ui/src/primitives/probe/native-title-probe.tsx")).toHaveLength(1);
});
