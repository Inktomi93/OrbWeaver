import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ruleMessages } from "./native-rule-probe.ts";

const FOCUS = "orb/surface-a11y-focus";
const SURFACE = "packages/client/src/features/x/surfaces/pane.tsx";
const TAG_HOME = "packages/client/src/features/tag/surfaces/tag-member-surface.tsx";
const BARE = "export const Pane = () => <div>content</div>;";
const MANAGED = "export const Ok = () => {\n  useLayoutEffect(() => { ref.current?.focus(); }, []);\n  return <div>content</div>;\n};";

for (const [name, source, path, count] of [
  // The retired gate's mustFlag rows, in order.
  ["no focus management", BARE, SURFACE, 1],
  [
    "a comment that names focus and a trap is not management",
    "// Focus: the anchor's <Dialog> owns it today; when this becomes a drill-down pane, call ref.focus() here.\nexport const Pane = () => <div>content</div>;",
    SURFACE,
    1,
  ],
  [
    "a focus call in an event handler is not arrival focus",
    'export function Pane(): unknown {\n  const ref = { current: null as { focus: () => void } | null };\n  return <button type="button" onClick={() => ref.current?.focus()}>go</button>;\n}',
    SURFACE,
    1,
  ],
  ["a string that spells a focus call", 'export const Pane = () => <div>{"call ref.focus() after mount"}</div>;', SURFACE, 1],
  // The retired gate's mustPass rows, in order (its waiver-marker row belonged to the marker engine).
  ["a focus call inside useLayoutEffect", MANAGED, SURFACE, 0],
  ["a Dialog root", 'import { Dialog } from "@orb/ui/dialog";\nexport const Trap = () => <Dialog>content</Dialog>;', SURFACE, 0],
  ["the ui package is not a feature surface", BARE, "packages/ui/src/primitives/pane/surfaces/pane.tsx", 0],
  ["the app-shell feature", "export const AppShell = () => <div>content</div>;", "packages/client/src/features/app-shell/surfaces/app-shell.tsx", 0],
  ["a surface file that exports no component has no position to report", 'export const PANE_TITLE = "Corpus";', SURFACE, 0],
  // Arms the lint rule adds around the same claim.
  ["a function declaration surface", "export function Pane() {\n  return <div>content</div>;\n}", SURFACE, 1],
  ["a default-exported function surface", "export default function Pane() {\n  return <div>content</div>;\n}", SURFACE, 1],
  ["a component exported through a specifier list", "const Pane = () => <div>content</div>;\nexport { Pane };", SURFACE, 1],
  ["a function exported through a specifier list", "function Pane() {\n  return <div>content</div>;\n}\nexport { Pane };", SURFACE, 1],
  ["a component exported as the default through its name", "const Pane = () => <div>content</div>;\nexport default Pane;", SURFACE, 1],
  ["an unexported helper is not the surface", "const Helper = () => <div>content</div>;\nexport const PANE_TITLE = Helper.name;", SURFACE, 0],
  ["a nested surfaces directory is still a surface", BARE, "packages/client/src/features/x/surfaces/deep/pane.tsx", 1],
  ["only the first exported component is reported", "export const A = () => <div>a</div>;\nexport const B = () => <div>b</div>;", SURFACE, 1],
  [
    "a focus call inside useEffect with a function expression",
    "export const Ok = () => {\n  useEffect(function () { ref.current.focus(); }, []);\n  return <div />;\n};",
    SURFACE,
    0,
  ],
  ["useFocusOnMount", "export const Ok = () => {\n  useFocusOnMount(ref);\n  return <div />;\n};", SURFACE, 0],
  ["a Popover", "export const Trap = () => <Popover>content</Popover>;", SURFACE, 0],
  ["a Sheet", "export const Trap = () => <Sheet>content</Sheet>;", SURFACE, 0],
  ["the topbar feature", "export const Bar = () => <div>content</div>;", "packages/client/src/features/topbar/surfaces/bar.tsx", 0],
  ["a feature component is not a surface", BARE, "packages/client/src/features/x/components/pane.tsx", 0],
  // The five ruled surfaces are reasoned homes of the rule; the same shape anywhere else is a finding.
  ["the new-chat picker home", BARE, "packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx", 0],
  ["the corpus artifact home", BARE, "packages/client/src/features/discovery/surfaces/corpus-artifact-surface.tsx", 0],
  ["the corpus home home", BARE, "packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx", 0],
  ["the corpus moment home", BARE, "packages/client/src/features/discovery/surfaces/corpus-moment-surface.tsx", 0],
  ["the tag member home", BARE, "packages/client/src/features/tag/surfaces/tag-member-surface.tsx", 0],
  ["a sibling of a home is not a home", BARE, "packages/client/src/features/tag/surfaces/tag-other-surface.tsx", 1],
  // A home that starts taking arrival focus is stale: its reason no longer holds.
  ["a home that lands focus with useFocusOnMount is stale", "export const Ok = () => {\n  useFocusOnMount(ref);\n  return <div />;\n};", TAG_HOME, 1],
  [
    "a home that mounts a Dialog is stale",
    "export const Trap = () => <Dialog>content</Dialog>;",
    "packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx",
    1,
  ],
  ["a home that exports no component still reports its stale focus", "useFocusOnMount(ref);", TAG_HOME, 1],
  [
    "a home with a focus call only in a handler is not stale",
    "export const Pane = () => <button onClick={() => ref.current?.focus()}>go</button>;",
    TAG_HOME,
    0,
  ],
] as const) {
  test(`native surface a11y focus ${name}`, { timeout: 60_000 }, async ({ repoRoot }) => {
    expect(await ruleMessages(repoRoot, FOCUS, source, path)).toHaveLength(count);
  });
}

test("native surface a11y focus reports at the exported component name", { timeout: 60_000 }, async ({ repoRoot }) => {
  const [found] = await ruleMessages(repoRoot, FOCUS, `// header\n${BARE}`, SURFACE);
  expect([found?.line, found?.column]).toEqual([2, 14]);
});
