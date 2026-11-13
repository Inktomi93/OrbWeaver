import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { listSlotSurfacePaths } from "../../tooling/src/eslint/index.ts";
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
  [
    "a dialog opener that deletes eagerly",
    `(() => {
    const [open, setOpen] = useState(false);
    return <><Button onClick={() => { remove(); setOpen(true); }}>Delete</Button><ConfirmDialog open={open} onOpenChange={setOpen} /></>;
  })()`,
  ],
  [
    "a dialog target obtained by deleting immediately",
    `(() => {
    const [choice, setChoice] = useState(null);
    return <><Button onClick={() => setChoice({ id: remove(row), open: true })}>Delete</Button><ConfirmDialog open={choice?.open} /></>;
  })()`,
  ],
  [
    "an unrelated file selection",
    "<><FileTrigger onFilesSelected={remove}>{({ open }) => <Button onClick={open}>Delete</Button>}</FileTrigger><ConfirmDialog open={picked !== null} /></>",
  ],
  ["a second destructive choice after Keep", "<><Button>Keep</Button><Button>Delete</Button><Button>Reset</Button></>"],
  ["a raw control beside an editing dialog", "<><FormDialog submit={save} /><Button>Remove</Button></>"],
  ["an unrelated Undo", "<><Button onClick={remove}>Remove</Button>{notify.info({ action: { label: 'Undo', onClick: restore } })}</>"],
  [
    "a different binding with the same property name",
    `(() => {
    const [open, setOpen] = useState(false);
    return <><Button onClick={() => setOpen(true)}>Remove</Button><ConfirmDialog open={other.open} /></>;
  })()`,
  ],
  ["a destructive-tone button", '<Button tone="destructive">Go</Button>'],
] as const)("%s is a finding", async ([, jsx]) => {
  expect(await findings(DESTRUCTIVE, `export const A = () => ${jsx};`)).toHaveLength(1);
});

test.for([
  [
    "a controlled confirm",
    `(() => {
    const [open, setOpen] = useState(false);
    return <><Button onClick={() => setOpen(true)}>Delete</Button><ConfirmDialog open={open} onOpenChange={setOpen} /></>;
  })()`,
  ],
  [
    "a staged object in a controlled confirm",
    `(() => {
    const [choice, setChoice] = useState(null);
    return <><Button onClick={() => setChoice({ id: row.id, open: true })}>Delete</Button><ConfirmDialog open={choice?.id === row.id && choice.open} /></>;
  })()`,
  ],
  [
    "a file picker that stages a controlled confirm",
    `(() => {
    const [file, setFile] = useState(null);
    return <><FileTrigger onFilesSelected={([first]) => setFile(first ?? null)}>{({ open }) => <Button onClick={open}>Replace</Button>}</FileTrigger><ConfirmDialog open={file !== null} /></>;
  })()`,
  ],
  ["a draft footer action", "<FormDialogPopup submit={save} footerLead={<Button>Reset</Button>} />"],
  ["a DestructiveAction trigger", "<DestructiveAction confirm={copy} trigger={<Button>Delete</Button>} />"],
  ["an Undo action", "<Button onClick={() => notify.info({ action: { label: 'Undo', onClick: restore } })}>Remove</Button>"],
  ["an inline Keep step", "<Row><Button>Keep</Button><Button>Remove</Button></Row>"],
  ["an inline Cancel step", "<Row><Button>Cancel</Button><Button>Delete</Button></Row>"],
  ["an inline Cancel step by shared verb", "<Row><Button>{DIALOG_VERBS.cancel}</Button><Button>Delete</Button></Row>"],
  ["an inline Cancel step in a dialog close", "<Row><DialogClose render={<Button>Cancel</Button>} /><Button>Delete</Button></Row>"],
  ["an inline verb step in a dialog close", "<Row><AlertDialogClose render={<Button>{DIALOG_VERBS.cancel}</Button>} /><Button>Delete</Button></Row>"],
  ["an editing dialog", "<FormDialog submit={save}><Button>Remove</Button></FormDialog>"],
  ["a search clear", "<Button>Clear search</Button>"],
  ["a non-destructive verb", "<Button>Save</Button>"],
] as const)("%s is not a finding", async ([, jsx]) => {
  expect(await findings(DESTRUCTIVE, `export const A = () => ${jsx};`)).toEqual([]);
});

test("each destructive control needs its own confirmation", async () => {
  const wrapped = '<DestructiveAction confirm={copy} onConfirm={remove} trigger={<Button tone="destructive">Delete</Button>} />';
  const bare = '<Button tone="destructive" onClick={remove}>Remove</Button>';
  const mixed = `export const A = () => <>\n${wrapped}\n${bare}\n</>;`;
  expect((await findings(DESTRUCTIVE, mixed)).map(({ line }) => line)).toEqual([3]);
  expect(await findings(DESTRUCTIVE, mixed.replace(bare, wrapped))).toEqual([]);
});

test("a listed exempt file passes with a bare Delete", async () => {
  expect(
    await findings(DESTRUCTIVE, "export const A = () => <Button>Remove</Button>;", "packages/client/src/features/persona/components/persona-room-block.tsx"),
  ).toEqual([]);
});

test.for(["Dialog", "DialogPopup"] as const)("a feature cannot reach the raw %s", async (part) => {
  expect(await findings("orb/dialog-via-composite", `import { ${part} } from "@orb/ui/dialog";`)).toHaveLength(1);
});

test("a component-tier composer cannot reach the raw dialog either; the composites that type the way out can", async () => {
  const raw = 'import { Dialog, DialogPopup } from "@orb/ui/dialog";';
  expect(await findings("orb/dialog-via-composite", raw, "packages/client/src/components/relation-manager-section.tsx")).toHaveLength(2);
  expect(await findings("orb/dialog-via-composite", raw, "packages/client/src/components/content-dialog.tsx")).toEqual([]);
});

const REQUIRED_DIALOG = 'import { RequiredFormDialog } from "#components";';

test("the forced dialog is the first-run ask's alone", async () => {
  expect(await findings("orb/required-dialog-home", REQUIRED_DIALOG)).toHaveLength(1);
  expect(await findings("orb/required-dialog-home", REQUIRED_DIALOG, "packages/client/src/features/persona/anchors/first-run-persona-dialog.tsx")).toEqual([]);
});

const LIBRARY_ROW = "orb/library-surface-row";
// The rule's population is the list-slot set, so a slotted surface named otherwise is a member and the transcript is not.
const LIST_SLOT_SURFACE = "packages/client/src/features/plugin/surfaces/extensions-switcher-surface.tsx";
const TRANSCRIPT_SURFACE = "packages/client/src/features/chat/surfaces/message-list-surface.tsx";
const RAW_ROW = "export const A = () => <ListRow title='a' />;";
// Read once at import: the scan parses every client source.
const LIST_SLOT_SURFACES = listSlotSurfacePaths(ROOT);

test("a raw ListRow in a list-slot surface is a finding; LibraryRow, the transcript and other files pass", async () => {
  expect(LIST_SLOT_SURFACES).toContain(LIST_SLOT_SURFACE);
  expect(await findings(LIBRARY_ROW, RAW_ROW, LIST_SLOT_SURFACE)).toHaveLength(1);
  expect(await findings(LIBRARY_ROW, "export const A = () => <LibraryRow title='a' />;", LIST_SLOT_SURFACE)).toEqual([]);
  expect(await findings(LIBRARY_ROW, RAW_ROW, TRANSCRIPT_SURFACE)).toEqual([]);
  expect(await findings(LIBRARY_ROW, RAW_ROW)).toEqual([]);
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
