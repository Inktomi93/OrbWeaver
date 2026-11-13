import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { analyse } from "../../../tooling/src/ui-facts/analysis.ts";
import { skeletonCohortOf } from "../../../tooling/src/ui-facts/skeleton.ts";
import { plantTheme } from "./_theme.ts";

const FEATURE = "packages/client/src/features/probe";
const UI_PACKAGE = JSON.stringify({ exports: { "./button": "./src/primitives/button/index.ts", "./layout": "./src/layout/index.ts" } });
const BUTTON_VARIANTS = 'export const buttonVariants = tv({ variants: { size: { sm: "", md: "" }, variant: { solid: "", ghost: "", link: "" } } });';
const THEME = ":root {\n  --spacing-section: round(up, 1.5rem, 1px);\n}\n";

function plant(root: string, files: Readonly<Record<string, string>>): void {
  plantFile(root, "packages/ui/package.json", UI_PACKAGE);
  plantTheme(root, THEME);
  plantFile(root, "packages/ui/src/primitives/button/variants.ts", BUTTON_VARIANTS);
  for (const [path, text] of Object.entries(files)) {
    plantFile(root, `${FEATURE}/${path}`, text);
  }
}

const shell = (name: string): string =>
  `import { ListPage, LibrarySurfaceShell } from "#components";\nexport const ${name} = () => <ListPage><LibrarySurfaceShell loadingLabel="a" errorLabel="b"><Rows /></LibrarySurfaceShell></ListPage>;`;

/** A section definition that mounts each named `<x>-list-surface.tsx` component in its `list` slot. */
const listSlot = (...names: readonly string[]): string =>
  [
    ...names.map((name) => `import { ${name} } from "../surfaces/${name.toLowerCase()}-list-surface.tsx";`),
    `export const section = { list: <>${names.map((name) => `<${name} />`).join("")}</> };`,
  ].join("\n");

test("a list-slot surface built without the template is an outlier with the diff, and a list-named surface no slot mounts is no member", ({ scratch }) => {
  const root = plantDir(scratch, "skeleton");
  plant(root, {
    "surfaces/a-list-surface.tsx": shell("A"),
    "surfaces/b-list-surface.tsx": shell("B"),
    "surfaces/c-list-surface.tsx": shell("C"),
    "surfaces/d-list-surface.tsx": 'import { Stack } from "@orb/ui/layout";\nexport const D = () => <Stack><Rows /></Stack>;',
    "surfaces/e-list-surface.tsx": 'import { Stack } from "@orb/ui/layout";\nexport const E = () => <Stack><Rows /></Stack>;',
    "lib/probe-section.tsx": listSlot("A", "B", "C", "D"),
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

test("an aliased useQuery and a useQueries result read through an element or a callback are classified like a bare useQuery", ({ scratch }) => {
  const root = plantDir(scratch, "query-aliases");
  plant(root, {
    "hooks/use-many.ts": [
      'import { useQuery as useRead, useQueries } from "@tanstack/react-query";',
      'import * as rq from "@tanstack/react-query";',
      "export function useAliased(trpc) {",
      "  const { isPending } = useRead(trpc.a.queryOptions());",
      "  return isPending;",
      "}",
      "export function useNamespaced(trpc) {",
      "  return rq.useQuery(trpc.b.queryOptions()).data;",
      "}",
      "export function useSome(trpc) {",
      "  const rows = useQueries({ queries: [trpc.c.queryOptions()] });",
      "  return rows.some((row) => row.isPending) ? null : rows;",
      "}",
      "export function useFirst(trpc) {",
      "  const [first, second] = useQueries({ queries: [trpc.d.queryOptions(), trpc.e.queryOptions()] });",
      "  return first.isError ? null : second.data;",
      "}",
      "export function useData(trpc) {",
      "  const rows = useQueries({ queries: [trpc.f.queryOptions()] });",
      "  return rows.map((row) => row.data);",
      "}",
    ].join("\n"),
  });
  const members = analyse(root, [], null).cohorts.find((entry) => entry.name === "read-shape")?.members ?? [];
  expect(members.map((member) => [member.label, member.cells["shape"]?.value])).toEqual([
    ["useAliased", "ladder"],
    ["useNamespaced", "background"],
    ["useSome", "ladder"],
    ["useFirst", "ladder"],
    ["useData", "background"],
  ]);
});

test("a label map wrapped in as const or satisfies is one copy of the same keyed map", ({ scratch }) => {
  const root = plantDir(scratch, "wrapped-maps");
  plant(root, {
    "lib/one.ts": 'export const PHASE_LABELS = { draft: "Draft", live: "Live" } as const;',
    "lib/two.ts": 'export const PHASE_LABEL = { draft: "Draft", live: "Live" } satisfies Record<string, string>;',
  });
  const groups = analyse(root, [], null).duplicates;
  expect(groups.map((group) => [group.keys, group.copies.map((copy) => copy.name), group.identical])).toEqual([
    [["draft", "live"], ["PHASE_LABELS", "PHASE_LABEL"], true],
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

test("a spread of object literals writes its axes, and a spread the syntax cannot read writes nothing, because the lint rule keeps it free of axes", ({
  scratch,
}) => {
  const root = plantDir(scratch, "variant-spreads");
  plant(root, {
    "components/spreads.tsx": [
      'import { Button } from "@orb/ui/button";',
      'const LOOK = { size: "md" } as const;',
      "export const A = ({ flag, rest }) => (",
      "  <>",
      '    <Button {...(flag ? { variant: "ghost" } : {})} />',
      "    <Button {...LOOK} />",
      "  </>",
      ");",
      "export const B = ({ rest }) => <Button {...rest} />;",
    ].join("\n"),
  });
  const axes = analyse(root, [], null).composition.variants.axes;
  const axis = (name: string): (typeof axes)[number] | undefined => axes.find((entry) => entry.axis === name);
  const resolved = (name: string, value: string): number | undefined => axis(name)?.values.find((entry) => entry.value === value)?.resolved;
  expect(resolved("variant", "ghost")).toBe(1);
  expect(resolved("size", "md")).toBe(1);
  expect(axis("variant")?.unresolved).toEqual({});
  expect(axis("size")?.unresolved).toEqual({});
});

test("the skeleton cohorts hold list panes and context bodies, not the transcript, the host or the wiring file", () => {
  const feature = "packages/client/src/features";
  const listSlots = new Set([`${feature}/plugin/surfaces/extensions-switcher-surface.tsx`]);
  expect(skeletonCohortOf(`${feature}/plugin/surfaces/extensions-switcher-surface.tsx`, listSlots)).toBe("surface:list");
  expect(skeletonCohortOf(`${feature}/chat/surfaces/message-list-surface.tsx`, listSlots)).toBe("surface:other");
  expect(skeletonCohortOf(`${feature}/regex/components/regex-context-body.tsx`, listSlots)).toBe("context-tab");
  expect(skeletonCohortOf(`${feature}/refinery/components/context-tabs.tsx`, listSlots)).toBe("context-tab");
  expect(skeletonCohortOf(`${feature}/app-shell/components/context-tabs-panel.tsx`, listSlots)).toBeNull();
  expect(skeletonCohortOf(`${feature}/refinery/components/refinery-context-tabs.tsx`, listSlots)).toBeNull();
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

test("a failed-state mark, a toast that stands down and a catch that sets local state read as the failure surface they are", ({ scratch }) => {
  const root = plantDir(scratch, "feedback-surfaces");
  plant(root, {
    "hooks/use-mutations.ts": [
      'export const useMarked = createEntityMutation<A, B>({ errorToast: "Could not save", busDriven: true });',
      'export const useSplit = createEntityMutation<A, B>({ errorToast: (error) => (isCoded(error) ? null : "Could not save"), busDriven: true });',
      "export const useCaught = createEntityMutation<A, B>({ busDriven: true });",
      'export const useCaughtAndToasted = createEntityMutation<A, B>({ errorToast: "Could not save", busDriven: true });',
    ].join("\n"),
    "components/consumers.tsx": [
      'import { useCaught, useCaughtAndToasted, useMarked, useSplit } from "../hooks/use-mutations.ts";',
      "export const Marked = ({ trpc, invalidation }) => {",
      "  const save = useMarked({ trpc, invalidation });",
      "  useReportSaveStatus(id, saveStateOf(save.isPending, save.error !== null));",
      "  return null;",
      "};",
      "export const Split = ({ trpc, invalidation }) => {",
      "  const save = useSplit({ trpc, invalidation });",
      "  return save.error === null ? null : <p>coded</p>;",
      "};",
      "export const Caught = ({ trpc, invalidation }) => {",
      "  const save = useCaught({ trpc, invalidation });",
      "  const [failure, setFailure] = useState(null);",
      '  const run = async () => { try { await save.mutateAsync({}); } catch { setFailure("no"); } };',
      "  return <p>{failure}</p>;",
      "};",
      "export const CaughtAndToasted = ({ trpc, invalidation }) => {",
      "  const save = useCaughtAndToasted({ trpc, invalidation });",
      "  const [failure, setFailure] = useState(null);",
      '  const run = async () => { try { await save.mutateAsync({}); } catch { setFailure("no"); } };',
      "  return <p>{failure}</p>;",
      "};",
    ].join("\n"),
  });
  const feedback = analyse(root, [], null).cohorts.find((entry) => entry.name === "feedback")?.members ?? [];
  expect(feedback.map((member) => [member.label, member.cells["failure"]?.value])).toEqual([
    ["useMarked", "toast"],
    ["useSplit", "toast"],
    ["useCaught", "inline"],
    ["useCaughtAndToasted", "toast+inline"],
  ]);
});

test("mutation failure follows the called local callback to its feedback surface", ({ scratch }) => {
  const root = plantDir(scratch, "feedback-local-callback");
  plant(root, {
    "hooks/use-save.ts": "export const useSave = createEntityMutation({ failureShownInline: true });",
    "components/consumer.tsx": [
      'import { useSave } from "../hooks/use-save.ts";',
      "function Editor() {",
      "  const update = useSave(deps);",
      "  const add = useSave(deps);",
      "  const remove = useSave(deps);",
      "  const report = (err) => setFailure(err);",
      "  const submit = () => update.mutateAsync().catch(err => report(err));",
      "  const create = () => add.mutate({}, { onError: report });",
      "  function discard(report) { return remove.mutateAsync().catch(report); }",
      "  return <Actions submit={submit} create={create} discard={discard} />;",
      "}",
    ].join("\n"),
  });
  const members = analyse(root, [], null).cohorts.find((cohort) => cohort.name === "feedback")?.members ?? [];
  expect(members.map((member) => member.cells["failure"]?.value)).toEqual(["inline", "inline", "none"]);
});

test("a background mutation reads as its log, and an inline-class mutation is inline only where its consumer says the failure or rethrows into a confirm", ({
  scratch,
}) => {
  const root = plantDir(scratch, "feedback-classes");
  plant(root, {
    "hooks/use-classes.ts": [
      'export const useSweep = createEntityMutation<A, B>({ backgroundFailure: "The sweep failed.", busDriven: true });',
      'export const useAsk = createEntityMutation<A, B>({ failureShownInline: "the plan line", busDriven: true });',
      'export const useConfirm = createEntityMutation<A, B>({ failureShownInline: "the confirm alert", busDriven: true });',
      'export const useMute = createEntityMutation<A, B>({ failureShownInline: "a line nobody renders", busDriven: true });',
      'export const useClick = createEntityMutation<A, B>({ failureShownInline: "a rethrow nobody renders", busDriven: true });',
      'export const useChain = createEntityMutation<A, B>({ failureShownInline: "the row menu confirm alert", busDriven: true });',
    ].join("\n"),
    "components/classes.tsx": [
      'import { useAsk, useChain, useClick, useConfirm, useMute, useSweep } from "../hooks/use-classes.ts";',
      "export const Sweep = (d) => {",
      "  const sweep = useSweep(d);",
      "  return null;",
      "};",
      "export const Ask = (d) => {",
      "  const ask = useAsk(d);",
      "  return ask.error === null ? null : <p>failed</p>;",
      "};",
      "export const Confirm = (d) => {",
      "  const confirm = useConfirm(d);",
      '  const run = async () => { try { await confirm.mutateAsync({}); } catch (error) { setPhase("idle"); throw error; } };',
      "  return <DestructiveAction onConfirm={() => run(1)} />;",
      "};",
      "export const Mute = (d) => {",
      "  const mute = useMute(d);",
      "  return null;",
      "};",
      "export const Click = (d) => {",
      "  const click = useClick(d);",
      '  const run = async () => { try { await click.mutateAsync({}); } catch (error) { setPhase("idle"); throw error; } };',
      "  return <button onClick={run} />;",
      "};",
      "export const Chain = (d) => {",
      "  const chain = useChain(d);",
      "  const remove = () => chain.mutateAsync({}).catch((error) => { throw error; });",
      "  return <RowActionsMenu destructive={{ onConfirm: remove }} />;",
      "};",
    ].join("\n"),
  });
  const facts = analyse(root, [], null);
  const feedback = facts.cohorts.find((entry) => entry.name === "feedback")?.members ?? [];
  expect(feedback.map((member) => [member.label, member.cells["failure"]?.value])).toEqual([
    ["useSweep", "log"],
    ["useAsk", "inline"],
    ["useConfirm", "inline"],
    ["useMute", "none"],
    ["useClick", "none"],
    ["useChain", "inline"],
  ]);
  const mutations = facts.cohorts.find((entry) => entry.name === "mutation")?.members ?? [];
  expect(mutations.map((member) => member.cells["failure"]?.value)).toEqual(["background", "inline", "inline", "inline", "inline", "inline"]);
});

test("a toast-class consumer that states the failure is a defect unless its call declares the line, and a confirm that awaits the settle states it", ({
  scratch,
}) => {
  const root = plantDir(scratch, "feedback-per-call");
  plant(root, {
    "hooks/use-save.ts": 'export const useSave = createEntityMutation<A, B>({ errorToast: "Save failed.", busDriven: true });',
    "components/save.tsx": [
      'import { useSave } from "../hooks/use-save.ts";',
      "export const Declared = (d) => {",
      '  const save = useSave({ ...d, failureShownInline: "the save line" });',
      "  return save.error === null ? null : <p>failed</p>;",
      "};",
      "export const DeclaredSilent = (d) => {",
      '  const save = useSave({ ...d, failureShownInline: "a line nobody renders" });',
      "  return null;",
      "};",
      "export const Both = (d) => {",
      "  const save = useSave(d);",
      "  return save.error === null ? null : <p>failed</p>;",
      "};",
      "export const Confirm = (d) => {",
      '  const save = useSave({ ...d, failureShownInline: "the confirm alert" });',
      "  const onConfirm = async () => { await save.mutateAsync({}); close(); };",
      "  return <ConfirmDialog onConfirm={onConfirm} />;",
      "};",
      "export const ConfirmUndeclared = (d) => {",
      "  const save = useSave(d);",
      "  return <DestructiveAction onConfirm={() => save.mutateAsync({}).then(() => undefined)} />;",
      "};",
      "export const Tidy = (d) => {",
      "  const save = useSave(d);",
      "  const run = () => save.mutate({}, { onError: (error) => { if (gone(error)) { retire(); } } });",
      "  return null;",
      "};",
      "export const MutateInTry = (d) => {",
      "  const save = useSave(d);",
      '  const run = () => { try { save.mutate({}); } catch { notify.error("no"); } };',
      "  return null;",
      "};",
    ].join("\n"),
  });
  const feedback = analyse(root, [], null).cohorts.find((entry) => entry.name === "feedback");
  expect(feedback?.members.map((member) => [member.cells["failure"]?.line, member.cells["failure"]?.value])).toEqual([
    [3, "inline"],
    [7, "none"],
    [11, "toast+inline"],
    [15, "inline"],
    [20, "toast+inline"],
    [24, "toast"],
    [29, "toast"],
  ]);
  expect(feedback?.defects).toEqual({ failure: ["none", "toast+inline"], success: ["toast"] });
});

test("a commit handed to the shared avatar control is a rejection it renders on its line, and an unrelated callback prop is not", ({ scratch }) => {
  const root = plantDir(scratch, "feedback-avatar-commit");
  plant(root, {
    "hooks/use-save.ts": 'export const useSave = createEntityMutation<A, B>({ errorToast: "Save failed.", busDriven: true });',
    "components/host.tsx": [
      'import { useSave } from "../hooks/use-save.ts";',
      "export const Host = (d) => {",
      '  const save = useSave({ ...d, failureShownInline: "the control line" });',
      "  return useAvatarUpload({ commit: (stored) => save.mutateAsync({ id: stored.id }) });",
      "};",
      "export const Silent = (d) => {",
      '  const save = useSave({ ...d, failureShownInline: "a line nobody renders" });',
      "  return useOther({ run: (stored) => save.mutateAsync({ id: stored.id }) });",
      "};",
    ].join("\n"),
  });
  const feedback = analyse(root, [], null).cohorts.find((entry) => entry.name === "feedback");
  expect(feedback?.members.map((member) => [member.cells["failure"]?.line, member.cells["failure"]?.value])).toEqual([
    [3, "inline"],
    [7, "none"],
  ]);
});

test("a toast that only takes null as an argument still toasts, a setter that is not a failure says nothing, and a form submit's catch is the failure surface", ({
  scratch,
}) => {
  const root = plantDir(scratch, "feedback-false-cases");
  plant(root, {
    "hooks/use-more.ts": [
      "export const useNullArg = createEntityMutation<A, B>({ errorToast: (e) => describe(e, null), busDriven: true });",
      "export const useCloser = createEntityMutation<A, B>({ busDriven: true });",
      "export const useForm = createEntityMutation<A, B>({ busDriven: true });",
      "export const useOther = createEntityMutation<A, B>({ busDriven: true });",
    ].join("\n"),
    "components/more.tsx": [
      'import { useCloser, useForm, useNullArg, useOther } from "../hooks/use-more.ts";',
      "export const NullArg = (d) => {",
      "  const save = useNullArg(d);",
      "  return save.error === null ? null : <p>x</p>;",
      "};",
      "export const Closer = (d) => {",
      "  const save = useCloser(d);",
      "  const [open, setOpen] = useState(true);",
      "  const run = async () => { try { await save.mutateAsync({}); } catch { setOpen(false); } };",
      "  return null;",
      "};",
      "export const Unrelated = (d) => {",
      "  const save = useOther(d);",
      '  form.handleSubmit().catch(() => notify.error("no"));',
      "  return null;",
      "};",
      "export const Form = (d) => {",
      "  const save = useForm(d);",
      "  const run = () => save.mutate({});",
      '  form.handleSubmit().catch(() => notify.error("no"));',
      "  return null;",
      "};",
    ].join("\n"),
  });
  const feedback = analyse(root, [], null).cohorts.find((entry) => entry.name === "feedback")?.members ?? [];
  expect(feedback.map((member) => [member.label, member.cells["failure"]?.value])).toEqual([
    ["useNullArg", "toast+inline"],
    ["useCloser", "none"],
    ["useOther", "none"],
    ["useForm", "inline"],
  ]);
});

test("a spread with a computed key or a getter leaves its door's axes unresolved, not zero", ({ scratch }) => {
  const root = plantDir(scratch, "variant-spread-keys");
  plant(root, {
    "components/keys.tsx": [
      'import { Button } from "@orb/ui/button";',
      'const KEY = "variant";',
      'export const A = () => <Button {...{ [KEY]: "ghost" }} />;',
      'export const B = () => <Button {...{ get variant() { return "ghost"; } }} />;',
    ].join("\n"),
  });
  const variant = analyse(root, [], null).composition.variants.axes.find((entry) => entry.axis === "variant");
  expect(variant?.unresolved).toEqual({ "spread with a computed key": 1, "spread with a getter or method": 1 });
});

test("a Track carrying a ui element writes that element's axes", ({ scratch }) => {
  const root = plantDir(scratch, "variant-track");
  plant(root, {
    "components/carried.tsx": [
      'import { Button } from "@orb/ui/button";',
      'import { Track } from "../lib/chat-track.tsx";',
      'export const A = () => <Track of={Button} track="chat" variant="ghost" />;',
    ].join("\n"),
  });
  const variant = analyse(root, [], null).composition.variants.axes.find((entry) => entry.door === "button" && entry.axis === "variant");
  expect(variant?.values.find((value) => value.value === "ghost")?.direct).toBe(1);
});

test("a door that renders another door's core writes that door's axes", ({ scratch }) => {
  const root = plantDir(scratch, "variant-core");
  plantFile(
    root,
    "packages/ui/package.json",
    JSON.stringify({ exports: { "./button": "./src/primitives/button/index.ts", "./inline-action": "./src/primitives/inline-action/index.ts" } }),
  );
  plantTheme(root, THEME);
  plantFile(root, "packages/ui/src/primitives/button/variants.ts", BUTTON_VARIANTS);
  plantFile(
    root,
    "packages/ui/src/primitives/inline-action/inline-action.tsx",
    'import { ButtonCore } from "../button/core.tsx";\nexport const InlineAction = ButtonCore;',
  );
  plantFile(
    root,
    `${FEATURE}/components/inline.tsx`,
    'import { InlineAction } from "@orb/ui/inline-action";\nexport const A = () => <InlineAction variant="link" />;',
  );
  const variant = analyse(root, [], null).composition.variants.axes.find((entry) => entry.door === "button" && entry.axis === "variant");
  expect(variant?.values.find((value) => value.value === "link")?.direct).toBe(1);
});

test("a section's list boundary is the shell, the boundary or none", ({ scratch }) => {
  const root = plantDir(scratch, "structure");
  plant(root, {
    "surfaces/a-list-surface.tsx": shell("A"),
    "lib/probe-section.tsx": listSlot("A"),
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

test("a success toast on a mutation's own success path is a defect unless a ruling names where it lands out of sight", ({ scratch }) => {
  const root = plantDir(scratch, "feedback-success");
  const hooks = [
    'export const useSave = createEntityMutation<A, B>({ errorToast: "Save failed.", busDriven: true });',
    'export const useDrop = createEntityMutation<A, B>({ errorToast: "Drop failed.", busDriven: true });',
    'export const useSetChatBackground = createEntityMutation<A, B>({ errorToast: "No.", busDriven: true });',
  ].join("\n");
  plant(root, {
    "hooks/use-save.ts": hooks,
    "components/save.tsx": [
      'import { useDrop, useSave } from "../hooks/use-save.ts";',
      "export const Handler = (d) => {",
      "  const save = useSave(d);",
      "  const drop = useDrop(d);",
      '  const run = () => save.mutate({}, { onSuccess: () => notify.success("Saved.") });',
      "  return null;",
      "};",
      "export const Awaited = (d) => {",
      "  const save = useSave(d);",
      "  const toast = useToastManager();",
      '  const run = async () => { try { await save.mutateAsync({}); } catch { toast.add({ title: "No." }); return; } toast.add({ title: "Saved." }); };',
      "  return null;",
      "};",
      "export const Chained = (d) => {",
      "  const save = useSave(d);",
      "  const drop = useDrop(d);",
      "  const later = async () => { await drop.mutateAsync({}); };",
      '  const run = () => save.mutateAsync({}).then(() => undefined).catch(() => notify.success("never a success"));',
      '  const other = () => { notify.success("not on a mutation path"); };',
      "  return null;",
      "};",
    ].join("\n"),
  });
  plantFile(
    root,
    "packages/client/src/features/imagery/components/image-detail-body.tsx",
    [
      'import { useSetChatBackground } from "../../probe/hooks/use-save.ts";',
      "export const Body = (d) => {",
      "  const set = useSetChatBackground(d);",
      '  const run = () => set.mutateAsync({}).then(() => notify.success("Set as chat background"));',
      "  return null;",
      "};",
    ].join("\n"),
  );
  const facts = analyse(root, [], null);
  const feedback = facts.cohorts.find((entry) => entry.name === "feedback");
  expect(feedback?.members.map((member) => [member.path.split("/").at(-1), member.label, member.cells["success"]?.value])).toEqual([
    ["image-detail-body.tsx", "useSetChatBackground", "toast"],
    ["save.tsx", "useSave", "toast"],
    // The onSuccess beside it is the cohort's callback reading; the toast in that handler belongs to the other hook.
    ["save.tsx", "useDrop", "callback"],
    ["save.tsx", "useSave", "toast"],
    ["save.tsx", "useSave", "none"],
    ["save.tsx", "useDrop", "none"],
    // Neither toast below sits on a mutation's success path, so no consumer owns them: each is a member of its own.
    ["save.tsx", "run", "toast"],
    ["save.tsx", "other", "toast"],
  ]);
  const success = facts.comparisons.find((entry) => entry.cohort === "feedback" && entry.column === "success");
  expect(success?.defects.map((defect) => defect.at)).toEqual([
    `${FEATURE}/components/save.tsx:3`,
    `${FEATURE}/components/save.tsx:9`,
    `${FEATURE}/components/save.tsx:18`,
    `${FEATURE}/components/save.tsx:19`,
  ]);
  expect(success?.kept.map((kept) => kept.at)).toEqual(["packages/client/src/features/imagery/components/image-detail-body.tsx:3"]);
});

test("a success toast no mutation's success path owns is a feedback member too, a defect unless a ruling names where it lands out of sight", ({ scratch }) => {
  const root = plantDir(scratch, "feedback-unowned-success");
  plant(root, {
    "hooks/use-save.ts": 'export const useSave = createEntityMutation<A, B>({ errorToast: "Save failed.", busDriven: true });',
    "hooks/use-import.ts": [
      'import { useSave } from "./use-save.ts";',
      "export function useImport(d) {",
      "  const save = useSave(d);",
      '  const finish = () => { notify.success("Import complete."); };',
      '  const owned = () => save.mutate({}, { onSuccess: () => notify.success("Saved.") });',
      "  return { finish, owned };",
      "}",
    ].join("\n"),
    "lib/copy-notice.ts": 'export function copied() {\n  notify.success("Copied.");\n}',
    "lib/other-notice.ts": 'export function told() {\n  notify.warn("Careful.");\n}',
  });
  plantFile(root, "packages/client/src/lib/copy-with-notice.ts", 'export function copyWithNotice() {\n  notify.success("Copied to the clipboard.");\n}');
  const feedback = analyse(root, [], null).cohorts.find((entry) => entry.name === "feedback");
  expect(
    feedback?.members.map((member) => [member.path.split("/").at(-1), member.label, member.cells["success"]?.value, member.cells["failure"]?.value]),
  ).toEqual([
    ["use-import.ts", "useSave", "toast", "toast"],
    ["use-import.ts", "finish", "toast", "not a mutation"],
    ["copy-notice.ts", "copied", "toast", "not a mutation"],
    ["copy-with-notice.ts", "copyWithNotice", "toast", "not a mutation"],
  ]);
});

test("a computed notify channel may be a success: it is a member on a mutation's success path or on its own, while a literal channel that is not success is none", ({
  scratch,
}) => {
  const root = plantDir(scratch, "feedback-computed-channel");
  plant(root, {
    "hooks/use-save.ts": 'export const useSave = createEntityMutation<A, B>({ errorToast: "Save failed.", busDriven: true });',
    "components/run.tsx": [
      'import { useSave } from "../hooks/use-save.ts";',
      "export const Row = (d) => {",
      "  const save = useSave(d);",
      "  const run = () => save.mutateAsync({}).then((result) => { const notice = noticeOf(result); notify[notice.channel](notice.line); });",
      "  return null;",
      "};",
      "export function Import(result) {",
      "  const notice = importNotice(result);",
      "  notify[notice.kind](notice.message);",
      "}",
      "export function Warned() {",
      '  notify["warn"]("Careful.");',
      '  notify.warn("Careful.");',
      "}",
      "export function Literal() {",
      '  notify["success"]("Saved.");',
      "}",
    ].join("\n"),
  });
  const feedback = analyse(root, [], null).cohorts.find((entry) => entry.name === "feedback");
  expect(
    feedback?.members.map((member) => [member.path.split("/").at(-1), member.label, member.cells["success"]?.value, member.cells["failure"]?.value]),
  ).toEqual([
    ["run.tsx", "useSave", "toast", "toast"],
    ["run.tsx", "Import", "toast", "not a mutation"],
    ["run.tsx", "Literal", "toast", "not a mutation"],
  ]);
});

test("a caps-voiced Text whose words are a sentence or a label with a gloss is prose; a label, another voice and a Chip's label are not", ({ scratch }) => {
  const root = plantDir(scratch, "caps-prose");
  plant(root, {
    "components/chip.tsx": 'import { Text } from "@orb/ui/text";\nexport function Chip({ children }) {\n  return <Text voice="kicker">{children}</Text>;\n}',
    "components/other-chip.tsx": "export function Chip({ children }) {\n  return <span>{children}</span>;\n}",
    "components/bands.tsx": [
      'import { Text } from "@orb/ui/text";',
      'import { Chip } from "./chip.tsx";',
      "export const A = ({ x }) => (",
      "  <>",
      '    <Text voice="kicker">Delivery path</Text>',
      '    <Text voice="kicker">Changed since the session started</Text>',
      '    <Text voice="body">Changed since the session started</Text>',
      '    <Text voice="kicker">Hidden channels: host only</Text>',
      '    <Text voice="kicker">{x}</Text>',
      "    <Chip>Fields in this rewrite</Chip>",
      "    <Chip>The same renderer every run uses</Chip>",
      "  </>",
      ");",
    ].join("\n"),
    "components/elsewhere.tsx": 'import { Chip } from "./other-chip.tsx";\nexport const B = () => <Chip>A sentence that is not in a caps voice here</Chip>;',
  });
  plantFile(root, "packages/ui/package.json", JSON.stringify({ exports: { "./text": "./src/primitives/text/index.ts" } }));
  plantFile(
    root,
    "packages/ui/src/primitives/text/variants.ts",
    'export const textVariants = tv({ variants: { voice: { kicker: "text-micro uppercase", body: "text-body" } } });',
  );
  plantFile(
    root,
    "packages/ui/src/primitives/text/text.tsx",
    "export function Text({ voice, className }) {\n  return <p className={textVariants({ voice, className })} />;\n}",
  );
  const caps = analyse(root, [], null).cohorts.find((entry) => entry.name === "caps-voice");
  expect(caps?.members.map((member) => [member.label, member.cells["prose"]?.value])).toEqual([
    ["Delivery path", "label"],
    ["Changed since the session started", "prose"],
    ["Hidden channels: host only", "prose"],
    ['<Text voice="kicker">{x}</Text>', "dynamic"],
    ["Fields in this rewrite (via Chip)", "label"],
    ["The same renderer every run uses (via Chip)", "prose"],
  ]);
  expect(caps?.defects?.["prose"]).toEqual(["prose"]);
});

test("a chip's wire is literal, a lookup, a call, or a bare read that may be a raw wire value", ({ scratch }) => {
  const root = plantDir(scratch, "chip-wire");
  plant(root, {
    "components/chips.tsx": [
      'import { Badge } from "@orb/ui/badge";',
      'const WORDS = { a: "Active", b: "Paused" };',
      "export const A = ({ job, kind, flag }) => {",
      "  const word = WORDS[kind];",
      "  const raw = job.status;",
      "  return (",
      "    <>",
      "      <Badge>Active</Badge>",
      "      <Badge>{WORDS[kind]}</Badge>",
      "      <Badge>{word}</Badge>",
      "      <Badge>{raw}</Badge>",
      "      <Badge>{job.status}</Badge>",
      "      <Badge>{describe(kind)}</Badge>",
      '      <Badge>{flag ? "On" : kind}</Badge>',
      "    </>",
      "  );",
      "};",
    ].join("\n"),
  });
  const chips = analyse(root, [], null).cohorts.find((entry) => entry.name === "copy:chip");
  expect(chips?.members.map((member) => [member.label, member.cells["wire"]?.value])).toEqual([
    ["Active", "literal"],
    ["{WORDS[kind]}", "lookup"],
    ["{word}", "lookup"],
    ["{raw}", "bare"],
    ["{job.status}", "bare"],
    ["{describe(kind)}", "call"],
    ['{flag ? "On" : kind}', "bare"],
  ]);
  expect(chips?.defects?.["wire"]).toEqual(["bare"]);
});

test("a chip printing a wire spelling a display map has a word for is a raw wire; an authored value and the word are not", ({ scratch }) => {
  const root = plantDir(scratch, "chip-raw-wire");
  plant(root, {
    "lib/verdict.ts": [
      'import type { Verdict, Stage } from "@orb/contracts/probe";',
      'export const VERDICT_WORD: Record<Verdict, string> = { ACCEPT: "Accept", REGRESSION: "Regression" };',
      'export const STAGE_CHIP: Record<Stage, { readonly word: string }> = { scoring: { word: "Scoring" } };',
    ].join("\n"),
    "components/verdict-chips.tsx": [
      'import type { Verdict } from "@orb/contracts/probe";',
      'import { Badge } from "@orb/ui/badge";',
      'import { STAGE_CHIP, VERDICT_WORD } from "../lib/verdict.ts";',
      "export const A = ({ verdict, run, field }: { readonly verdict: Verdict; readonly run: Run; readonly field: Field }) => (",
      "  <>",
      "    <Badge>ACCEPT</Badge>",
      "    <Badge>{verdict}</Badge>",
      "    <Badge>{run.stage}</Badge>",
      "    <Badge>{STAGE_CHIP[run.stage].word}</Badge>",
      "    <Badge>{VERDICT_WORD[verdict]}</Badge>",
      "    <Badge>Accept</Badge>",
      "    <Badge>{field.value}</Badge>",
      "  </>",
      ");",
    ].join("\n"),
  });
  const chips = analyse(root, [], null).cohorts.find((entry) => entry.name === "copy:chip");
  expect(chips?.members.map((member) => [member.label, member.cells["rawWire"]?.value])).toEqual([
    ["ACCEPT", "wire spelling"],
    ["{verdict}", "wire read"],
    ["{run.stage}", "wire read"],
    ["{STAGE_CHIP[run.stage].word}", "none"],
    ["{VERDICT_WORD[verdict]}", "none"],
    ["Accept", "none"],
    ["{field.value}", "none"],
  ]);
  expect(chips?.defects?.["rawWire"]).toEqual(["wire spelling", "wire read"]);
});

test("a declared axis built from a shared scale, a spread of one, or a call over one is declared; one the syntax cannot open is listed", ({ scratch }) => {
  const root = plantDir(scratch, "declared-scales");
  plantFile(root, "packages/ui/package.json", JSON.stringify({ exports: { "./badge": "./src/primitives/badge/index.ts" } }));
  plantTheme(root, THEME);
  plantFile(root, "packages/ui/src/lib/scales.ts", 'export const TONE = { primary: "", neutral: "" } as const;\nexport const GAP = { sm: "a", md: "b" };');
  plantFile(
    root,
    "packages/ui/src/primitives/badge/variants.ts",
    [
      'import { GAP, TONE } from "../../lib/scales.ts";',
      "const LOCAL = { solid: 1 } as const;",
      "const wrap = (map) => map;",
      "export const badgeVariants = tv({",
      "  variants: {",
      "    tone: TONE,",
      "    gap: wrap(GAP),",
      "    look: { ...LOCAL, ghost: 2 },",
      "    opaque: pick(),",
      "  },",
      "});",
    ].join("\n"),
  );
  plantFile(root, `${FEATURE}/components/x.tsx`, 'import { Badge } from "@orb/ui/badge";\nexport const A = () => <Badge tone="primary" />;');
  const report = analyse(root, [], null).composition.variants;
  const values = (axis: string): readonly string[] => report.axes.find((entry) => entry.axis === axis)?.values.map((entry) => entry.value) ?? [];
  expect(values("tone")).toEqual(["primary", "neutral"]);
  expect(values("gap")).toEqual(["sm", "md"]);
  expect(values("look")).toEqual(["solid", "ghost"]);
  expect(report.unreadAxes).toEqual(["badge.opaque"]);
});
