// Gate: no-raw-interactive-intrinsics (design-enforcement.md §3.2, D62) — a raw `<button>`, `<input>`,
// `<select>`, `<textarea>`, or an `<a href>` in packages/client/src/features/** (app-shell exempt) is
// banned regardless of className — interactivity must come from an @orb/ui primitive. RED: a `.tsx`
// file whose JSX opens a BANNED_TAG, or an `<a>` carrying `href` (an `<a>` with no `href` stays legal).
// BURN_DOWN is a both-directions ratchet (no-interactive-role-in-features precedent).
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the shell tier is SCANNED and exempted by a cited
// row plus the shared RENAME TRIPWIRE, not scoped out of scanRoot. The `.tsx` clause stays a scope decision
// (a file KIND, not a home).
import type { JsxOpeningElement, JsxSelfClosingElement, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const BANNED_TAGS: ReadonlySet<string> = new Set(["button", "input", "select", "textarea"]);

/** Current offenders → their fix owner/reason. See the no-interactive-role-in-features precedent for the
 *  ratchet contract (both arms). Empty — all 3 original BURN_DOWN rows (persona avatar, persona-settings
 *  backup restore, character portrait) migrated to `@orb/ui/file-trigger` (rollup-audit C3). */
const BURN_DOWN: ExemptionTable = {};

/** The ONE feature dir that may host a raw interactive intrinsic. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/client/src/features/app-shell/": {
    why: "the SHELL tier — it composes the app frame below the primitive layer (design-enforcement.md §3.2, D62 exempts it). Ends when the shell moves: the rename tripwire reds the row at its dead path instead of exempting a directory that no longer exists",
  },
};

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
  return el.getAttributes().some((attr) => attr.getKind() === SyntaxKind.JsxAttribute && attr.getFirstChild()?.getText() === "href");
}

// A banned raw intrinsic (button/input/select/textarea, or <a href>) in features/** (excluding
// app-shell). The empty BURN_DOWN's stale arm is finalize-guarded to project scope.
const GATE_SELF = "tooling/src/verify/gates/no-raw-interactive-intrinsics.ts";
const passSeenBurnDown = new Set<string>();

/** The banned tag of a JSX element node, or undefined (a trailing return expression — no fall-off-end). */
function bannedTagOf(node: Node): string | undefined {
  const el = node.asKind(SyntaxKind.JsxOpeningElement) ?? node.asKind(SyntaxKind.JsxSelfClosingElement);
  return el !== undefined && isBannedIntrinsic(el) ? el.getTagNameNode().getText() : undefined;
}

/** Real-tree anchor (GATE-AUTHORING.md §4.5): `ctx.scope.kind === "project"` is TRUE inside conformance's
 *  synthetic mini-projects too, so scope ALONE is not a guard — the stale arm below is vacuous while the
 *  table is empty, but the first row added would otherwise red this gate's own self-proof. */
const STALE_ARM_ANCHOR = "packages/ui/src/tokens/index.ts";

export const gate: GateDescriptor = {
  name: "no-raw-interactive-intrinsics",
  docRow: "design-enforcement.md §3.2 (D62)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "reach for the matching @orb/ui primitive (Button, TextField, Select, TextArea, Link) — never a hand-rolled <button>/<input>/<select>/<textarea>/<a href>.",
  scanRoot: (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx"),
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
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    ctx.report(node, { token: `<${tag}>`, offset: 0 });
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "shell tier" });
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, STALE_ARM_ANCHOR)) {
      return;
    }
    for (const rel of Object.keys(BURN_DOWN)) {
      if (!passSeenBurnDown.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — tooling/src/verify/gates/no-raw-interactive-intrinsics.ts`,
        });
      }
    }
  },
  // NOTE: the BURN_DOWN ratchet/stale arms are guarded to the real full tree — their coverage moves to
  // the live `pnpm check:structure` run. Only the pure FLAG/PASS branches port as examples below.
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
    {
      files: 'export const G = <input type="text" />;\n',
      at: "packages/client/src/features/demo/input.tsx",
      why: "a raw <input> in a feature — must be an @orb/ui TextField",
    },
    {
      files: "export const G = <select><option>a</option></select>;\n",
      at: "packages/client/src/features/demo/select.tsx",
      why: "a raw <select> in a feature — must be an @orb/ui Select",
    },
    {
      files: "export const G = <textarea />;\n",
      at: "packages/client/src/features/demo/textarea.tsx",
      why: "a raw <textarea> in a feature — must be an @orb/ui TextArea",
    },
    {
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        "packages/client/src/features/demo/ok.tsx": "export const G = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded but features/app-shell/ resolves to no file — the shell moved, which the old scanRoot exclusion could not see",
    },
  ],
  mustPass: [
    {
      files: "export const G = <a>anchor target</a>;\n",
      at: "packages/client/src/features/demo/anchor.tsx",
      why: "a non-interactive <a> with no href (an anchor-name target) stays legal",
    },
    {
      files: 'export const G = <a name="top">top</a>;\n',
      at: "packages/client/src/features/demo/anchor-name.tsx",
      why: "an <a name> with no href is a non-interactive anchor target — stays legal",
    },
    {
      files: 'export const G = <button type="button">Shell</button>;\n',
      at: "packages/client/src/features/app-shell/thing.tsx",
      why: "THE ALLOWLIST ITSELF: app-shell is the shell tier — now SCANNED, and a raw button there passes only because a cited SANCTIONED_HOMES row covers it",
    },
    {
      files: "export const G = <button>Go</button>;\n",
      at: "packages/ui/src/primitives/button/button.tsx",
      why: "scope: outside features/** a ui/ primitive legally hosts the raw element — not scanned, passes",
    },
  ],
};
