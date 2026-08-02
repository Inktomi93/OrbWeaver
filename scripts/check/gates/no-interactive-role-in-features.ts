// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are JSX role-attribute
// fixture snippets (role="checkbox" etc.), not secrets.
// Gate: no-interactive-role-in-features (UI-Gates-and-Lessons.md §8) — closes the layout-kit
// interactive-role escape hatch: `<Row>`/`<Stack>`/etc. extend ComponentProps<"div"> and spread
// {...props}, so a feature can forge an interactive element via `<Row role="button" tabIndex={0}
// onClick=…>`, dodging the compose-only className/style ban. RED: a features/**.tsx JSX `role=` whose
// value carries a banned WIDGET_ROLES literal (static or a conditional/template containing one) — never
// a structural/live-region role. BURN_DOWN is a both-directions ratchet (persistence-boundary.ts pattern).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** ARIA roles that mint an INTERACTIVE widget — a feature must reach for the matching @orb/ui primitive,
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

/** Current offenders → their fix owner. An allowlisted file lands here IN THE SAME COMMIT it is
 *  discovered; it is removed the moment its hand-roll is reworked to a primitive (the ratchet-down arm
 *  makes a stale entry RED, so this list can never rot). CLEAN as of 2026-07-09: the founding entry
 *  (persona-panel-row.tsx's Row role=button) was reworked to a stretched-Button overlay by the Wave 1
 *  list-row content-model pass and burned down the same day. */
const BURN_DOWN: Record<string, string> = {};

const MESSAGE =
  "hand-rolled interactive ARIA role in a feature (UI-Gates-and-Lessons.md §8) — the @orb/ui layout kit " +
  'forwards DOM props, so `<Row role="button" …>` forges a widget that dodges the compose-only + ' +
  "raw-intrinsic belts. Interactivity comes from an @orb/ui primitive (Button, list-row, Card " +
  "`interactive`, menu), never a hand-rolled widget role on a div/layout component.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "BURN_DOWN entry has NO hand-rolled interactive role any more — the offender was reworked to a " +
  "primitive (ratchet down): delete the stale row in no-interactive-role-in-features.ts: ";

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Every string/template literal text nested anywhere in the attribute's value (covers `role="button"`,
 *  `role={"button"}`, and conditional/template expressions carrying a banned literal). */
function literalTextsIn(attr: Node): string[] {
  const texts: string[] = [];
  for (const lit of attr.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    texts.push(lit.getLiteralText());
  }
  for (const lit of attr.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    texts.push(lit.getLiteralText());
  }
  return texts;
}

const GATE_SELF = "scripts/check/gates/no-interactive-role-in-features.ts";
const passSeenBurnDown = new Set<string>();

/** The banned widget-role literal a `role={…}` attribute carries, or undefined. */
function bannedRoleOf(attr: Node): string | undefined {
  if (!attr.isKind(SyntaxKind.JsxAttribute) || attr.getNameNode().getText() !== "role") {
    return;
  }
  return literalTextsIn(attr).find((t) => WIDGET_ROLES.has(t));
}

/** Real-tree anchor (GATE-AUTHORING.md §4.5): `ctx.scope.kind === "project"` is TRUE inside conformance's
 *  synthetic mini-projects too, so scope ALONE is not a guard — the stale arm below is vacuous while the
 *  table is empty, but the first row added would otherwise red this gate's own self-proof. */
const STALE_ARM_ANCHOR = "packages/ui/src/tokens/index.ts";

export const gate: GateDescriptor = {
  name: "no-interactive-role-in-features",
  docRow: "UI-Gates-and-Lessons.md §8",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "reach for the matching @orb/ui primitive (Button, list-row, Card `interactive`, menu) — never a hand-rolled widget role on a div/layout component.",
  scanRoot: (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx"),
  kinds: [SyntaxKind.JsxAttribute],
  begin: () => {
    passSeenBurnDown.clear();
  },
  visit: (node, sf, ctx) => {
    const role = bannedRoleOf(node);
    if (role === undefined) {
      return;
    }
    const rel = clientRel(sf.getFilePath());
    if (rel in BURN_DOWN) {
      passSeenBurnDown.add(rel);
      return;
    }
    ctx.report(node, { token: `role="${role}"`, offset: 0 });
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, STALE_ARM_ANCHOR)) {
      return;
    }
    for (const rel of Object.keys(BURN_DOWN)) {
      if (!passSeenBurnDown.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-interactive-role-in-features.ts`,
        });
      }
    }
  },
  // NOTE: the BURN_DOWN ratchet/stale arms are guarded to the real full tree (a synthetic conformance
  // project omits the real burn-down files) — their coverage moves to the live `pnpm check:structure`
  // run. Only the pure FLAG/PASS branches port as examples below.
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
