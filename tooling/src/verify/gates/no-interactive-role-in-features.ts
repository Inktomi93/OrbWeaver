// Gate: no-interactive-role-in-features (UI-Gates-and-Lessons.md §8) — closes the layout-kit
// interactive-role escape hatch: `<Row>`/`<Stack>`/etc. extend ComponentProps<"div"> and spread
// {...props}, so a feature can forge an interactive element via `<Row role="button" tabIndex={0}
// onClick=…>`, dodging the compose-only className/style ban. RED: a features/**.tsx JSX `role=` whose
// value carries a banned WIDGET_ROLES literal (static or a conditional/template containing one) — never
// a structural/live-region role.
//
// NO EXEMPTION ARTIFACT (authority census C1, #1922; deleted 2026-09-12). This gate carried a `BURN_DOWN`
// `ExemptionTable` of current offenders plus a `finalize` ratchet-down arm. The table has been EMPTY since
// 2026-07-09 — the founding entry (`persona-panel-row.tsx`'s `Row role="button"`) was reworked to a
// stretched-Button overlay by the Wave 1 list-row pass and burned down the same day — so the ratchet arm
// was VACUOUS (it iterated nothing) and the `rel in BURN_DOWN` skip could never fire. Both are gone, and
// with them the `begin`/`finalize` hooks, the module-level `passSeenBurnDown` accumulator, and the
// real-tree anchor that existed only to keep the vacuous arm off conformance's synthetic projects. A
// genuine future exemption is a central reviewed grant, never a resurrected gate-local table.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { readStringConstant } from "../lib/symbol-reference.ts";

/** ARIA roles that mint an INTERACTIVE widget — a feature must reach for the matching `@orb/ui` primitive,
 *  never hand-roll one of these on a div/layout component. Structural + live-region roles are absent by
 *  design (they describe document structure, not a widget the kit shouldn't be forging). */
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

/** Every string VALUE the attribute can carry — literal texts nested anywhere in it (covers `role="button"`,
 *  `role={"button"}`, and conditional/template expressions), PLUS an identifier standing for one.
 *
 *  #1506: `role={ROLE}` with a same-file `const ROLE = "button"` is a `role="button"` the user hears, and
 *  it produced ZERO findings while `role="button"` flagged — a LITERAL-kind reader answers "not my
 *  subject" to a named constant. `readStringConstant` resolves the name; anything genuinely dynamic
 *  (a prop, a call) still comes back unreadable and is not accused. */
function literalTextsIn(attr: Node): string[] {
  const texts: string[] = [];
  for (const lit of attr.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    texts.push(lit.getLiteralText());
  }
  for (const lit of attr.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    texts.push(lit.getLiteralText());
  }
  for (const identifier of attr.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const named = readStringConstant(identifier);
    if (named !== undefined) {
      texts.push(named);
    }
  }
  return texts;
}

/** The banned widget-role literal a `role={…}` attribute carries, or undefined. */
function bannedRoleOf(attr: Node): string | undefined {
  if (!attr.isKind(SyntaxKind.JsxAttribute) || attr.getNameNode().getText() !== "role") {
    return;
  }
  return literalTextsIn(attr).find((t) => WIDGET_ROLES.has(t));
}

export const gate: GateDescriptor = {
  name: "no-interactive-role-in-features",
  docRow: "UI-Gates-and-Lessons.md §8",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "reach for the matching @orb/ui primitive (Button, list-row, Card `interactive`, menu) — never a hand-rolled widget role on a div/layout component.",
  scanRoot: (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx"),
  kinds: [SyntaxKind.JsxAttribute],
  // `_sf` is the descriptor's FIXED third-position arity (`visit(node, sf, ctx)`), not an incomplete
  // refactor: the file path was read only to key the deleted BURN_DOWN table.
  visit: (node, _sf, ctx) => {
    const role = bannedRoleOf(node);
    if (role === undefined) {
      return;
    }
    ctx.report(node, { token: `role="${role}"`, offset: 0 });
  },
  mustFlag: [
    {
      files: 'export const G = <Row role="button" tabIndex={0} />;\n',
      at: "packages/client/src/features/demo/thing.tsx",
      why: "a hand-rolled interactive role on a layout component — dodges the compose-only + raw-intrinsic belts",
    },
    {
      files: 'export const G = <Row role={"checkbox"} />;\n',
      at: "packages/client/src/features/demo/braced.tsx",
      why: "a braced string-literal widget role — still a hand-roll, flags",
    },
    {
      files: 'const ROLE = "button";\nexport const G = <Row role={ROLE} />;\n',
      at: "packages/client/src/features/demo/named.tsx",
      expect: { count: 1, token: 'role="button"' },
      why: "#1506: an identifier standing for the literal. A user meets the same forged widget, and this example produced ZERO findings while the spelled-out literal flagged",
    },
    {
      files: 'export const G = <Row role={cond ? "button" : undefined} />;\n',
      at: "packages/client/src/features/demo/conditional.tsx",
      why: "a conditional expression carrying a banned widget-role literal — still a hand-roll, flags",
    },
    {
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
      files: 'export const G = <div role="list" />;\n',
      at: "packages/client/src/features/demo/structural.tsx",
      why: "a structural role (list) stays legal — it describes document structure, not a widget",
    },
    {
      files: 'export const G = <div role="img" />;\n',
      at: "packages/client/src/features/demo/img.tsx",
      why: "the img presentation role is structural, not an interactive widget — passes",
    },
    {
      files: "export const G = (props: { role?: string }) => <Row role={props.role} />;\n",
      at: "packages/client/src/features/demo/dynamic.tsx",
      why: "#1506's NEGATIVE control: a genuinely dynamic role is UNREADABLE, and an unreadable value is never accused — the widening resolves names, it does not guess",
    },
    {
      files: 'export const G = <div data-role="button" />;\n',
      at: "packages/client/src/features/demo/data-role.tsx",
      why: "data-role is not ARIA — the attribute name must be exactly `role`; ignored, passes",
    },
    {
      files: 'export const G = <div role="button" />;\n',
      at: "packages/ui/src/primitives/list-row/list-row.tsx",
      why: "scope: a @orb/ui seal file outside features/** legally uses the widget role — not scanned, passes",
    },
  ],
};
