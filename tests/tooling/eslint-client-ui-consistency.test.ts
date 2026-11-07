import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const FEATURE = "packages/client/src/features/chat/components/probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path = FEATURE): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      settings: config.settings,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: rule in config.rules ? config.rules[rule] : "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

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

const DESTRUCTIVE = "orb/destructive-needs-confirm";

test.for([
  ["a Delete button with no confirm", "<Button>Delete</Button>"],
  ["a Reset menu item with no confirm", "<MenuItem>Reset to defaults</MenuItem>"],
  ["a destructive-tone button", '<Button tone="destructive">Go</Button>'],
] as const)("%s is a finding", async ([, jsx]) => {
  expect(await findings(DESTRUCTIVE, `export const A = () => ${jsx};`)).toHaveLength(1);
});

test.for([
  ["a controlled ConfirmDialog", '<><Button>Delete</Button><ConfirmDialog title="t" open={open} onOpenChange={setOpen} /></>'],
  ["a DestructiveAction trigger", "<DestructiveAction confirm={copy} trigger={<Button>Delete</Button>} />"],
  ["an Undo action", "<><Button>Remove</Button>{notify({ action: { label: 'Undo' } })}</>"],
  ["an inline Keep step", "<Row><Button>Keep</Button><Button>Dismiss</Button></Row>"],
  ["an inline Cancel step", "<Row><Button>Cancel</Button><Button>Delete</Button></Row>"],
  ["an inline Cancel step by shared verb", "<Row><Button>{DIALOG_VERBS.cancel}</Button><Button>Delete</Button></Row>"],
  ["an inline Cancel step in a dialog close", "<Row><DialogClose render={<Button>Cancel</Button>} /><Button>Delete</Button></Row>"],
  ["an inline verb step in a dialog close", "<Row><AlertDialogClose render={<Button>{DIALOG_VERBS.cancel}</Button>} /><Button>Delete</Button></Row>"],
  ["an editing dialog", "<><FormDialog title='t' dismissLabel='Close' /><Button>Remove</Button></>"],
  ["a search clear", "<Button>Clear search</Button>"],
  ["a non-destructive verb", "<Button>Save</Button>"],
] as const)("%s is not a finding", async ([, jsx]) => {
  expect(await findings(DESTRUCTIVE, `export const A = () => ${jsx};`)).toEqual([]);
});

test("a listed exempt file passes with a bare Delete", async () => {
  expect(
    await findings(DESTRUCTIVE, "export const A = () => <Button>Remove</Button>;", "packages/client/src/features/persona/components/persona-room-block.tsx"),
  ).toEqual([]);
});

test.for(["Dialog", "DialogPopup"] as const)("a feature cannot reach the raw %s", async (part) => {
  expect(await findings("orb/dialog-via-composite", `import { ${part} } from "@orb/ui/dialog";`)).toHaveLength(1);
});

const REQUIRED_DIALOG = 'import { RequiredFormDialog } from "#components";';

test("the forced dialog is the first-run ask's alone", async () => {
  expect(await findings("orb/required-dialog-home", REQUIRED_DIALOG)).toHaveLength(1);
  expect(await findings("orb/required-dialog-home", REQUIRED_DIALOG, "packages/client/src/features/persona/anchors/first-run-persona-dialog.tsx")).toEqual([]);
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
