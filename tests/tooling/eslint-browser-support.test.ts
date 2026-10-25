// orb/browser-support refuses a browser or JS API some browser in BROWSER_TARGETS lacks, at the use that throws, and admits it behind a feature check.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/browser-support";
const PROBE_DIR = "packages/client/src/features/probe";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// Firefox 138 lacks Element.computedStyleMap and CSSKeywordValue; Safari 18 lacks the Iterator helpers.
const REFUSED = [
  ["a method call", "export function probe(el: HTMLElement): unknown {\n  return el.computedStyleMap();\n}"],
  ["a member chain through the method", "export function probe(el: HTMLElement): unknown {\n  return el.computedStyleMap().size;\n}"],
  ["a constructor of a missing global", 'export const probe = new CSSKeywordValue("auto");'],
  ["a constructor through window", 'export const probe = new window.CSSKeywordValue("auto");'],
  ["a bare reference to a missing global", "export const probe = (value: unknown): boolean => value instanceof CSSKeywordValue;"],
  ["a method of a lib global at a missing version", "export const probe = (): unknown => [1].values().map((n) => n + 1);"],
  [
    "a Tailwind arbitrary property the floor lacks",
    'declare function cn(...parts: string[]): string;\nexport const probe = cn("flex", "[animation-timeline:scroll()]");',
  ],
  [
    "a Tailwind class in a cva variant",
    'declare function cva(base: string, config: object): unknown;\nexport const probe = cva("flex", { variants: { a: { b: "[anchor-name:--probe]" } } });',
  ],
  ["a guard on another name", 'export function probe(el: HTMLElement): unknown {\n  return "attributeStyleMap" in el ? el.computedStyleMap() : null;\n}'],
  [
    "a guard on the same member of a different object",
    'export function probe(el: HTMLElement, other: HTMLElement): unknown {\n  return "computedStyleMap" in other ? el.computedStyleMap() : null;\n}',
  ],
  [
    "a CSS.supports check, which tests a style and not this API",
    'export function probe(el: HTMLElement): unknown {\n  return CSS.supports("width: 1px") ? el.computedStyleMap() : null;\n}',
  ],
  ["a polyfilled builtin read while the module evaluates", "export const EPOCH_ZERO_ISO = Temporal.Instant.fromEpochMilliseconds(0).toString();"],
  ["a polyfilled member called while the module evaluates", 'export const ESCAPED = RegExp.escape("a.b");'],
  ["a polyfilled builtin in a static field", "export class Probe {\n  static epoch = Temporal.Now.instant();\n}"],
  ["a polyfilled builtin in an immediately invoked function", "export const probe = (() => Temporal.Now.instant())();"],
  [
    "a class string held in a named const",
    'declare function cn(...parts: string[]): string;\nconst HELD = "flex [anchor-name:--probe]";\nexport const probe = cn(HELD);',
  ],
] as const;

const ADMITTED = [
  ["an in check on the member", 'export function probe(el: HTMLElement): unknown {\n  return "computedStyleMap" in el ? el.computedStyleMap() : null;\n}'],
  [
    "a truthiness check on the member",
    "export function probe(el: HTMLElement): unknown {\n  if (el.computedStyleMap) {\n    return el.computedStyleMap();\n  }\n  return null;\n}",
  ],
  ["an optional call", "export function probe(el: HTMLElement): unknown {\n  return el.computedStyleMap?.();\n}"],
  [
    "an early return on the member",
    'export function probe(el: HTMLElement): unknown {\n  if (!("computedStyleMap" in el)) {\n    return null;\n  }\n  return el.computedStyleMap();\n}',
  ],
  ["a typeof check on the global", 'export const probe = typeof CSSKeywordValue === "undefined" ? null : new CSSKeywordValue("auto");'],
  ["a typeof check through &&", 'export const probe = typeof CSSKeywordValue !== "undefined" && new CSSKeywordValue("auto");'],
  ["a plain read, which is undefined and never throws", "export const probe = (el: HTMLElement): unknown => el.computedStyleMap;"],
  ["a member of the same name on an unrelated type", "export const probe = (box: { computedStyleMap(): number }): number => box.computedStyleMap();"],
  ["a local binding that shadows the global", "class CSSKeywordValue {}\nexport const probe = new CSSKeywordValue();"],
  ["a builtin the polyfill entry installs", 'export const probe = (): unknown => [RegExp.escape("a.b"), Error.isError(new Error()), Temporal.Now.instant()];'],
  ["a polyfilled builtin inside a method", 'export class Probe {\n  read(): unknown {\n    return [Temporal.Now.instant(), RegExp.escape("a")];\n  }\n}'],
  ["a polyfilled builtin behind a typeof guard at the top level", 'export const probe = typeof Temporal === "undefined" ? null : Temporal.Now.instant();'],
  [
    "a Tailwind class whose property is listed harmless",
    'declare function cn(...parts: string[]): string;\nexport const probe = cn("field-sizing-content", "flex");',
  ],
  [
    "a Tailwind class under @supports",
    'declare function cn(...parts: string[]): string;\nexport const probe = cn("supports-[animation-timeline:scroll()]:[animation-timeline:scroll()]");',
  ],
  ["a supported Tailwind class", 'declare function cn(...parts: string[]): string;\nexport const probe = cn("overscroll-contain", "cursor-pointer");'],
  ["the same text outside a class holder", 'export const probe = "[animation-timeline:scroll()]";'],
  ["a supported API", "export const probe = (el: HTMLElement): unknown => el.getBoundingClientRect();"],
] as const;

const sources = new Map<string, string>(
  [...REFUSED, ...ADMITTED].map(([name, body]) => [join(ROOT, PROBE_DIR, `browser-support-${name.replaceAll(/\W+/gu, "-")}.ts`), `${body}\n`]),
);

// The client's own compiler options over the probe files, so lib.dom resolves to the real DOM types.
function programOf(files: ReadonlyMap<string, string>): ts.Program {
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
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined => {
    const text = files.get(name);
    return text === undefined ? read(name, version, onError, create) : ts.createSourceFile(name, text, version, true, ts.ScriptKind.TS);
  };
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => files.has(name) || exists(name);
  return ts.createProgram([...files.keys()], options, host);
}

let program: ts.Program;
beforeAll(async () => {
  program = programOf(sources);
  await eslint.calculateConfigForFile(join(ROOT, PROBE_DIR, "x.ts"));
}, 300_000);

async function findings(name: string, root = PROBE_DIR): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, PROBE_DIR, `browser-support-${name.replaceAll(/\W+/gu, "-")}.ts`);
  const config = await eslint.calculateConfigForFile(join(ROOT, root, "x.ts"));
  const found = new Linter({ cwd: ROOT }).verify(
    sources.get(fileName) ?? "",
    {
      files: ["**/*.ts"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: [program] } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: fileName },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for(REFUSED)("refuses %s", async ([name]) => {
  expect(await findings(name)).toHaveLength(1);
});

test.for(ADMITTED)("admits %s", async ([name]) => {
  expect(await findings(name)).toEqual([]);
});

test("the population is the client bundle; a tooling file is not judged", async () => {
  const config = await eslint.calculateConfigForFile(join(ROOT, "tooling/src/eslint/index.ts"));
  expect(config?.rules?.[RULE] ?? "off").toBe("off");
});
