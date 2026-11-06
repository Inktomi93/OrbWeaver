// orb/no-opaque-variant-spread refuses a JSX spread on an @orb/ui element that can write one of the element's variant axes
// unless the variant census can read it: an object literal, a conditional or logical of literals, or a same-file const of one.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-opaque-variant-spread";
const PROBE = "packages/client/src/features/probe/opaque-variant-spread-probe.tsx";
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

async function findings(body: string): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, PROBE);
  const source = `import type { ReactElement, ComponentProps } from "react";\nimport { Button } from "@orb/ui/button";\n${body}\n`;
  const config = await resolvedConfig(eslint, fileName);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.tsx"],
      plugins: config.plugins,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: false, projectService: false, programs: [programFor(fileName, source)], ecmaFeatures: { jsx: true } },
      },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
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
  ["the rest of a primitive's own props", "export const Probe = (props: ComponentProps<typeof Button>): ReactElement => <Button {...props} />;"],
  ["a parameter typed with an axis", 'export const Probe = (look: { readonly variant?: "solid" | "ghost" }): ReactElement => <Button {...look}>x</Button>;'],
  [
    "a conditional that has an opaque arm",
    'export const Probe = (look: { readonly size?: "sm" | "md" }): ReactElement => <Button {...(look.size === undefined ? {} : look)}>x</Button>;',
  ],
  [
    "a const whose initializer is a call",
    'declare function look(): { readonly variant: "ghost" };\nexport const Probe = (): ReactElement => <Button {...look()}>x</Button>;',
  ],
  ["a string index signature", "export const Probe = (bag: Readonly<Record<string, string>>): ReactElement => <Button {...bag}>x</Button>;"],
  [
    "an index signature beside named keys",
    "export const Probe = (bag: { readonly id: string; readonly [key: string]: string }): ReactElement => <Button {...bag}>x</Button>;",
  ],
  [
    "a union with an index-signature arm",
    "export const Probe = (bag: Readonly<Record<string, string>> | { readonly id: string }): ReactElement => <Button {...bag}>x</Button>;",
  ],
  ["a spread typed any", "export const Probe = (bag: any): ReactElement => <Button {...bag}>x</Button>;"],
] as const)("flags %s", async ([, body]) => {
  const found = await findings(body);
  expect(found).toHaveLength(1);
  expect(found[0]?.message).toMatch(/variant axis|variant axes/u);
});

test.for([
  ["an object literal", 'export const Probe = (): ReactElement => <Button {...{ variant: "ghost" }}>x</Button>;'],
  [
    "a conditional of object literals",
    'export const Probe = ({ on }: { readonly on: boolean }): ReactElement => <Button {...(on ? { variant: "ghost" } : {})}>x</Button>;',
  ],
  ["a same-file const of an object literal", 'const LOOK = { size: "sm" } as const;\nexport const Probe = (): ReactElement => <Button {...LOOK}>x</Button>;'],
  [
    "a spread whose type has no axis",
    'export const Probe = (extra: Pick<ComponentProps<typeof Button>, "disabled">): ReactElement => <Button {...extra}>x</Button>;',
  ],
  ["a raw element, which has no axes", 'export const Probe = (rest: ComponentProps<"span">): ReactElement => <span {...rest}>x</span>;'],
  ["an index signature spread on a raw element", "export const Probe = (bag: Readonly<Record<string, string>>): ReactElement => <span {...bag}>x</span>;"],
  ["a number index signature", "export const Probe = (bag: readonly string[]): ReactElement => <Button {...bag}>x</Button>;"],
] as const)("passes %s", async ([, body]) => {
  expect(await findings(body)).toEqual([]);
});

test("a literal with a computed key stays opaque when its type names an axis", async () => {
  const body = 'declare const KEY: "variant";\nexport const Probe = (): ReactElement => <Button {...{ [KEY]: "ghost" as const }}>x</Button>;';
  expect(await findings(body)).toHaveLength(1);
});
