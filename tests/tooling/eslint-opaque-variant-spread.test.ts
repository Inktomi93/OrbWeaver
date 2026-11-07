// orb/no-opaque-variant-spread refuses a JSX spread on an @orb/ui element that can write one of the element's variant axes
// unless the variant census can read it: an object literal, a conditional or logical of literals, or a same-file const of one.
// orb/no-opaque-class-spread holds the same spread to the key a class travels under, on any component and in an element factory's props.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-opaque-variant-spread";
const CLASS_RULE = "orb/no-opaque-class-spread";
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

async function findings(body: string, rule: string = RULE): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, PROBE);
  const source = `import type { ReactElement, ComponentProps } from "react";\nimport { Button } from "@orb/ui/button";\nimport { Row } from "@orb/ui/layout";\n${body}\n`;
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
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename: fileName },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    body,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
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
  ["an index signature of a class union", 'export const Probe = (bag: Readonly<Record<string, "flex" | "grid">>): ReactElement => <Row {...bag} />;'],
  ["an index signature typed unknown", "export const Probe = (bag: Readonly<Record<string, unknown>>): ReactElement => <Row {...bag} />;"],
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

const FACTORY = "declare function createElement(type: unknown, props: unknown): ReactElement;";

test.for([
  [
    "a nested member",
    "export const Probe = ({ box }: { readonly box: { readonly inner: { readonly className: string } } }): ReactElement => <Row {...box.inner} />;",
  ],
  ["an array element", "export const Probe = ({ box }: { readonly box: readonly { readonly className: string }[] }): ReactElement => <Row {...box[0]} />;"],
  [
    "a merged object",
    'const PASSED = { className: "justify-end" };\nconst MERGED = Object.assign({}, PASSED);\nexport const Probe = (): ReactElement => <Row {...MERGED} />;',
  ],
  [
    "an aliased merge",
    'const PASSED = { className: "justify-end" };\nconst { assign } = Object;\nexport const Probe = (): ReactElement => <Row {...assign({}, PASSED)} />;',
  ],
  ["built entries", 'export const Probe = (): ReactElement => <Row {...Object.fromEntries([["className", "justify-end"]])} />;'],
  ["a call's return", "declare function look(): { readonly className: string };\nexport const Probe = (): ReactElement => <Row {...look()} />;"],
  ["an optional key", "export const Probe = (rest: { readonly className?: string }): ReactElement => <Row {...rest} />;"],
  ["a part's class key", "export const Probe = (rest: { readonly restClassName: string }): ReactElement => <Row {...rest} />;"],
  ["a raw element's own props on a primitive", 'export const Probe = (rest: ComponentProps<"div">): ReactElement => <Row {...rest} />;'],
  [
    "a client component",
    "declare function Local(props: object): ReactElement;\nexport const Probe = (rest: { readonly className: string }): ReactElement => <Local {...rest} />;",
  ],
  ["an index signature", "export const Probe = (bag: Readonly<Record<string, string>>): ReactElement => <Row {...bag} />;"],
  ["an index signature of a class union", 'export const Probe = (bag: Readonly<Record<string, "flex" | "grid">>): ReactElement => <Row {...bag} />;'],
  ["an index signature typed unknown", "export const Probe = (bag: Readonly<Record<string, unknown>>): ReactElement => <Row {...bag} />;"],
  ["a spread typed any", "export const Probe = (bag: any): ReactElement => <Row {...bag} />;"],
  [
    "an element factory's props",
    `${FACTORY}\nexport const Probe = ({ box }: { readonly box: { readonly className: string } }): ReactElement => createElement(Row, box);`,
  ],
] as const)("the class rule flags %s", async ([, body]) => {
  const found = await findings(body, CLASS_RULE);
  expect(found).toHaveLength(1);
  expect(found[0]?.message).toContain("onto a component");
});

test.for([
  ["a type that omits the key", 'export const Probe = (rest: Omit<ComponentProps<"div">, "className">): ReactElement => <Row {...rest} />;'],
  ["a type that closes the key", "export const Probe = (rest: { readonly className?: never }): ReactElement => <Row {...rest} />;"],
  ["an object literal the static rules read", 'export const Probe = (): ReactElement => <Row {...{ className: "shrink-0" }} />;'],
  ["a same-file const the static rules read", 'const HELD = { className: "shrink-0" };\nexport const Probe = (): ReactElement => <Row {...HELD} />;'],
  ["a record of handlers", "export const Probe = (bag: Readonly<Record<string, () => void>>): ReactElement => <Row {...bag} />;"],
  ["a record of counts", "export const Probe = (bag: Readonly<Record<string, number>>): ReactElement => <Row {...bag} />;"],
  ["a raw element, which the intrinsic rule owns", 'export const Probe = (rest: ComponentProps<"div">): ReactElement => <div {...rest} />;'],
  [
    "an element factory's props with no class",
    `${FACTORY}\nexport const Probe = ({ box }: { readonly box: { readonly inert: boolean } }): ReactElement => createElement(Row, box);`,
  ],
] as const)("the class rule passes %s", async ([, body]) => {
  expect(await findings(body, CLASS_RULE)).toEqual([]);
});

// Spells a template placeholder inside a fixture.
const TEMPLATE_HOLE = "$";

// The limits the rule comments name: a type is all this rule reads, and a call's argument stays open because an RPG sheet's `className` is data. Each is a class
// that lands, so a row that starts failing has closed a limit and its comment changes with it.
test.for([
  [
    "a call that hands a class back under a wider type",
    [
      "interface Kept { readonly inert: boolean }",
      "const widen = (kept: Kept): Kept => kept;",
      'const HELD = { className: "justify-end", inert: true };',
      "export const Probe = (): ReactElement => <Row {...widen(HELD)} />;",
    ].join("\n"),
  ],
  ["a rest cast to object", "export const Probe = (rest: { readonly className: string }): ReactElement => <Row {...(rest as object)} />;"],
  [
    "a default under a wider type",
    'const HELD = { className: "justify-end" };\nexport const Probe = ({ box = HELD }: { readonly box?: object }): ReactElement => <Row {...box} />;',
  ],
  ["Reflect.set", 'const box = {};\nReflect.set(box, "className", "justify-end");\nexport const Probe = (): ReactElement => <Row {...box} />;'],
  ["a template-keyed record", `export const Probe = (bag: Readonly<Record<\`${TEMPLATE_HOLE}{string}ClassName\`, string>>): ReactElement => <Row {...bag} />;`],
] as const)("out of reach of the class rule: %s", async ([, body]) => {
  expect(await findings(body, CLASS_RULE)).toEqual([]);
});
