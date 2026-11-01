import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { analyse } from "../../../tooling/src/ui-facts/analysis.ts";

const FEATURE = "packages/client/src/features/probe";
const UI_PACKAGE = JSON.stringify({ exports: { "./button": "./src/primitives/button/index.ts", "./layout": "./src/layout/index.ts" } });
const BUTTON_VARIANTS = 'export const buttonVariants = tv({ variants: { size: { sm: "", md: "" }, variant: { solid: "", ghost: "", link: "" } } });';
const THEME = ":root {\n  --spacing-section: round(up, 1.5rem, 1px);\n}\n";

function plant(root: string, files: Readonly<Record<string, string>>): void {
  plantFile(root, "packages/ui/package.json", UI_PACKAGE);
  plantFile(root, "packages/ui/src/styles/theme.css", THEME);
  plantFile(root, "packages/ui/src/primitives/button/variants.ts", BUTTON_VARIANTS);
  for (const [path, text] of Object.entries(files)) {
    plantFile(root, `${FEATURE}/${path}`, text);
  }
}

const shell = (name: string): string =>
  `import { ListPage, LibrarySurfaceShell } from "#components";\nexport const ${name} = () => <ListPage><LibrarySurfaceShell loadingLabel="a" errorLabel="b"><Rows /></LibrarySurfaceShell></ListPage>;`;

test("a list surface built without the template is an outlier beside the nearest common skeleton, with the diff", ({ scratch }) => {
  const root = plantDir(scratch, "skeleton");
  plant(root, {
    "surfaces/a-list-surface.tsx": shell("A"),
    "surfaces/b-list-surface.tsx": shell("B"),
    "surfaces/c-list-surface.tsx": shell("C"),
    "surfaces/d-list-surface.tsx": 'import { Stack } from "@orb/ui/layout";\nexport const D = () => <Stack><Rows /></Stack>;',
  });
  const cohort = analyse(root, [], null).composition.skeletons.find((entry) => entry.name === "surface:list");
  expect(cohort?.common.map((entry) => [entry.fingerprint, entry.count])).toEqual([["T:ListPage(T:LibrarySurfaceShell)", 3]]);
  expect(cohort?.outliers).toHaveLength(1);
  const outlier = cohort?.outliers[0];
  expect(outlier?.member.path).toBe(`${FEATURE}/surfaces/d-list-surface.tsx`);
  expect(outlier?.nearest).toBe("T:ListPage(T:LibrarySurfaceShell)");
  expect([outlier?.added, outlier?.removed]).toEqual([["P:Stack"], ["T:ListPage", "T:LibrarySurfaceShell"]]);
});

test("a useQuery whose pending flag picks the render is a ladder, a bare enabled is a gate, and skipToken is neither", ({ scratch }) => {
  const root = plantDir(scratch, "reads");
  plant(root, {
    "hooks/use-reads.ts": [
      "export function useLadder(trpc) {",
      "  const { data, isPending } = useQuery(trpc.a.queryOptions());",
      "  return isPending ? null : data;",
      "}",
      "export function useViaObject(trpc) {",
      "  const q = useQuery(trpc.b.queryOptions());",
      "  return q.isError ? null : q.data;",
      "}",
      "export function useGate(trpc, id) {",
      "  return useQuery({ ...trpc.c.queryOptions({ id }), enabled: id !== null }).data;",
      "}",
      "export function useSkip(trpc, id) {",
      "  return useQuery(trpc.d.queryOptions(id ?? skipToken)).data;",
      "}",
      "export function useBackground(trpc) {",
      "  return useQuery(trpc.e.queryOptions()).data;",
      "}",
    ].join("\n"),
  });
  const members = analyse(root, [], null).cohorts.find((entry) => entry.name === "read-shape")?.members ?? [];
  expect(members.map((member) => [member.label, member.cells["shape"]?.value])).toEqual([
    ["useLadder", "ladder"],
    ["useViaObject", "ladder"],
    ["useGate", "enabled-gate"],
    ["useSkip", "skipToken"],
    ["useBackground", "background"],
  ]);
});

test("variant values reached through a const map or a conditional count as written, and a prop stays unresolved", ({ scratch }) => {
  const root = plantDir(scratch, "variants");
  plant(root, {
    "components/uses.tsx": [
      'import { Button } from "@orb/ui/button";',
      'const SIZES = { a: "sm", b: "md" } as const;',
      "export const A = ({ kind, flag, tone }) => (",
      "  <>",
      '    <Button variant="solid" size={SIZES[kind]} />',
      '    <Button variant={flag ? "ghost" : "solid"} />',
      "    <Button variant={tone} />",
      "  </>",
      ");",
    ].join("\n"),
  });
  const axes = analyse(root, [], null).composition.variants.axes;
  const valueUse = (axis: string, value: string): [number, number] | undefined => {
    const hit = axes.find((entry) => entry.axis === axis)?.values.find((entry) => entry.value === value);
    return hit === undefined ? undefined : [hit.direct, hit.resolved];
  };
  expect(valueUse("variant", "solid")).toEqual([1, 1]);
  expect(valueUse("variant", "ghost")).toEqual([0, 1]);
  expect(valueUse("variant", "link")).toEqual([0, 0]);
  expect(valueUse("size", "sm")).toEqual([0, 1]);
  expect(valueUse("size", "md")).toEqual([0, 1]);
  expect(axes.find((entry) => entry.axis === "variant")?.unresolved).toEqual({ "identifier from a prop, parameter or import": 1 });
  expect(axes.find((entry) => entry.axis === "size")?.unresolved).toEqual({});
});

test("an autosave form that dismisses with Cancel is a defect, and a hook toast beside an inline error is a repeated failure", ({ scratch }) => {
  const root = plantDir(scratch, "forms");
  plant(root, {
    "hooks/use-thing-form.ts": "export const useThingForm = createAutosaveEntityForm({});\nexport const useSaved = createSavedEntityForm({});",
    "hooks/use-thing-mutations.ts": 'export const useSaveThing = createEntityMutation<A, B>({ errorToast: "Could not save", busDriven: true });',
    "components/autosave-dialog.tsx": [
      'import { Button } from "@orb/ui/button";',
      'import { useThingForm } from "../hooks/use-thing-form.ts";',
      "export const A = () => { useThingForm(); return <Button>Cancel</Button>; };",
    ].join("\n"),
    "components/saved-dialog.tsx": [
      'import { Button } from "@orb/ui/button";',
      'import { useSaved } from "../hooks/use-thing-form.ts";',
      "export const B = () => { useSaved(); return <Button>Cancel</Button>; };",
    ].join("\n"),
    "components/thing-card.tsx": [
      'import { useSaveThing } from "../hooks/use-thing-mutations.ts";',
      "export const C = ({ trpc, invalidation }) => {",
      "  const save = useSaveThing({ trpc, invalidation });",
      "  return save.error === null ? null : <p>{String(save.error)}</p>;",
      "};",
    ].join("\n"),
  });
  const facts = analyse(root, [], null);
  const forms = facts.cohorts.find((entry) => entry.name === "form")?.members ?? [];
  expect(forms.map((member) => [member.path.split("/").pop(), member.cells["mode"]?.value, member.cells["fit"]?.value])).toEqual([
    ["autosave-dialog.tsx", "autosave", "autosave says Cancel"],
    ["saved-dialog.tsx", "saved", "ok"],
  ]);
  const feedback = facts.cohorts.find((entry) => entry.name === "feedback")?.members ?? [];
  expect(feedback.map((member) => [member.label, member.cells["failure"]?.value])).toEqual([["useSaveThing", "toast+inline"]]);
});

test("a section's list boundary is the shell, the boundary or none", ({ scratch }) => {
  const root = plantDir(scratch, "structure");
  plant(root, {
    "surfaces/a-list-surface.tsx": shell("A"),
    "surfaces/b-detail-surface.tsx":
      'import { QueryBoundary } from "#components";\nexport const B = () => <QueryBoundary fallback={null}><Rows /></QueryBoundary>;',
  });
  const section = analyse(root, [], null).cohorts.find((entry) => entry.name === "section-structure")?.members[0];
  expect(Object.fromEntries(Object.entries(section?.cells ?? {}).map(([column, cell]) => [column, cell.value]))).toMatchObject({
    list: "yes",
    detail: "yes",
    loading: "yes",
    listBoundary: "LibrarySurfaceShell",
    detailBoundary: "QueryBoundary",
  });
});
