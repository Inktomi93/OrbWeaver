// Gate: no-raw-interactive-intrinsics (design-enforcement.md §3.2, D62 — planned alongside
// no-interactive-role-in-features, whose header names both). A raw `<button>`, `<input>`, `<select>`,
// `<textarea>`, or an interactive `<a href>` in `packages/client/src/features/**` is banned regardless of
// className — interactivity in features must come from an @orb/ui primitive (Button, TextField, Select,
// TextArea, Link, …), never a bare intrinsic. `app-shell` is EXEMPT (shell-tier, per the spec table) —
// only the rest of features/** is scoped. `ui/` is where these primitives legitimately live under the
// hood, and is out of reach (this gate only walks features/**).
//
// RED: a `.tsx` file under packages/client/src/features/** (excluding app-shell/) whose JSX opens one of
// the BANNED_TAGS, or an `<a>` carrying an `href` attribute (a non-interactive `<a>` with no `href` — rare,
// e.g. an anchor-name target — stays legal).
//
// BURN_DOWN ratchet (the no-interactive-role-in-features precedent): BURN_DOWN names current offenders,
// each citing its fix owner/reason. An allowlisted file that has gone CLEAN is RED ("stale entry —
// remove it"); a NEW offender not in BURN_DOWN is RED immediately.
import type { JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, CheckContext, Violation } from "../harness.ts";

const FEATURES_DIR = "/packages/client/src/features/";
const APP_SHELL_DIR = "/packages/client/src/features/app-shell/";

const BANNED_TAGS: ReadonlySet<string> = new Set(["button", "input", "select", "textarea"]);

/** Current offenders → their fix owner/reason. See the no-interactive-role-in-features precedent for the
 *  ratchet contract (both arms). Empty — all 3 original BURN_DOWN rows (persona avatar, persona-settings
 *  backup restore, character portrait) migrated to `@orb/ui/file-trigger` (rollup-audit C3). */
const BURN_DOWN: Record<string, string> = {};

const MESSAGE =
  "raw interactive intrinsic in a feature (design-enforcement.md §3.2, D62) — interactivity in " +
  "features/** must come from an @orb/ui primitive (Button, TextField, Select, TextArea, Link, …), " +
  "never a hand-rolled <button>/<input>/<select>/<textarea>/<a href>.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "BURN_DOWN entry has NO raw interactive intrinsic any more — the offender was reworked to a " +
  "primitive (ratchet down): delete the stale row in no-raw-interactive-intrinsics.ts: ";

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Is this JSX opening/self-closing element a banned raw intrinsic (button/input/select/textarea, or an
 *  `<a>` carrying `href`)? */
function isBannedIntrinsic(el: JsxOpeningElement | JsxSelfClosingElement): boolean {
  const tag = el.getTagNameNode().getText();
  if (BANNED_TAGS.has(tag)) {
    return true;
  }
  if (tag !== "a") {
    return false;
  }
  return el
    .getAttributes()
    .some(
      (attr) =>
        attr.getKind() === SyntaxKind.JsxAttribute && attr.getFirstChild()?.getText() === "href",
    );
}

/** Lines of every banned raw-intrinsic JSX element in this file. */
function offenceLines(sf: SourceFile): number[] {
  const lines: number[] = [];
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (isBannedIntrinsic(el)) {
      lines.push(el.getStartLineNumber());
    }
  }
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (isBannedIntrinsic(el)) {
      lines.push(el.getStartLineNumber());
    }
  }
  return lines;
}

/** The offender scan: new-offender violations + which burnDown files still carry their raw intrinsic. */
function scanFeatures(
  project: CheckContext["project"],
  burnDown: Record<string, string>,
): { violations: Violation[]; seenAllowlisted: Set<string> } {
  const violations: Violation[] = [];
  const seenAllowlisted = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!(path.includes(FEATURES_DIR) && path.endsWith(".tsx")) || path.includes(APP_SHELL_DIR)) {
      continue;
    }
    const rel = clientRel(path);
    const lines = offenceLines(sf);
    if (rel in burnDown) {
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

/** The ratchet-down arm: a burnDown file that never surfaced a raw intrinsic (absent OR gone clean). */
function staleEntries(
  burnDown: Record<string, string>,
  seenAllowlisted: ReadonlySet<string>,
): Violation[] {
  return Object.keys(burnDown)
    .filter((rel) => !seenAllowlisted.has(rel))
    .map((rel) => ({
      file: "scripts/check/gates/no-raw-interactive-intrinsics.ts",
      line: 1,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-raw-interactive-intrinsics.ts`,
    }));
}

/** Factory (the createNoInteractiveRoleInFeatures precedent): the self-test drives BOTH ratchet arms with
 *  an injected registry. */
export function createNoRawInteractiveIntrinsics(burnDown: Record<string, string>): Check {
  return {
    name: "no-raw-interactive-intrinsics",
    run: ({ project }): Violation[] => {
      const { violations, seenAllowlisted } = scanFeatures(project, burnDown);
      return [...violations, ...staleEntries(burnDown, seenAllowlisted)];
    },
  };
}

export const noRawInteractiveIntrinsics: Check = createNoRawInteractiveIntrinsics(BURN_DOWN);
