// Interactive ARIA roles belong to UI primitives, not feature-owned layout elements.
// FAMILY: singleton; the policy owns the widget-role vocabulary and uses the common scalar reader.
// Population preserves client features TSX. Immutable aliases use canonical scalar identity rather
// than the legacy four-hop name lookup. Dynamic role values remain the explicitly tested limit.
// Legacy source:4522eee58. All ten legacy proof cases are carried; population/cut/authority replay
// is deferred by the owner's conversion-first order. The obsolete synthetic token role="value"
// becomes the exact role attribute name. The empty burn-down table was already retired.
import type { JsxAttribute } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { firstAnchor } from "../lib/caught-failure.ts";
import { readStaticAuthoredScalar } from "../lib/static-authored-value.ts";

const WIDGET_ROLES: ReadonlySet<string> = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "tab",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "combobox",
  "textbox",
  "searchbox",
  "listbox",
  "menu",
  "menubar",
  "radiogroup",
  "tablist",
  "tree",
  "treeitem",
  "grid",
  "gridcell",
  "scrollbar",
]);

const MESSAGE =
  "hand-rolled interactive ARIA role in a feature (UI-Gates-and-Lessons.md §8) — the @orb/ui layout kit " +
  'forwards DOM props, so `<Row role="button" …>` forges a widget that dodges the compose-only + ' +
  "raw-intrinsic belts. Interactivity comes from an @orb/ui primitive (Button, list-row, Card " +
  "`interactive`, menu), never a hand-rolled widget role on a div/layout component.";

export const gate = defineGate({
  id: "no-interactive-role-in-features",
  family: "no-interactive-role-in-features",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**"], ext: ["tsx"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use the matching @orb/ui primitive; an intentional exception uses @orb-waive no-interactive-role-in-features(role): <reason> on the reported role attribute.",
  create: (ctx) => {
    const roles = new Map<JsxAttribute, string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.Identifier],
          visit: (node) => {
            const attr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
            if (attr === undefined || attr.getNameNode().getText() !== "role" || roles.has(attr)) {
              return;
            }
            const value = readStaticAuthoredScalar(node);
            if (value.kind === "resolved" && typeof value.value === "string" && WIDGET_ROLES.has(value.value)) {
              roles.set(attr, value.value);
            }
          },
        },
      ],
      evaluate: () => {
        for (const [attr] of roles) {
          ctx.report.node(attr, { ...firstAnchor(attr, ["role"]), message: MESSAGE });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/client/src/features/demo/thing.tsx": 'export const G = <Row role="button" tabIndex={0} />;\n' },
      expect: { count: 1, token: "role" },
      why: "a hand-rolled interactive role on a layout component — dodges the compose-only + raw-intrinsic belts",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/demo/braced.tsx": 'export const G = <Row role={"checkbox"} />;\n' },
      expect: { count: 1, token: "role" },
      why: "a braced string-literal widget role — still a hand-roll, flags",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/demo/named.tsx": 'const ROLE = "button";\nexport const G = <Row role={ROLE} />;\n' },
      expect: { count: 1, token: "role" },
      why: "#1506: an identifier standing for the literal. A user meets the same forged widget, and this example produced ZERO findings while the spelled-out literal flagged",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/demo/conditional.tsx": 'export const G = <Row role={cond ? "button" : undefined} />;\n' },
      expect: { count: 1, token: "role" },
      why: "a conditional expression carrying a banned widget-role literal — still a hand-roll, flags",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/demo/components/menuitem.tsx": 'export const G = <Row role="menuitem" />;\n',
        "packages/client/src/features/demo/components/tab.tsx": 'export const G = <Row role="tab" />;\n',
        "packages/client/src/features/demo/components/slider.tsx": 'export const G = <Row role="slider" />;\n',
        "packages/client/src/features/demo/components/treeitem.tsx": 'export const G = <Row role="treeitem" />;\n',
        "packages/client/src/features/demo/components/gridcell.tsx": 'export const G = <Row role="gridcell" />;\n',
      },
      expect: { count: 5 },
      why: "a spread of five distinct widget roles across files — each flags",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/client/src/features/demo/structural.tsx": 'export const G = <div role="list" />;\n' },
      why: "a structural role (list) stays legal — it describes document structure, not a widget",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/demo/img.tsx": 'export const G = <div role="img" />;\n' },
      why: "the img presentation role is structural, not an interactive widget — passes",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/demo/dynamic.tsx": "export const G = (props: { role?: string }) => <Row role={props.role} />;\n" },
      why: "#1506's NEGATIVE control: a genuinely dynamic role is UNREADABLE, and an unreadable value is never accused — the widening resolves names, it does not guess",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/demo/data-role.tsx": 'export const G = <div data-role="button" />;\n' },
      why: "data-role is not ARIA — the attribute name must be exactly `role`; ignored, passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/demo/anchor.tsx": 'export const clean = <div role="list" />;',
        "packages/ui/src/primitives/list-row/list-row.tsx": 'export const G = <div role="button" />;\n',
      },
      why: "scope: a @orb/ui seal file outside features/** legally uses the widget role — not scanned, passes",
    },
  ],
});
