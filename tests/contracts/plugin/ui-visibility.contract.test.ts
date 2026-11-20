import type { PluginBoundBoolean, PluginNodeKind, PluginSurfaceNode } from "@orb/contracts/plugin";
import {
  PLUGIN_TEXT_MAX_CHARS,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  resolvePluginNodeShown,
  resolvePluginPrimaryButton,
} from "@orb/contracts/plugin";
import { strictTwin } from "@orb/kit/zod-schema";
import { expect, test } from "@orb/testkit/node";

// One valid node of every kind, so a kind added to the vocabulary fails `tsc` here until it is given a case.
const NODE_OF_KIND: { readonly [K in PluginNodeKind]: Extract<PluginSurfaceNode, { kind: K }> } = {
  stack: { kind: "stack", children: [] },
  row: { kind: "row", children: [] },
  section: { kind: "section", kicker: "Ledger", children: [] },
  text: { kind: "text", value: "Ledger" },
  badge: { kind: "badge", text: "Ledger" },
  meter: { kind: "meter", value: 1 },
  keyValue: { kind: "keyValue", rows: [] },
  list: { kind: "list", items: [] },
  image: { kind: "image", assetFrom: { $state: "art" } },
  markdown: { kind: "markdown", value: "Ledger" },
  textField: { kind: "textField", name: "entry", label: "Entry" },
  numberField: { kind: "numberField", name: "count", label: "Count" },
  toggle: { kind: "toggle", name: "on", label: "On" },
  select: { kind: "select", name: "pick", label: "Pick", options: [] },
  slider: { kind: "slider", name: "level", label: "Level", min: 0, max: 1 },
  button: { kind: "button", actionId: "go", label: "Go" },
  confirmButton: { kind: "confirmButton", actionId: "erase", label: "Erase", confirmTitle: "Erase the ledger?" },
  grid: { kind: "grid", tilesFrom: { $state: "tiles" } },
  masterDetail: { kind: "masterDetail", stages: [{ id: "browse", kind: "browse", body: { kind: "text", value: "Ledger" } }] },
  searchBar: { kind: "searchBar", name: "q", label: "Search" },
  icon: { kind: "icon", name: "star" },
  tabs: { kind: "tabs", name: "axis", label: "Axis", options: [] },
};

const SHOWN: readonly PluginBoundBoolean[] = [true, false, { $state: "pager.visible" }];
// Each is a shape the bound-boolean grammar refuses: a number, a string, an empty path and a non-string path.
const MALFORMED: readonly unknown[] = [1, "false", { $state: "" }, { $state: 7 }];

/** The registration a static page carries, so the strict wire twin judges the same spec the host accepted. */
function pageWith(child: unknown): unknown {
  return { id: "ledger", anchor: "page", title: "Ledger", tier: "static", spec: { kind: "stack", children: [child] } };
}

const strictRegistration = strictTwin(pluginSurfaceRegistrationMetaSchema);

test("every node kind below the root keeps a literal or bound `when` through the host and strict wire parsers", () => {
  for (const node of Object.values(NODE_OF_KIND)) {
    for (const when of SHOWN) {
      const registration = pageWith({ ...node, when });
      const parsed = pluginSurfaceRegistrationMetaSchema.parse(registration);
      expect(parsed.spec).toMatchObject({ children: [{ kind: node.kind, when }] });
      expect(strictRegistration.parse(registration).spec).toMatchObject({ children: [{ kind: node.kind, when }] });
    }
  }
});

test("a malformed `when` on any node kind is refused at that node's `when`", () => {
  for (const node of Object.values(NODE_OF_KIND)) {
    for (const when of MALFORMED) {
      const result = pluginSurfaceSpecSchema.safeParse({ kind: "stack", children: [{ ...node, when }] });
      // A malformed binding object is refused at its own `$state`, one segment below `when`.
      expect(
        result.error?.issues.map((issue) => issue.path.slice(0, 3)),
        `${node.kind} with when=${JSON.stringify(when)}`,
      ).toEqual([["children", 0, "when"]]);
    }
  }
});

test("the spec root refuses a `when`, while the same node one level down keeps it", () => {
  const refused = pluginSurfaceSpecSchema.safeParse({ ...NODE_OF_KIND.text, when: false });
  expect(refused.error?.issues).toEqual([expect.objectContaining({ code: "custom", path: ["when"] })]);
  expect(pluginSurfaceSpecSchema.parse({ kind: "stack", children: [{ ...NODE_OF_KIND.text, when: false }] })).toMatchObject({
    children: [{ when: false }],
  });
});

test("a grid's empty line binds to state, and an empty line past the label bound is refused at `empty`", () => {
  const bound = { ...NODE_OF_KIND.grid, empty: { $state: "emptyLine" } };
  expect(pluginSurfaceSpecSchema.parse({ kind: "stack", children: [bound] })).toMatchObject({ children: [bound] });
  const declared = { ...NODE_OF_KIND.grid, empty: "No cards matched this search." };
  expect(pluginSurfaceSpecSchema.parse({ kind: "stack", children: [declared] })).toMatchObject({ children: [declared] });
  const overLong = pluginSurfaceSpecSchema.safeParse({ kind: "stack", children: [{ ...NODE_OF_KIND.grid, empty: "a".repeat(PLUGIN_TEXT_MAX_CHARS) }] });
  expect(new Set(overLong.error?.issues.map((issue) => JSON.stringify(issue.path)))).toEqual(new Set([JSON.stringify(["children", 0, "empty"])]));
});

test("a bound `when` hides its node only on a published false; a missing path or a non-boolean shows it", () => {
  const pager = { ...NODE_OF_KIND.row, when: { $state: "pager.visible" } };
  expect(resolvePluginNodeShown({ pager: { visible: false } }, pager)).toBe(false);
  expect(resolvePluginNodeShown({ pager: { visible: true } }, pager)).toBe(true);
  expect(resolvePluginNodeShown({}, pager)).toBe(true);
  expect(resolvePluginNodeShown({ pager: { visible: "false" } }, pager)).toBe(true);
  expect(resolvePluginNodeShown({ pager: { visible: true } }, { ...NODE_OF_KIND.row, when: false })).toBe(false);
  expect(resolvePluginNodeShown({}, NODE_OF_KIND.row)).toBe(true);
});

test("a hidden primary button cannot take the anchor's one primary from the visible one after it", () => {
  const hidden = { kind: "button", actionId: "draft", label: "Draft", variant: "primary", when: { $state: "drafting" } } as const;
  const visible = { kind: "button", actionId: "publish", label: "Publish", variant: "primary" } as const;
  const spec: PluginSurfaceNode = { kind: "stack", children: [hidden, visible] };
  expect(resolvePluginPrimaryButton(spec, "page", { drafting: false })).toEqual({ granted: visible, refused: [] });
  expect(resolvePluginPrimaryButton(spec, "page", { drafting: true })).toEqual({ granted: hidden, refused: [visible] });
});
