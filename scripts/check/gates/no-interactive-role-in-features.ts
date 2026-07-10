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
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, CheckContext, Violation } from "../harness.ts";

const FEATURES_DIR = "/packages/client/src/features/";

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

/** Lines of every `role={…}` attribute in this file whose value carries a banned widget-role literal. */
function offenceLines(sf: SourceFile): number[] {
  const lines: number[] = [];
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== "role") {
      continue;
    }
    if (literalTextsIn(attr).some((t) => WIDGET_ROLES.has(t))) {
      lines.push(attr.getStartLineNumber());
    }
  }
  return lines;
}

/** The offender scan: new-offender violations + which burnDown files still carry their hand-roll. */
function scanFeatures(
  project: CheckContext["project"],
  burnDown: Record<string, string>,
): { violations: Violation[]; seenAllowlisted: Set<string> } {
  const violations: Violation[] = [];
  const seenAllowlisted = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!(path.includes(FEATURES_DIR) && path.endsWith(".tsx"))) {
      continue;
    }
    const rel = clientRel(path);
    const lines = offenceLines(sf);
    if (rel in burnDown) {
      // Seen WITH a hand-roll → known debt, suppressed. Seen CLEAN → NOT recorded, so the stale arm
      // fires (the ratchet-down: the owner reworked it to a primitive, remove the entry).
      if (lines.length > 0) {
        seenAllowlisted.add(rel);
      }
      continue;
    }
    for (const line of lines) {
      violations.push({ file: rel, line, message: MESSAGE });
    }
  }
  return { violations, seenAllowlisted };
}

/** The ratchet-down arm: a burnDown file that never surfaced a hand-roll (absent OR gone clean). */
function staleEntries(
  burnDown: Record<string, string>,
  seenAllowlisted: ReadonlySet<string>,
): Violation[] {
  return Object.keys(burnDown)
    .filter((rel) => !seenAllowlisted.has(rel))
    .map((rel) => ({
      file: "scripts/check/gates/no-interactive-role-in-features.ts",
      line: 1,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-interactive-role-in-features.ts`,
    }));
}

/** Factory (the createEnforcementRegistryParity precedent): the self-test drives BOTH ratchet arms
 *  with an injected registry, so they stay covered even while the LIVE `BURN_DOWN` is empty. */
export function createNoInteractiveRoleInFeatures(burnDown: Record<string, string>): Check {
  return {
    name: "no-interactive-role-in-features",
    run: ({ project }): Violation[] => {
      const { violations, seenAllowlisted } = scanFeatures(project, burnDown);
      return [...violations, ...staleEntries(burnDown, seenAllowlisted)];
    },
  };
}

export const noInteractiveRoleInFeatures: Check = createNoInteractiveRoleInFeatures(BURN_DOWN);
