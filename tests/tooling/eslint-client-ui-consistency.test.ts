import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const FEATURE = "packages/client/src/features/chat/components/probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path = FEATURE): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      settings: config?.settings ?? {},
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

const DISMISS = "orb/dialog-needs-dismiss";

test.for([
  ["a form dialog with no close, cancel or submit", '<FormDialog title="A" open={true} onOpenChange={f}><Field /></FormDialog>'],
  ["a content dialog with only a confirm button", '<ContentDialog title="A" open={true} onOpenChange={f}><Button>Save</Button></ContentDialog>'],
] as const)("%s is a finding", async ([, jsx]) => {
  expect(await findings(DISMISS, `export const A = () => ${jsx};`)).toHaveLength(1);
});

test.for([
  ["a dismissLabel", '<FormDialog title="A" dismissLabel="Close"><Field /></FormDialog>'],
  ["a submit footer", '<FormDialog title="A" submit={s}><Field /></FormDialog>'],
  ["a FormSubmitButton", '<FormDialog title="A"><FormSubmitButton label="Save" /></FormDialog>'],
  ["a DialogClose", '<ContentDialog title="A"><DialogClose render={<Button>Later</Button>} /></ContentDialog>'],
  ["a Cancel button", '<ContentDialog title="A"><Button>Cancel</Button></ContentDialog>'],
  ["forwarded props", "<ContentDialog {...props} />"],
  ["a mounted Body component that owns the footer", '<FormDialog title="A"><EditorBody onDone={f} /></FormDialog>'],
  ["a built-in dismiss", '<ConfirmDialog title="A" />'],
] as const)("%s is a dismiss path", async ([, jsx]) => {
  expect(await findings(DISMISS, `export const A = () => ${jsx};`)).toEqual([]);
});

const FACTORY = "orb/mutation-factory-in-hooks-file";
const FACTORY_CALL = "export const useA = createEntityMutation({ options: (trpc) => trpc.a.mutationOptions() });";

test("a mutation factory called in a component file is a finding", async () => {
  expect(await findings(FACTORY, FACTORY_CALL, "packages/client/src/features/chat/components/probe.tsx")).toHaveLength(1);
});

test.for([
  "packages/client/src/features/chat/hooks/use-probe.ts",
  "packages/client/src/features/chat/hooks/probe-mutations.ts",
  "packages/client/src/data/probe.ts",
])("a mutation factory called in %s passes", async (path) => {
  expect(await findings(FACTORY, FACTORY_CALL, path)).toEqual([]);
});

const CLASSES = "better-tailwindcss/no-restricted-classes";

test.for(["rotate-90", "z-10", "opacity-50", "rounded-lg", "shadow-md", "translate-x-2", "border-2"])(
  "the raw paint class %s in a client class list is a finding",
  async (token) => {
    const found = await findings(CLASSES, `export const A = () => <div className="${token}" />;`);
    expect(found.some(({ message }) => message.includes("raw radius, shadow, border"))).toBe(true);
  },
);

test("a word that is not a class and a token utility pass the paint-class rule", async () => {
  const found = await findings(CLASSES, 'export const A = () => <div className="flex" data-shape="rounded" data-key="border shadow" />;');
  expect(found.filter(({ message }) => message.includes("raw radius, shadow, border"))).toEqual([]);
});

const LIBRARY_ROW = "orb/library-surface-row";
const LIST_SURFACE = "packages/client/src/features/stats/surfaces/probe-list-surface.tsx";

test("a raw ListRow in a list surface is a finding; LibraryRow and other files pass", async () => {
  expect(await findings(LIBRARY_ROW, "export const A = () => <ListRow title='a' />;", LIST_SURFACE)).toHaveLength(1);
  expect(await findings(LIBRARY_ROW, "export const A = () => <LibraryRow title='a' />;", LIST_SURFACE)).toEqual([]);
  expect(await findings(LIBRARY_ROW, "export const A = () => <ListRow title='a' />;")).toEqual([]);
});

const INTRINSIC = "orb/no-raw-interactive-intrinsics";

test.for(["label", "ul", "ol", "hr", "h2", "dialog", "table", "button"])("a raw <%s> in a feature is a finding", async (tag) => {
  expect(await findings(INTRINSIC, `export const A = () => <${tag} />;`)).toHaveLength(1);
});

test("primitives and a div pass the raw-intrinsic rule", async () => {
  expect(await findings(INTRINSIC, "export const A = () => <><Field /><Heading level={2} /><div /><span /></>;")).toEqual([]);
});

const ELLIPSIS = "orb/copy-ellipsis";

test.for([
  ["three dots in a placeholder", '<Input placeholder="Type here..." />'],
  ["three dots in text", "<Text>Loading...</Text>"],
  ["a search placeholder with no ellipsis", '<Input placeholder="Search presets" />'],
  ["a filter placeholder with no ellipsis", '<Input placeholder="Filter tags" />'],
] as const)("%s is a finding", async ([, jsx]) => {
  expect(await findings(ELLIPSIS, `export const A = () => ${jsx};`)).toHaveLength(1);
});

test("an ellipsis character and a non-search placeholder pass", async () => {
  expect(
    await findings(ELLIPSIS, 'export const A = () => <><Input placeholder="Search presets…" /><Input placeholder="Elara Vance" /><Text>Loading…</Text></>;'),
  ).toEqual([]);
});

const SINGLE_ROW = "orb/no-single-row-textarea";

test("a one-row Textarea with no grow ceiling is an Input's job", async () => {
  expect(await findings(SINGLE_ROW, "export const A = () => <Textarea rows={1} />;")).toHaveLength(1);
});

test("a one-row Textarea that names maxRows, and a multi-row one, pass", async () => {
  expect(await findings(SINGLE_ROW, "export const A = () => <><Textarea rows={1} maxRows={6} /><Textarea rows={3} /><Textarea /></>;")).toEqual([]);
});
