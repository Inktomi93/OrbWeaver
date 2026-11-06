// `orb/feature-classname-layout-only` and `orb/no-built-class-string`: a feature's className on a primitive carries
// layout tokens only, judged by the CSS each token compiles to, and never a class the primitive's own prop writes; a class string is never built.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { levelOf, resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const LAYOUT_RULE = "orb/feature-classname-layout-only";
const BUILT_RULE = "orb/no-built-class-string";
const FEATURE = "packages/client/src/features/a/control.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path = FEATURE): Promise<readonly string[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } },
      },
      rules: { [rule]: "error" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule).map(({ message }) => message);
}

const element = (attribute: string): string => `export const T = (<Stack ${attribute} />);\n`;

test.for([
  ["a colour token", element('className="flex text-primary"'), "`text-primary`"],
  ["a radius and a size on a skeleton", 'export const T = (<Skeleton className="size-avatar-md rounded-full" />);\n', "`rounded-full`"],
  [
    "paint in both arms of a conditional inside cn",
    element('className={cn("truncate", selected ? "text-primary" : "text-muted-foreground")}'),
    "`text-primary`, `text-muted-foreground`",
  ],
  ["paint under a variant", element('className="hover:bg-accent"'), "`hover:bg-accent`"],
  ["paint declared after the custom property it composes through", element('className="outline-none"'), "`outline-none`"],
  ["a pseudo-element paint trick", element(`className="relative before:absolute before:content-['']"`), "`before:content-['']`"],
  ["paint spelled in a local constant", `const ROW = "flex border-border";\n${element("className={ROW}")}`, "`border-border`"],
  ["a type token on a member element", 'export const T = (<Dialog.Title className="tracking-micro" />);\n', "`tracking-micro`"],
  ["a shadow colour, which emits only a custom property", element('className="shadow-accent"'), "`shadow-accent`"],
  ["a shadow colour under a variant", element('className="hover:shadow-primary"'), "`hover:shadow-primary`"],
  ["a gradient start stop", element('className="from-primary"'), "`from-primary`"],
  ["a gradient middle stop", element('className="via-accent"'), "`via-accent`"],
  ["a gradient end stop", element('className="to-destructive"'), "`to-destructive`"],
  ["a text shadow colour", element('className="text-shadow-accent"'), "`text-shadow-accent`"],
  ["a drop shadow colour", element('className="drop-shadow-accent"'), "`drop-shadow-accent`"],
  ["an inset shadow colour", element('className="inset-shadow-primary"'), "`inset-shadow-primary`"],
  ["a ring colour", element('className="ring-primary"'), "`ring-primary`"],
  ["paint in a JSX spread", element('{...{ className: "text-primary" }}'), "`text-primary`"],
  ["paint in a conditional spread", element('{...(active ? { className: "bg-primary/10" } : {})}'), "`bg-primary/10`"],
  ["paint in an aliased spread", `const props = { className: "text-primary" };\n${element("{...props}")}`, "`text-primary`"],
  [
    "paint in a selected static table",
    `const rows = { active: { className: "text-primary" }, idle: { className: "flex" } };\n${element("{...rows[state]}")}`,
    "`text-primary`",
  ],
  ["paint in an alternate class prop", element('pressedClassName="text-primary"'), "`text-primary`"],
  ["paint in a destructured default", `const {props = {className: "text-primary"}} = {};\n${element("{...props}")}`, "`text-primary`"],
  ["paint in a computed class key", `const key = "restClassName";\n${element('{...{ [key]: "text-primary" }}')}`, "`text-primary`"],
] as const)("the layout rule reports %s", async ([, source, tokens]) => {
  const messages = await findings(LAYOUT_RULE, source);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain(tokens);
});

test.for([
  ["layout tokens", element('className="flex min-inline-0 shrink-0 gap-row"')],
  ["truncation and line clamping", element('className="truncate line-clamp-2"')],
  ["the screen-reader utility", element('className="sr-only"')],
  ["the screen-reader utility under a variant that compiles (a breakpoint swap)", element('className="md:sr-only focus-visible:not-sr-only"')],
  ["a viewport variant on a layout token", element('className="hidden md:flex"')],
  ["a conditional layout token inside cn", element('className={cn("flex", open && "hidden")}')],
  ["a layout token in a local constant", `const ROW = "flex gap-row";\n${element("className={ROW}")}`],
  ["a class the compiler does not know", element('className="shell-grid"')],
  ["containment, whose custom-property registrations are not declarations", element('className="contain-inline-size"')],
  ["a raw element, which the intrinsic rule owns", 'export const T = (<div className="text-primary" />);\n'],
  ["layout in an alternate class prop", element('restClassName="min-inline-0"')],
  ["layout in a spread", element('{...{ className: "flex gap-row" }}')],
  ["the selected safe member only", `const rows = { paint: { className: "text-primary" }, layout: { className: "flex" } };\n${element("{...rows.layout}")}`],
  ["an unrelated className data field", 'const record = { className: "Wizard" }; export const T = <Text>{record.className}</Text>;'],
] as const)("the layout rule passes %s", async ([, source]) => {
  expect(await findings(LAYOUT_RULE, source)).toEqual([]);
});

const PRIMITIVES = 'import { Row, Stack } from "@orb/ui/layout";\nimport { Text } from "@orb/ui/text";\n';

test.for([
  ["a class a Row prop writes", `${PRIMITIVES}export const T = (<Row className="justify-end" />);\n`, '`justify-end` is `justify="end"`'],
  ["a class a boolean prop writes", `${PRIMITIVES}export const T = (<Text className="truncate" />);\n`, "`truncate` is `truncate={true}`"],
  [
    "a padding class on a Stack with no later axis in play",
    `${PRIMITIVES}export const T = (<Stack className="px-section" />);\n`,
    '`px-section` is `paddingInline="section"`',
  ],
  [
    "an owned class under a guard inside cn",
    `${PRIMITIVES}export const T = (<Row className={cn("flex-wrap", open && "justify-between")} />);\n`,
    "`justify-between`",
  ],
  ["an owned class in a local constant", `${PRIMITIVES}const ROW = "flex-wrap justify-end";\nexport const T = (<Row className={ROW} />);\n`, "`justify-end`"],
  [
    "a stack-below class a Row prop writes",
    `${PRIMITIVES}export const T = (<Row className="@max-cq-32:flex-col @max-cq-32:items-stretch" />);\n`,
    '`@max-cq-32:flex-col` is `stackBelow="cq-32"`',
  ],
  [
    "an owned class on an aliased import",
    'import { Row as Line } from "@orb/ui/layout";\nexport const T = (<Line className="justify-end" />);\n',
    "`justify-end`",
  ],
  ["an owned class on the element a carrier renders", `${PRIMITIVES}export const T = (<Track of={Row} className="justify-end" />);\n`, "`justify-end`"],
] as const)("the layout rule reports %s", async ([, source, tokens]) => {
  const messages = await findings(LAYOUT_RULE, source);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain(tokens);
});

test.for([
  ["a layout class no prop owns", `${PRIMITIVES}export const T = (<Row className="min-inline-0 flex-wrap" />);\n`],
  ["an owned class under a viewport variant", `${PRIMITIVES}export const T = (<Row className="md:justify-end" />);\n`],
  ["an owned class in an alternate class prop", `${PRIMITIVES}export const T = (<Row restClassName="justify-end" />);\n`],
  ["an owned class on a local component that shadows the primitive", `${PRIMITIVES}export const T = ({ Row }) => (<Row className="justify-end" />);\n`],
  ["an owned class on a component from another module", 'import { Row } from "./row.ts";\nexport const T = (<Row className="justify-end" />);\n'],
  ["an owned class on a member element", 'import { Dialog } from "@orb/ui/dialog";\nexport const T = (<Dialog.Title className="justify-end" />);\n'],
  [
    "a class that beats a later axis's class, which a prop would put before it",
    `${PRIMITIVES}export const T = (<Stack artDecoration={art} className="px-section" />);\n`,
  ],
  ["a class that conflicts with another in the same className", `${PRIMITIVES}export const T = (<Stack className="px-section px-block" />);\n`],
] as const)("the layout rule passes %s", async ([, source]) => {
  expect(await findings(LAYOUT_RULE, source)).toEqual([]);
});

test.for([
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  ["a template with an expression", element("className={`flex ${gap}`}")],
  ["a concatenation", element('className={"flex " + gap}')],
  ["an imported class string", `import { ROW } from "./row.ts";\n${element("className={ROW}")}`],
  ["an imported class string inside cn", `import { ROW } from "./row.ts";\n${element('className={cn(ROW, "flex")}')}`],
  ["a class read off an object", element("className={styles.row}")],
  ["a function that builds the string", element("className={rowClass(size)}")],
  ["a function under an alternate class prop", element("restClassName={rowClass(size)}")],
  ["an imported class in a spread", `import { ROW } from "./row.ts";\n${element("{...{ className: ROW }}")}`],
] as const)("the built-string rule reports %s", async ([, source]) => {
  expect(await findings(BUILT_RULE, source)).toHaveLength(1);
});

test.for([
  ["a string", element('className="flex"')],
  ["a template without expressions", element("className={`flex gap-row`}")],
  ["cn over strings, a conditional and undefined", element('className={cn("flex", open ? "hidden" : undefined, { "min-inline-0": narrow })}')],
  ["a local constant", `const ROW = "flex gap-row";\n${element("className={ROW}")}`],
] as const)("the built-string rule passes %s", async ([, source]) => {
  expect(await findings(BUILT_RULE, source)).toEqual([]);
});

test("both rules are on for client composition and off inside UI", async () => {
  const levelAt = async (rule: string, path: string): Promise<unknown> => levelOf((await resolvedConfig(eslint, join(ROOT, path))).rules[rule]);
  expect(await levelAt(LAYOUT_RULE, FEATURE)).toBe(2);
  expect(await levelAt(BUILT_RULE, FEATURE)).toBe(2);
  expect(await levelAt(LAYOUT_RULE, "packages/client/src/components/control.tsx")).toBe(2);
  expect(await levelAt(BUILT_RULE, "packages/ui/src/primitives/a/control.tsx")).toBeUndefined();
});

test("both rules judge shared client composition too", async () => {
  const source = `import { ROW } from "./row.ts";\nexport const T = (<Stack className={cn(ROW, "text-primary")} />);\n`;
  const outside = "packages/client/src/components/control.tsx";
  expect(await findings(LAYOUT_RULE, source, outside)).toHaveLength(1);
  expect(await findings(BUILT_RULE, source, outside)).toHaveLength(1);
});
