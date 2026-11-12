// `orb/feature-classname-layout-only` and `orb/no-built-class-string`: a feature's className on a primitive holds only the plain-layout list, never
// a class the primitive's own prop writes; paint is judged by the CSS a token compiles to; a client component takes no class; a class string is never built.
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

const paintFindings = async (source: string): Promise<readonly string[]> =>
  (await findings(LAYOUT_RULE, source)).filter((message) => message.includes("paints"));

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
] as const)("the layout rule reads %s as paint", async ([, source, tokens]) => {
  const messages = await paintFindings(source);
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
] as const)("the layout rule reads no paint in %s", async ([, source]) => {
  expect(await paintFindings(source)).toEqual([]);
});

const PRIMITIVES = 'import { Row, Stack } from "@orb/ui/layout";\nimport { Text } from "@orb/ui/text";\n';
const BOXES = 'import { Container, Grid, Row, Stack } from "@orb/ui/layout";\n';

test.for([
  ["a class a Row prop writes", `${PRIMITIVES}export const T = (<Row className="justify-end" />);\n`, '`justify-end` is `justify="end"`'],
  ["a class a boolean prop writes", `${PRIMITIVES}export const T = (<Text className="truncate" />);\n`, "`truncate` is `truncate={true}`"],
  [
    "a padding class on a Stack",
    `${PRIMITIVES}export const T = (<Stack className="px-inset-section" />);\n`,
    '`px-inset-section` is `paddingInline="section"`',
  ],
  [
    "a class that beats a later axis's class, which the prop's place in the recipe settles",
    `${PRIMITIVES}export const T = (<Stack artDecoration={art} className="px-inset-section" />);\n`,
    '`px-inset-section` is `paddingInline="section"`',
  ],
  [
    "a class that conflicts with another in the same className",
    `${PRIMITIVES}export const T = (<Stack className="px-inset-section px-inset-block" />);\n`,
    '`px-inset-block` is `paddingInline="block"`',
  ],
  [
    "a responsive inset the narrow padding props write",
    `${PRIMITIVES}export const T = (<Stack className="@max-cq-28:px-tight @max-cq-28:pe-block pbs-row" />);\n`,
    '`@max-cq-28:px-tight` is `paddingInlineNarrow="tight"`',
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
  [
    "a width cap no arm writes, on a Stack",
    `${BOXES}export const T = (<Stack className="max-inline-(--width-popup-floor)" />);\n`,
    "`max-inline-(--width-popup-floor)` is a step `cap` chooses among",
  ],
  ["a width cap no arm writes, on a Row", `${BOXES}export const T = (<Row className="max-inline-cq-32" />);\n`, "`max-inline-cq-32` is a step `cap`"],
  ["a lone half of a capped arm, on a Grid", `${BOXES}export const T = (<Grid className="max-inline-(--width-sidebar-sm)" />);\n`, '`cap="sidebar"`'],
  ["a width cap no arm writes, on a Container", `${BOXES}export const T = (<Container className="max-inline-(--width-popup-floor)" />);\n`, "chooses among"],
  ["a width cap under a variant", `${BOXES}export const T = (<Stack className="@max-cq-32:max-inline-none" />);\n`, "`cap`"],
  ["an inline size a width arm writes", `${BOXES}export const T = (<Stack className="inline-full" />);\n`, '`inline-full` is `width="full"`'],
  ["an inline size no width arm writes", `${BOXES}export const T = (<Row className="inline-(--size-avatar-sm)" />);\n`, "is a step `width` chooses among"],
  ["a bare fraction width on a Stack", `${BOXES}export const T = (<Stack className="inline-1/2" />);\n`, "is a step `width` chooses among"],
  ["a stacked row's alignment, stretched", `${PRIMITIVES}export const T = (<Row className="@max-cq-32:items-stretch" />);\n`, '`alignBelow="stretch-cq-32"`'],
  ["a stacked row's alignment, at the end", `${PRIMITIVES}export const T = (<Row className="@max-cq-28:items-end" />);\n`, '`alignBelow="end-cq-28"`'],
  ["a gap given up at a phone, on a Stack", `${BOXES}export const T = (<Stack className="@max-cq-28:gap-row" />);\n`, '`gapNarrow="row"`'],
  ["a bleed on a Row that a card's edges pay back", `${BOXES}export const T = (<Row className="-ms-(--row-reach-left)" />);\n`, "is part of row.reach.header"],
  ["a reading box's bleed on a Row", `${BOXES}export const T = (<Row className="-mx-gutter" />);\n`, '`-mx-gutter` is `reach="page"`'],
  [
    "a bleed off the reach ramp, which writes it as a pair of edges too",
    `${BOXES}export const T = (<Row className="-mx-block" />);\n`,
    "is not an arm of row.reach",
  ],
  [
    "an inset off the reach ramp, which writes it as a pair of edges too",
    `${BOXES}export const T = (<Stack className="px-(--spacing-gutter)" />);\n`,
    "is a step `paddingInline` chooses among",
  ],
  [
    "a square a Button's scale writes",
    'import { Button } from "@orb/ui/button";\nexport const T = (<Button className="shrink-0 p-0" />);\n',
    "`square={true}`",
  ],
  [
    "a wrap a Button's scale writes",
    'import { Button } from "@orb/ui/button";\nexport const T = (<Button className="py-tight wrap-anywhere whitespace-normal block-auto max-inline-full" />);\n',
    "`wrap={true}`",
  ],
  [
    "a size a Button's scale writes",
    'import { Button } from "@orb/ui/button";\nexport const T = (<Button className="block-(--size-control-sm)" />);\n',
    '`size="sm"`',
  ],
  [
    "an inline size a Button's width writes",
    'import { Button } from "@orb/ui/button";\nexport const T = (<Button className="inline-full" />);\n',
    '`width="full"`',
  ],
  ["a line cap on a Text", 'import { Text } from "@orb/ui/text";\nexport const T = (<Text className="line-clamp-2" />);\n', "`line-clamp-2` is `clamp={2}`"],
  ["a line cap on a Heading", 'import { Heading } from "@orb/ui/text";\nexport const T = (<Heading level={2} className="line-clamp-3" />);\n', "`clamp={3}`"],
  [
    "a flex share on a Text",
    'import { Text } from "@orb/ui/text";\nexport const T = (<Text className="flex-1 min-inline-0" />);\n',
    "`flex-1` is `grow={true}`",
  ],
  [
    "a starting width on a Text",
    'import { Text } from "@orb/ui/text";\nexport const T = (<Text className="basis-(--width-field-floor)" />);\n',
    '`floor="field"`',
  ],
  ["a reversed row below a step", `${PRIMITIVES}export const T = (<Row className="@max-cq-32:flex-row-reverse" />);\n`, '`reverse="cq-32"`'],
  ["a reversed row", `${PRIMITIVES}export const T = (<Row className="flex-row-reverse" />);\n`, "`reverse={true}`"],
  ["a stacked Row", `${PRIMITIVES}export const T = (<Row className="flex-col" />);\n`, "`flex-col` is a step `stackBelow`"],
  ["a stacked Row under a guard", `${PRIMITIVES}export const T = (<Row className={cn(a && "flex-col")} />);\n`, "`stackBelow`"],
  ["a stacked Row at a min step", `${PRIMITIVES}export const T = (<Row className="@cq-32:flex-col" />);\n`, "`stackBelow`"],
  ["a reversed column on a Row", `${PRIMITIVES}export const T = (<Row className="flex-col-reverse" />);\n`, "no step of it"],
  ["a row direction on a Stack", `${PRIMITIVES}export const T = (<Stack className="flex-row" />);\n`, '`readingFlow="weld"`'],
  ["part of a pinned arm, its bleed", `${PRIMITIVES}export const T = (<Row className="-mbs-row" />);\n`, "is part of row.pinned.header"],
  ["a class beside a ramp, under its step", `${PRIMITIVES}export const T = (<Row className="@max-cq-32:flex-col-reverse" />);\n`, "no step of it"],
  [
    "a family only another door chooses",
    'import { Text } from "@orb/ui/text";\nexport const T = (<Text className="justify-center" />);\n',
    "no axis of text chooses",
  ],
  ["a class against the base", 'import { Button } from "@orb/ui/button";\nexport const T = (<Button className="gap-row" />);\n', "overrides the gap-field"],
  ["a control inset on a Button", 'import { Button } from "@orb/ui/button";\nexport const T = (<Button className="px-field" />);\n', '`inset="control"`'],
  [
    "part of the stacked box, its direction",
    'import { Button } from "@orb/ui/button";\nexport const T = (<Button className="flex-col" />);\n',
    "is part of button.stacked.true",
  ],
  ["a side inset on a primitive that is no box", `${PRIMITIVES}export const T = (<Text className="pe-block" />);\n`, "a box around it owns the inset"],
  [
    "the resting class written from the other side of a step",
    `${PRIMITIVES}export const T = (<Row className="flex-col @cq-32:flex-row" />);\n`,
    "written from the other side",
  ],
  [
    "a class through a same-file wrapper",
    `${PRIMITIVES}const Pass = (props) => <Row {...props} />;\nexport const T = (<Pass className="justify-end" />);\n`,
    "`className` on Pass",
  ],
  [
    "a class through a same-file wrapper declared below it",
    `${PRIMITIVES}export const T = (<Pass className="justify-end" />);\nfunction Pass({ className }) { return <Row className={cn("min-inline-0", className)} />; }\n`,
    "`className` on Pass",
  ],
  [
    "a class through a wrapper from another file",
    'import { Pass } from "./pass.tsx";\nexport const T = (<Pass className="justify-end" />);\n',
    "`className` on Pass",
  ],
  [
    "a plain class on a wrapper, which a prop names",
    'import { Pass } from "./pass.tsx";\nexport const T = (<Pass className="shrink-0" />);\n',
    "`className` on Pass",
  ],
  [
    "a class through another class prop of a wrapper",
    'import { Pass } from "./pass.tsx";\nexport const T = (<Pass listClassName="block-(--height-scroll-lg)" />);\n',
    "`listClassName` on Pass",
  ],
  ["a class on a local that shadows the primitive", `${PRIMITIVES}export const T = ({ Row }) => (<Row className="justify-end" />);\n`, "`className` on Row"],
  [
    "a class on a same-named component of another module",
    'import { Row } from "./row.ts";\nexport const T = (<Row className="justify-end" />);\n',
    "`className` on Row",
  ],
  [
    "a class on a member element",
    'import { Dialog } from "@orb/ui/dialog";\nexport const T = (<Dialog.Title className="justify-end" />);\n',
    "`className` on Dialog.Title",
  ],
  [
    "a carrier whose `of` is no primitive",
    'import { Pass } from "./pass.tsx";\nexport const T = (<Track of={Pass} className="shrink-0" />);\n',
    "`className` on Track",
  ],
  ["a class a carrier takes under another prop", "export function Car({ of: P, look }) { return <P className={look} />; }\n", "`className` on P"],
  [
    "the call of a carrier that takes a class under another prop",
    `${PRIMITIVES}function Car({ of: P, look }) { return <P className={look} />; }\nexport const T = (<Car of={Row} look="justify-end sticky" />);\n`,
    "`className` on P",
  ],
  ["a hand class inside a carrier", 'export function Car({ of: P }) { return <P className="shrink-0" />; }\n', "`className` on P"],
  ["a class in a plain object spread", `${PRIMITIVES}export const T = (<Row {...{ className: "justify-end" }} />);\n`, '`justify-end` is `justify="end"`'],
  ["a parked box", `${PRIMITIVES}export const T = (<Row className="orb-out-of-flow" />);\n`, "`outOfFlow={true}`"],
  ["a side inset a padding prop writes", `${BOXES}export const T = (<Row className="pe-block" />);\n`, '`pe-block` is `paddingInlineEnd="block"`'],
  ["a side inset off the ramp", `${BOXES}export const T = (<Stack className="ps-(--spacing-block)" />);\n`, "is a step `paddingInlineStart` chooses among"],
  ["a bleed the reach prop pays back", `${BOXES}export const T = (<Stack className="-mx-inset-section" />);\n`, "`-mx-inset-section` is `reach="],
  [
    "the name row's reach to a card's edges, in a constant",
    `${BOXES}const REACH = "-ms-(--row-reach-left) ps-(--row-reach-left) -me-(--row-reach-right) pe-(--row-reach-right)";\nexport const T = (<Row className={REACH} />);\n`,
    'is `reach="header"`',
  ],
] as const)("the layout rule reports %s", async ([, source, tokens]) => {
  const messages = await findings(LAYOUT_RULE, source);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain(tokens);
});

// A step that writes the type tokens is reported twice: the type tokens as paint, and every class as the step's own.
test("the layout rule reports the stacked box on a Button as its own reshape", async () => {
  const classes = "flex-col items-start p-row block-auto text-label leading-label";
  const messages = await findings(LAYOUT_RULE, `import { Button } from "@orb/ui/button";\nexport const T = (<Button className="${classes}" />);\n`);
  expect(messages.filter((message) => message.includes("own prop owns"))).toHaveLength(1);
  expect(messages.find((message) => message.includes("own prop owns"))).toContain("`stacked={true}`");
});

test.for([
  ["a layout class no prop owns", `${PRIMITIVES}export const T = (<Row className="min-inline-0 shrink-0" />);\n`],
  ["a plain class in a part's own class prop", `${PRIMITIVES}export const T = (<Row restClassName="min-inline-0" />);\n`],
  ["a plain class on the element a carrier renders", `${PRIMITIVES}export const T = (<Track of={Row} className="shrink-0" track="chat" />);\n`],
  ["a plain class under a container step", `${PRIMITIVES}export const T = (<Row className="@cq-32:shrink-0" />);\n`],
  ["a containing block", `${PRIMITIVES}export const T = (<Stack className="relative" />);\n`],
  ["a mechanism the plain-layout rule admits", `${PRIMITIVES}export const T = (<Row className="contain-inline-size" />);\n`],
] as const)("the layout rule passes %s", async ([, source]) => {
  expect(await findings(LAYOUT_RULE, source)).toEqual([]);
});

// Default-deny: the classes no table has seen, and every placement spelled by hand. Each is the class an arm or a new owner must carry.
test.for([
  ["a multi-column layout on a Row", "Row", "columns-2", "`columns-2`"],
  ["a touch action on a Row", "Row", "touch-none", "`touch-none`"],
  ["a class on a Stack no table has seen", "Stack", "aspect-video", "aspect-video"],
  ["a stacking step", "Row", "z-10", "`z-10`"],
  ["a zero step of a family an axis chooses in", "Stack", "pe-0", "`pe-0`"],
  ["a zero block size", "Stack", "block-0", "`block-0`"],
  ["a class under a viewport variant", "Row", "md:justify-end", "`md:justify-end`"],
  ["an owned class in a part's own class prop", "Row", "justify-end", "`justify-end`", "restClassName"],
  ["a position alone on a Row", "Row", "fixed", "fixed"],
  ["a pinned box on a Row", "Row", "sticky inset-bs-0", '`placed="pinned"`'],
  ["a pinned box on a Stack", "Stack", "sticky inset-bs-0", '`placed="pinned"`'],
  ["a covering box on a Row", "Row", "absolute inset-0", '`placed="fill"`'],
  ["a covering box on a Stack", "Stack", "absolute inset-0", '`placed="fill"`'],
  ["a viewport veil on a Row", "Row", "fixed inset-0", "`inset-0`"],
  ["a viewport veil on a Stack", "Stack", "fixed inset-0", "`inset-0`"],
  ["an edge inset alone", "Row", "inset-bs-0", "`inset-bs-0`"],
] as const)("the layout rule refuses %s", async ([, tag, classes, token, prop = "className"]) => {
  const messages = await findings(LAYOUT_RULE, `${PRIMITIVES}export const T = (<${tag} ${prop}="${classes}" />);\n`);
  expect(messages.join(" ")).toContain(token);
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
  ["a carrier that hands its `of` the caller's class", "export function Track({ of: Primitive, className }) { return <Primitive className={className} />; }\n"],
  ["a carrier that takes a class under another prop", "export function Car({ of: P, look }) { return <P className={look} />; }\n"],
  ["a helper that returns a class", 'const box = () => ({ className: "justify-end" });\nexport const T = 1;\n'],
  ["a helper that returns a class from a block", 'export function box(out) { return { className: "shrink-0", inert: out }; }\n'],
  ["a helper that returns a held object", 'export function box() { const props = { restClassName: "flex" }; return props; }\n'],
  ["a wrapper that forwards its className", "export function Pass({ className }) { return <Row className={className} />; }\n"],
  ["a forward under another prop's name", "export function Pass({ box }) { return <Row className={box} />; }\n"],
  ["a forward inside cn", 'export function Pass({ box }) { return <Row className={cn("shrink-0", box)} />; }\n'],
  ["a forward through a local", "export function Pass({ box }) { const held = box; return <Row className={held} />; }\n"],
  ["a forward of a whole props object", "export function Pass(props) { return <Row className={props.box} />; }\n"],
  ["a forward with a non-null assertion", "export function Pass({ box }) { return <Row className={box!} />; }\n"],
  ["a forward beside a condition", "export function Pass({ box, on }) { return <Row className={on && box} />; }\n"],
  ["a class handed to a part through a props object", 'export const T = (<Dialog titleProps={{ className: "truncate" }} />);\n'],
  ["an exported object that carries a class", 'export const PROPS = { className: "justify-end" };\n'],
  ["a class object exported by a specifier", 'const LATE = { className: "justify-end" };\nexport { LATE };\n'],
  ["a class object exported as the default", 'const LATE = { className: "justify-end" };\nexport default LATE;\n'],
  ["a class object handed to a component by name", `const PASSED = { className: "justify-end" };\n${element("box={PASSED}")}`],
  ["a class object handed to a component by a condition", `const PASSED = { className: "justify-end" };\n${element("box={on ? PASSED : null}")}`],
  ["a class object nested in an object", `const PASSED = { className: "justify-end" };\n${element("box={{ inner: PASSED }}")}`],
  ["a class object nested in an array", `const PASSED = { className: "justify-end" };\n${element("box={[PASSED]}")}`],
  ["a class object spread into an array", `const PASSED = [{ className: "justify-end" }];\n${element("box={[...PASSED]}")}`],
  ["a class object two levels down", `const PASSED = { className: "justify-end" };\n${element("box={{ inner: { list: [PASSED] } }}")}`],
  ["a nested class object held in a constant", `const HELD = { inner: { className: "justify-end" } };\n${element("box={HELD}")}`],
  ["a nested class object by condition", `const HELD = { inner: { restClassName: "flex" } };\n${element("box={on ? HELD : null}")}`],
  ["a nested class object in the props of createElement", 'export const T = createElement(Row, { inner: { className: "justify-end" } });\n'],
  ["Object.assign onto an empty object", 'const PASSED = { className: "justify-end" };\nexport const T = Object.assign({}, PASSED);\n'],
  ["Object.assign with an inline class object", 'export const T = Object.assign(held, { className: "justify-end" });\n'],
  ["Object.assign with a nested class object", 'const PASSED = { inner: { className: "justify-end" } };\nexport const T = Object.assign({}, PASSED);\n'],
  ["Object.assign with a spread argument", 'const LIST = [{ className: "justify-end" }];\nexport const T = Object.assign({}, ...LIST);\n'],
  ["Object.assign through globalThis", 'const PASSED = { className: "justify-end" };\nexport const T = globalThis.Object.assign({}, PASSED);\n'],
  ["a destructured assign", "const { assign } = Object;\n"],
  ["a renamed destructured assign", "const { assign: merge } = globalThis.Object;\n"],
  ["an aliased assign", "const merge = Object.assign;\n"],
  ["a class written onto an object", 'const box = {};\nbox.className = "justify-end";\n'],
  ["a class written under a computed key", 'const box = {};\nbox["className"] = "justify-end";\n'],
  ["a part's class written onto an object", 'const box = {};\nbox.rootClassName = "justify-end";\n'],
  ["Object.assign by a computed name", 'const PASSED = { className: "justify-end" };\nexport const T = Object["assign"]({}, PASSED);\n'],
  ["a class object in the props of createElement", 'export const T = createElement(Row, { className: "justify-end" });\n'],
  [
    "a class object in the props of a namespaced createElement",
    'const PASSED = { className: "justify-end" };\nexport const T = React.createElement(Row, PASSED);\n',
  ],
  ["a class object in the props of the JSX runtime", 'export const T = jsx(Row, { className: "justify-end" });\n'],
  ["a computed key in cn", element('className={cn({ ["justify-end"]: cond })}')],
  ["a spread argument of cn", `const LIST = ["justify-end"];\n${element("className={cn(...LIST)}")}`],
  ["a spread inside an array", `const LIST = ["justify-end"];\n${element('className={cn(["min-inline-0", ...LIST])}')}`],
  ["a spread inside an object", `const HELD = { "justify-end": true };\n${element("className={cn({ ...HELD })}")}`],
  ["a tagged template", `const tw = String.raw;\n${element("className={tw`justify-end`}")}`],
  ["a reassigned local", `let late = "";\nlate = "justify-end";\n${element("className={late}")}`],
  ["a local with no initializer", `let late;\n${element("className={late}")}`],
  ["a destructured name", `const { box } = { box: "justify-end" };\n${element("className={box}")}`],
  ["a function declaration", `function pick() { return "justify-end"; }\n${element("className={pick}")}`],
  ["a global", element("className={SHARED}")],
  ["a sequence", element('className={(0, "justify-end")}')],
  ["an awaited value", element("className={await load()}")],
] as const)("the built-string rule reports %s", async ([, source]) => {
  expect(await findings(BUILT_RULE, source)).toHaveLength(1);
});

test.for([
  ["a string", element('className="flex"')],
  ["a template without expressions", element("className={`flex gap-row`}")],
  ["cn over strings, a conditional and undefined", element('className={cn("flex", open ? "hidden" : undefined, { "min-inline-0": narrow })}')],
  ["a local constant", `const ROW = "flex gap-row";\n${element("className={ROW}")}`],
  ["a helper that returns props with no class", "export const box = (out) => ({ inert: out, outOfFlow: out });\n"],
  ["a condition read from a parameter", 'export function Pass({ on }) { return <Row className={on ? "shrink-0" : undefined} />; }\n'],
  ["a condition inside cn", 'export function Pass({ on }) { return <Row className={cn("shrink-0", on && "min-inline-0")} />; }\n'],
  ["an unrelated className data field", 'const record = { className: "Wizard" }; export const T = <Text patch={save({ className: record.className })} />;\n'],
  ["an object nested in a prop with no class", `const KEPT = { inert: true };\n${element("box={{ inner: KEPT }}")}`],
  ["an array in a prop with no class", `const KEPT = { inert: true };\n${element("box={[KEPT, 1, null]}")}`],
  ["Object.assign with no class", "const KEPT = { inert: true };\nexport const T = Object.assign({}, KEPT);\n"],
  ["RPG data in an exported list", 'export const CLASSES = [{ className: "Rogue", hp: 8 }];\n'],
  ["RPG data under an exported key", 'export const SHEET = { hero: { className: "Rogue" } };\n'],
  ["RPG data in a returned list", 'export const roster = () => [{ className: "Rogue" }];\n'],
  ["another field written onto an object", 'const box = {};\nbox.label = "Rogue";\n'],
  ["a destructure of Object's other members", "const { keys } = Object;\n"],
  ["another object's assign", 'const PASSED = { className: "justify-end" };\nexport const T = store.assign({}, PASSED);\n'],
  ["nested values that refer to each other", "const A = { next: B };\nconst B = { next: A };\nexport const T = A;\n"],
  ["a class object that stays where it is declared", 'const RECORD = { className: "Wizard" };\nexport const T = RECORD.className.length;\n'],
  ["an export specifier of a string", 'const ROW = "flex";\nexport { ROW };\n'],
  ["an element factory without a class", "export const T = createElement(Row, { inert: true });\n"],
  ["an element factory with no props", "export const T = createElement(Row, null);\n"],
  ["a local that is never reassigned", `let ROW = "flex";\n${element("className={ROW}")}`],
  ["a key written as a literal", element('className={cn({ "min-inline-0": narrow, shrink: tight })}')],
  ["a nested conditional and a numeric guard", element('className={cn(count > 1 ? "flex" : null, 0 && "hidden")}')],
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
  const source = `import { Stack } from "@orb/ui/layout";\nimport { ROW } from "./row.ts";\nexport const T = (<Stack className={cn(ROW, "text-primary")} />);\n`;
  const outside = "packages/client/src/components/control.tsx";
  expect((await findings(LAYOUT_RULE, source, outside)).join(" ")).toContain("`text-primary`");
  expect(await findings(BUILT_RULE, source, outside)).toHaveLength(1);
});
