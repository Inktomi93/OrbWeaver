import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RAW = "orb/no-raw-container-in-features";
const SURFACE = "orb/surface-consumes-container";
const ANCHOR = "orb/anchor-provides-container";
const COMPONENT = "packages/client/src/features/chat/components/probe.tsx";
const SURFACE_FILE = "packages/client/src/features/chat/surfaces/probe-surface.tsx";
const GROUPED_SURFACE_FILE = "packages/client/src/features/chat/surfaces/gallery/probe-surface.tsx";
const ANCHOR_FILE = "packages/client/src/features/chat/anchors/probe-anchor.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, COMPONENT));
}, 120_000);

async function findings(rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

test.for([
  ["a bare class", 'export const A = () => <Stack className="@container" />;'],
  ["a class among others", 'export const A = () => <Stack className="group @container border-b" />;'],
  ["a class inside cn()", 'export const A = () => <Stack className={cn("@container", flag && "p-block")} />;'],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source is itself a template literal.
  ["a template string", "export const A = () => <Stack className={`row @container ${skin}`} />;"],
  ["a named container", 'export const A = () => <Stack className="@container/list-row" />;'],
  ["a size container", 'export const A = () => <Stack className="@container-size" />;'],
  ["a variant-prefixed container", 'export const A = () => <Stack className="md:@container" />;'],
  ["an arbitrary container-type property", 'export const A = () => <Stack className="[container-type:size]" />;'],
  ["a containerType style prop", 'export const A = () => <Stack style={{ containerType: "size" }} />;'],
  ["a containerName style prop", 'export const A = () => <Stack style={{ ...style, containerName: "row" }} />;'],
  ["a container-type string key", 'export const style = { "container-type": "inline-size" };'],
  ["a dialog body prop", 'export const A = () => <PickerDialog bodyProps={{ className: "@container" }} />;'],
  ["a container shorthand in a style prop", 'export const A = () => <Stack style={{ container: "x / inline-size" }} />;'],
  ["a container shorthand string", 'export const style = { container: "x / inline-size" };'],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source is itself a template literal.
  ["a container shorthand template", "export const style = { container: `${name} / inline-size` };"],
  ["a container class on an inner class prop", 'export const A = () => <PickerDialog bodyClassName="@container" />;'],
] as const)("%s in a feature file is a finding", async ([, source]) => {
  expect(await findings(RAW, source, COMPONENT)).toHaveLength(1);
});

test.for([
  ["a container query variant", 'export const A = () => <Stack className="@md:flex-row @max-5xl:flex-col" />;'],
  ["a named container query variant", 'export const A = () => <Stack className="@sm/list-row:p-block" />;'],
  ["the container prop of Stack and Section", "export const A = () => <Section container><Stack container /></Section>;"],
  ["a container element with a name", 'export const A = () => <Container name="row" />;'],
  ["prose that mentions the utility", 'export const note = "the `@container` class is written by @orb/ui";'],
  ["an unrelated style prop", 'export const A = () => <Stack style={{ containerRole: "row" }} />;'],
  ["an accessible name that mentions the utility", 'export const A = () => <Stack aria-label="@container" />;'],
  ["an expression accessible name that mentions the utility", 'export const A = () => <Stack aria-label={"@container"} />;'],
  ["a portal container option", "export const A = () => <Portal container={host} />;"],
] as const)("%s in a feature file passes", async ([, source]) => {
  expect(await findings(RAW, source, COMPONENT)).toEqual([]);
});

test("the raw container rule does not reach @orb/ui", async () => {
  expect(await findings(RAW, 'export const base = "@container";', "packages/ui/src/layout/variants.ts")).toEqual([]);
});

test.for([
  ["a Container", 'export const S = () => <Container name="x"><Rows /></Container>;', SURFACE_FILE],
  ["a Container in a grouped surface directory", "export const S = () => <Container><Rows /></Container>;", GROUPED_SURFACE_FILE],
  ["a Section container", 'export const S = () => <Section container heading="x"><Rows /></Section>;', SURFACE_FILE],
  ["a Stack container", "export const S = () => <Stack container><Rows /></Stack>;", SURFACE_FILE],
  ["a dialog body container", "export const S = () => <PickerDialog bodyProps={{ container: true }} />;", SURFACE_FILE],
  ["a dialog body props identifier", "export const S = ({ bp }) => <PickerDialog bodyProps={bp} />;", SURFACE_FILE],
  ["a dialog body props spread", "export const S = ({ bp }) => <PickerDialog bodyProps={{ ...bp }} />;", SURFACE_FILE],
  ["a quoted dialog body container", 'export const S = () => <PickerDialog bodyProps={{ "container": true }} />;', SURFACE_FILE],
  ["a Container selected from a namespace", "export const S = () => <Layout.Container><Rows /></Layout.Container>;", SURFACE_FILE],
  ["a Container imported under another name", 'import { Container as Box } from "@orb/ui/layout";\nexport const S = () => <Box><Rows /></Box>;', SURFACE_FILE],
  [
    "a bare container prop on a renamed Stack",
    'import { Stack as Column } from "@orb/ui/layout";\nexport const S = () => <Column container><Rows /></Column>;',
    SURFACE_FILE,
  ],
  [
    "a container size on a renamed Section",
    'import { Section as Panel } from "@orb/ui/layout";\nexport const S = () => <Panel container="size"><Rows /></Panel>;',
    SURFACE_FILE,
  ],
  ["a container spread into a Stack", "export const S = () => <Stack {...{ container: true }}><Rows /></Stack>;", SURFACE_FILE],
] as const)("%s in a surface is a finding", async ([, source, path]) => {
  expect(await findings(SURFACE, source, path)).toHaveLength(1);
});

test("a surface whose bodyProps is a plain literal passes", async () => {
  expect(await findings(SURFACE, 'export const S = () => <PickerDialog bodyProps={{ className: "p-block" }} />;', SURFACE_FILE)).toEqual([]);
});

test.for([
  ["a portal container option", "export const S = () => <Portal container={host}><Rows /></Portal>;"],
  ["a layout import that declares nothing", 'import { Stack } from "@orb/ui/layout";\nexport const S = () => <Stack><Rows /></Stack>;'],
  ["a spread that carries no container", "export const S = () => <Stack {...{ gap: 'row' }}><Rows /></Stack>;"],
  [
    "a renamed Stack with containment off",
    'import { Stack as Column } from "@orb/ui/layout";\nexport const S = () => <Column container={false}><Rows /></Column>;',
  ],
] as const)("a surface with %s passes", async ([, source]) => {
  expect(await findings(SURFACE, source, SURFACE_FILE)).toEqual([]);
});

test("a surface that turns containment off passes", async () => {
  expect(await findings(SURFACE, "export const S = () => <Section container={false}><Rows /></Section>;", SURFACE_FILE)).toEqual([]);
});

test("a surface that only consumes containment passes", async () => {
  expect(
    await findings(SURFACE, 'export const S = () => <Section heading="x"><Stack className="@md:flex-row"><Rows /></Stack></Section>;', SURFACE_FILE),
  ).toEqual([]);
});

test("the surface rule does not reach components", async () => {
  expect(await findings(SURFACE, "export const C = () => <Container><Rows /></Container>;", COMPONENT)).toEqual([]);
});

test("an anchor with no container is a finding", async () => {
  expect(await findings(ANCHOR, "export const A = ({ children }) => <Stack>{children}</Stack>;", ANCHOR_FILE)).toHaveLength(1);
});

test.for([
  ["a Container", 'export const A = ({ children }) => <Container name="x">{children}</Container>;'],
  ["a Section container", "export const A = ({ children }) => <Section container>{children}</Section>;"],
  ["the dialog box it anchors", "export const A = ({ children }) => <FormDialog open>{children}</FormDialog>;"],
  ["a mounted dialog anchor", "export const A = () => <CharacterGalleryDialog open />;"],
  ["a drawer box", "export const A = ({ children }) => <Drawer>{children}</Drawer>;"],
] as const)("an anchor that renders %s passes", async ([, source]) => {
  expect(await findings(ANCHOR, source, ANCHOR_FILE)).toEqual([]);
});

test("an anchor whose only container prop is off is a finding", async () => {
  expect(await findings(ANCHOR, "export const A = ({ children }) => <Section container={false}>{children}</Section>;", ANCHOR_FILE)).toHaveLength(1);
});

test("a dialog nested in a layout element is not the box the anchor provides", async () => {
  expect(await findings(ANCHOR, "export const A = () => <Stack><ConfirmDialog open /></Stack>;", ANCHOR_FILE)).toHaveLength(1);
  expect(await findings(ANCHOR, "export const A = () => <Row><PickerDialog open bodyProps={{ container: true }} /></Row>;", ANCHOR_FILE)).toHaveLength(1);
  expect(await findings(ANCHOR, "export const A = () => <Container><ConfirmDialog open /></Container>;", ANCHOR_FILE)).toEqual([]);
});

test("a dialog the anchor returns, on a branch or beside its sibling dialogs, is still its box", async () => {
  expect(await findings(ANCHOR, "export const A = ({ open }) => (open ? <FormDialog open /> : null);", ANCHOR_FILE)).toEqual([]);
  expect(await findings(ANCHOR, "export const A = () => <><PickerDialog open /><GalleryLightbox /></>;", ANCHOR_FILE)).toEqual([]);
});

test("a dialog part is not the dialog box", async () => {
  expect(await findings(ANCHOR, "export const A = ({ children }) => <DialogFooter>{children}</DialogFooter>;", ANCHOR_FILE)).toHaveLength(1);
});

test("a correct anchor and surface pair passes both rules", async () => {
  const anchor = 'export const A = ({ children }) => <Container className="h-full" name="x">{children}</Container>;';
  const surface = 'export const S = () => <Stack className="@md:flex-row"><Rows /></Stack>;';
  expect([
    await findings(ANCHOR, anchor, ANCHOR_FILE),
    await findings(SURFACE, surface, SURFACE_FILE),
    await findings(RAW, anchor, ANCHOR_FILE),
    await findings(RAW, surface, SURFACE_FILE),
  ]).toEqual([[], [], [], []]);
});
