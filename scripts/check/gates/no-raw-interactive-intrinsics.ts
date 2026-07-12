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
import type { JsxOpeningElement, JsxSelfClosingElement, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
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

// ── SINGLE-PASS CONTRACT FORM (§1.2 — multi-kind, reference-gate shape: offender arm + finalize stale) ─
// The legacy predicate as a JsxOpeningElement + JsxSelfClosingElement subscription: a banned raw
// intrinsic (button/input/select/textarea, or <a href>) in features/** (excluding app-shell). scanRoot
// mirrors the legacy FEATURES_DIR + `.tsx` filter minus app-shell. The empty BURN_DOWN's stale arm is
// finalize-guarded to project scope (§4.4). Per-occurrence. Kept ALONGSIDE the legacy Check.
const GATE_SELF = "scripts/check/gates/no-raw-interactive-intrinsics.ts";
const passSeenBurnDown = new Set<string>();

/** The banned tag of a JSX element node, or undefined (a trailing return expression — no fall-off-end). */
function bannedTagOf(node: Node): string | undefined {
  const el =
    node.asKind(SyntaxKind.JsxOpeningElement) ?? node.asKind(SyntaxKind.JsxSelfClosingElement);
  return el !== undefined && isBannedIntrinsic(el) ? el.getTagNameNode().getText() : undefined;
}

export const gate: GateDescriptor = {
  name: "no-raw-interactive-intrinsics",
  docRow: "design-enforcement.md §3.2 (D62)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "reach for the matching @orb/ui primitive (Button, TextField, Select, TextArea, Link) — never a hand-rolled <button>/<input>/<select>/<textarea>/<a href>.",
  scanRoot: (p) =>
    p.includes("packages/client/src/features/") &&
    p.endsWith(".tsx") &&
    !p.includes("packages/client/src/features/app-shell/"),
  kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
  begin: () => {
    passSeenBurnDown.clear();
  },
  visit: (node, sf, ctx) => {
    const tag = bannedTagOf(node);
    if (tag === undefined) {
      return;
    }
    const rel = clientRel(sf.getFilePath());
    if (rel in BURN_DOWN) {
      passSeenBurnDown.add(rel);
      return;
    }
    ctx.report(node, { token: `<${tag}>`, offset: 0 });
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
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-raw-interactive-intrinsics.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'export const G = <button type="button">Go</button>;\n',
      at: "packages/client/src/features/demo/thing.tsx",
      why: "a raw <button> in a feature — interactivity must come from an @orb/ui primitive",
    },
    {
      files: 'export const G = <a href="/x">go</a>;\n',
      at: "packages/client/src/features/demo/link.tsx",
      why: "an <a> carrying href is interactive — must be an @orb/ui Link",
    },
  ],
  mustPass: [
    {
      files: "export const G = <a>anchor target</a>;\n",
      at: "packages/client/src/features/demo/anchor.tsx",
      why: "a non-interactive <a> with no href (an anchor-name target) stays legal",
    },
    {
      // biome-ignore lint/security/noSecrets: a JSX fixture snippet (a raw <button>), not a secret.
      files: 'export const G = <button type="button">Shell</button>;\n',
      at: "packages/client/src/features/app-shell/thing.tsx",
      why: "app-shell is EXEMPT (shell-tier) — out of scanRoot, so a raw button there passes",
    },
  ],
};
