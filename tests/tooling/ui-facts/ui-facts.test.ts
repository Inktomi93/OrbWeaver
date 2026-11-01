import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { analyse, isClassified } from "../../../tooling/src/ui-facts/analysis.ts";
import { parseExceptions } from "../../../tooling/src/ui-facts/exceptions.ts";

const THEME = ":root {\n  --spacing-section: round(up, 1.5rem, 1px);\n  --size-icon-sm: round(up, 1rem, 1px);\n}\n";
const UI_PACKAGE = JSON.stringify({ exports: { "./button": "./src/primitives/button/index.ts" } });
const BUTTON_VARIANTS = 'export const buttonVariants = tv({ variants: { size: { sm: "", md: "" }, variant: { solid: "", ghost: "" } } });';

function plantClient(root: string, files: Readonly<Record<string, string>>): void {
  plantFile(root, "packages/ui/package.json", UI_PACKAGE);
  plantFile(root, "packages/ui/src/styles/theme.css", THEME);
  plantFile(root, "packages/ui/src/primitives/button/variants.ts", BUTTON_VARIANTS);
  for (const [path, text] of Object.entries(files)) {
    plantFile(root, `packages/client/src/features/probe/${path}`, text);
  }
}

const sitesOf = (root: string): ReturnType<typeof analyse>["sites"] => analyse(root, [], null).sites;

test("a planted raw button and an arbitrary colour are reported, with the button a bypass", ({ scratch }) => {
  const root = plantDir(scratch, "planted");
  plantClient(root, {
    "components/planted.tsx":
      'import { Stack } from "@orb/ui/layout";\nexport const A = () => <Stack className="bg-[#ff0000]"><button type="button" onClick={() => {}}>Go</button></Stack>;',
  });
  const sites = sitesOf(root);
  const button = sites.find((site) => site.kind === "raw-button");
  const colour = sites.find((site) => site.kind === "tw-color-literal");
  expect(button?.path).toBe("packages/client/src/features/probe/components/planted.tsx");
  expect(button !== undefined && isClassified(button) ? button.cls : null).toBe("bypass");
  expect(colour?.detail).toBe("bg-[#ff0000]");
  expect(colour !== undefined && isClassified(colour) ? colour.cls : null).toBe("system-gap");
});

test("a class string in three files is a missing composite, and an equal-valued token is a bypass", ({ scratch }) => {
  const root = plantDir(scratch, "composite");
  const cluster = '<div className="flex items-center rounded-lg border">x</div>';
  plantClient(root, {
    "components/a.tsx": `export const A = () => ${cluster};`,
    "components/b.tsx": `export const B = () => ${cluster};`,
    "components/c.tsx": `export const C = () => ${cluster};\nexport const D = () => <div className="p-6">y</div>;`,
  });
  const sites = sitesOf(root);
  const radius = sites.filter((site) => site.kind === "tw-radius").filter(isClassified);
  expect(radius).toHaveLength(3);
  expect(new Set(radius.map((site) => site.cls))).toEqual(new Set(["missing-composite"]));
  // p-6 is 24px, which --spacing-section holds.
  const spacing = sites.filter((site) => site.kind === "tw-raw-spacing").filter(isClassified);
  expect(spacing.map((site) => [site.cls, site.fix])).toEqual([["bypass", "--spacing-section"]]);
});

test("a dialog with no dismiss path is a defect the majority cannot hide", ({ scratch }) => {
  const root = plantDir(scratch, "dialog");
  const open = (name: string, props: string): string =>
    `import { FormDialog } from "#components";\nexport const ${name} = () => <FormDialog open={true} onOpenChange={() => {}} title="T" ${props}>body</FormDialog>;`;
  plantClient(root, {
    "components/ok1.tsx": open("A", "dismissLabel='Close'"),
    "components/ok2.tsx": open("B", "dismissLabel='Close'"),
    "components/ok3.tsx": open("C", "closeButton={true}"),
    "components/bad.tsx": open("D", ""),
  });
  const comparison = analyse(root, [], null).comparisons.find((entry) => entry.cohort === "dialog" && entry.column === "dismiss");
  expect(comparison?.defects.map((defect) => defect.at)).toEqual(["packages/client/src/features/probe/components/bad.tsx:2"]);
});

test("an exception needs a cited ruling and then removes its site", ({ scratch }) => {
  expect(() => parseExceptions(JSON.stringify({ entries: [{ kind: "raw-button", at: "a.tsx", ruling: "because" }] }))).toThrow(/ruling/u);
  const root = plantDir(scratch, "excepted");
  plantClient(root, { "components/x.tsx": 'export const A = () => <button type="button">Go</button>;' });
  const entries = parseExceptions(
    JSON.stringify({ entries: [{ kind: "raw-button", at: "packages/client/src/features/probe/components/x.tsx", ruling: "D336 names this button" }] }),
  );
  const facts = analyse(root, entries, null);
  expect(facts.sites.filter((site) => site.kind === "raw-button")).toHaveLength(0);
  expect(facts.excepted).toHaveLength(1);
});

test("a one-row Textarea is an Input's job unless a maxRows ceiling says it grows", ({ scratch }) => {
  const root = plantDir(scratch, "textarea");
  plantClient(root, {
    "components/rows.tsx": 'import { Textarea } from "@orb/ui/textarea";\nexport const A = () => <><Textarea rows={1} /><Textarea maxRows={6} rows={1} /></>;',
  });
  expect(sitesOf(root).filter((site) => site.kind === "textarea-single-row")).toHaveLength(1);
});
