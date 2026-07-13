// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are JSX role-attribute
// fixture snippets (role="checkbox" etc.), not secrets.
// Gate: no-interactive-role-in-features (UI-Gates-and-Lessons.md §8) — closes the layout-kit
// interactive-role escape hatch. The compose-only biome keystone bans className/style on raw
// intrinsics in features/**, and no-raw-interactive-intrinsics (planned, D62) bans raw <button>/<input>
// there — but neither catches a hand-rolled widget minted through the @orb/ui layout kit: `<Row>`/
// `<Stack>`/etc. extend ComponentProps<"div"> and spread {...props} onto their div, so a feature can
// forge an interactive element with `<Row role="button" tabIndex={0} onClick=… className="…">`,
// dodging both belts. Interactivity in features must come from an @orb/ui primitive (Button, list-row,
// Card `interactive`, menu, …), never a hand-rolled ARIA widget role on a div/layout component. The
// @orb/ui seals themselves legally use these roles internally (list-row, card) — this gate scopes to
// packages/client/src/features/** ONLY, so those seals are out of reach.
//
// RED: a `.tsx` file under packages/client/src/features/** whose JSX assigns an INTERACTIVE (widget)
// ARIA role — the WIDGET_ROLES set below. Matches static string values (`role="button"`,
// `role={"button"}`) AND template/conditional expressions that CONTAIN a banned literal
// (`role={x ? "button" : undefined}` is still a hand-roll). `data-role` is NOT ARIA — ignored (the
// attribute NAME must be exactly `role`). Structural / live-region roles (`list`, `listitem`, `status`,
// `img`, `group`, `article`, `region`, `dialog`, `alert`, `presentation`, `toolbar`, `tabpanel`, …)
// stay legal — they describe document structure, not an interactive widget the kit shouldn't be minting.
//
// BURN-DOWN ratchet (both directions — the persistence-boundary.ts pattern): BURN_DOWN names the current
// offenders, each citing its fix owner. An allowlisted file that still hand-rolls is SUPPRESSED (known
// debt); an allowlisted file that has gone CLEAN is RED ("stale entry — remove it", ratchet down); a
// NEW offender not in BURN_DOWN is RED immediately.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

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

// ── SINGLE-PASS CONTRACT FORM (§1.2 — the reference-gate shape: offender arm + finalize stale arm) ─
// The legacy predicate as a JsxAttribute subscription: a `role={…}` attribute in a features/**.tsx whose
// value carries a banned widget-role literal. scanRoot mirrors the legacy FEATURES_DIR + `.tsx` filter.
// The empty BURN_DOWN's stale arm is finalize-guarded to project scope (§4.4). Per-occurrence (each
// offending role attribute). The offending role rides as the token.
const GATE_SELF = "scripts/check/gates/no-interactive-role-in-features.ts";
const passSeenBurnDown = new Set<string>();

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
    if (ctx.scope.kind !== "project") {
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
        "packages/client/src/features/demo/components/menuitem.tsx":
          'export const G = <Row role="menuitem" />;\n',
        "packages/client/src/features/demo/components/tab.tsx":
          'export const G = <Row role="tab" />;\n',
        "packages/client/src/features/demo/components/slider.tsx":
          'export const G = <Row role="slider" />;\n',
        "packages/client/src/features/demo/components/treeitem.tsx":
          'export const G = <Row role="treeitem" />;\n',
        "packages/client/src/features/demo/components/gridcell.tsx":
          'export const G = <Row role="gridcell" />;\n',
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
