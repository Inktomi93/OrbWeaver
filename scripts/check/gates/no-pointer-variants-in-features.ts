// Gate: no-pointer-variants-in-features — axis-3 device CAPABILITY (`pointer-coarse:`/`pointer-fine:` and
// raw `@media (pointer/hover)`) is TOKEN/SHELL-layer, never a feature className (UI-Architecture §4b, owner
// ruling 2026-08-07). The sibling `no-media-queries-in-features` bans viewport WIDTH variants the same way;
// this bans the pointer/hover ones its `MEDIA_QUERY_RE` never matched. Sanctioned homes (all OUT of scanRoot):
// a pointer-conditional TOKEN (`min-w-touch-target`) or a shared component-layer const (`#components`).
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const FEATURES_ROOT = "packages/client/src/features/";
const APP_SHELL = "packages/client/src/features/app-shell/";
// The real-tree sentinel: the client entry, present on every full run, never a feature and never in an
// example. Its presence means "this is a real project pass" — so the blindness arm below can distinguish a
// features tree that MOVED (anchor loaded, zero feature files scanned ⇒ RED) from a conformance mini-project
// or a scoped run (anchor absent ⇒ arm stays quiet). Mirrors own-tables-only's schema-barrel anchor.
const ANCHOR = "packages/client/src/main.tsx";
const GATE_SELF = "scripts/check/gates/no-pointer-variants-in-features.ts";

// A whitespace-delimited class token that is a pointer/hover CAPABILITY variant:
//   · `pointer-coarse:` / `pointer-fine:` (+ Tailwind's `any-pointer-*` twins) as the leading variant — also
//     catches STACKED forms (`pointer-fine:group-hover:…`) since the capability variant is the prefix.
//   · an ARBITRARY media variant naming pointer/hover (`[@media(pointer:coarse)]:` / `[@media(hover:hover)]:`)
//     — the escape hatch a plain prefix ban would leave open. Viewport `[@media(min-width:…)]` is NOT matched
//     (it carries no pointer/hover) and is the width gate's job.
// The `:hover` pseudo-class (`hover:bg-accent`) is an interaction state, NOT a capability query — never matched.
const POINTER_VARIANT_RE = /^(?:any-)?pointer-(?:coarse|fine):/u;
const CAPABILITY_MEDIA_RE = /\[@media\([^)]*(?:any-pointer|pointer|hover)\s*:[^)]*\)\]:/u;
const WHITESPACE_RE = /\s+/u;

interface BannedToken {
  readonly token: string;
  readonly offset: number;
}

function bannedTokens(nodeText: string): BannedToken[] {
  // Strip the literal's own quotes/backticks (the node text includes them), same as the width gate.
  const stripped = nodeText.slice(1, -1);
  const out: BannedToken[] = [];
  let cursor = 0;
  for (const part of stripped.split(WHITESPACE_RE)) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && (POINTER_VARIANT_RE.test(part) || CAPABILITY_MEDIA_RE.test(part))) {
      out.push({ token: part, offset: at + 1 });
    }
  }
  return out;
}

const MESSAGE =
  "pointer/hover CAPABILITY variant in a feature className (`pointer-coarse:`/`pointer-fine:`/`any-pointer-*:` " +
  "or a raw `[@media(pointer|hover:…)]:`) — axis-3 device capability is a container query CANNOT see, so it " +
  "lives at the TOKEN/SHELL layer, never in features/**, exactly as viewport width variants do " +
  "(`no-media-queries-in-features`). See UI-Architecture-and-Layout.md §4b.";

const FIX =
  "compose a pointer-conditional TOKEN (e.g. `min-w-touch-target` / `min-h-touch-target`, 44px coarse · fine " +
  "narrower — no variant needed) or a shared component-layer const from `#components` " +
  "(`packages/client/src/components/pointer-variants.ts`: HIDE_AT_COARSE, REVEAL_AT_COARSE, " +
  "FINE_INERT_UNTIL_HOVER, CHIP_TOUCH_FLOOR_AT_COARSE, PICKER_GAP_AT_COARSE, RPG_RAIL_WRAP). app-shell is the " +
  "shell tier and is scoped out.";

/** feature files this run actually SCANNED — the blindness arm's truth set (a features root that moved leaves
 *  this empty on a full run). Reset in `begin`. */
const featureFilesScanned = new Set<string>();

export const gate: GateDescriptor = {
  name: "no-pointer-variants-in-features",
  docRow: "UI-Architecture-and-Layout.md §4b",
  status: "active",
  scopeSafety: "incremental-safe", // per-file verdicts; the blindness arm self-guards in finalize
  message: MESSAGE,
  fix: FIX,
  // features/** minus app-shell (the shell tier — the sole legal viewport-@media site, §4b axis 2, and by the
  // same shell-layer logic the legal home for a raw pointer capability query).
  scanRoot: (p) => p.includes(FEATURES_ROOT) && !p.includes(APP_SHELL),
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],

  begin: () => {
    featureFilesScanned.clear();
  },

  // scanRoot-gated (pass.ts): fires once per in-scope feature file, whatever its node content — so it counts
  // scanned files honestly even for a feature file with no string literals.
  visitFile: (sf: SourceFile) => {
    featureFilesScanned.add(sf.getFilePath());
  },

  visit: (node, _sf, ctx) => {
    for (const hit of bannedTokens(node.getText())) {
      ctx.report(node, hit); // token-anchored ⇒ honours @orb-gate-ignore
    }
  },

  // BLINDNESS ARM (§4.6): a features root that renames/moves makes this whole gate a silent no-op. On a full
  // project run (never a scoped run, never a conformance mini-project — both detected by the anchor being
  // absent), if the anchor is loaded but ZERO feature files were scanned, the scan root died — RED.
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    if (featureFilesScanned.size === 0) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message:
          `scan root "${FEATURES_ROOT}" resolved to ZERO files on a full run while the anchor "${ANCHOR}" is ` +
          `present — the features tree moved/renamed and this gate is BLIND. Repoint FEATURES_ROOT in ${GATE_SELF} ` +
          "(UI-Architecture-and-Layout.md §4b).",
      });
    }
  },

  mustFlag: [
    {
      files: 'export const G = <div className="truncate pointer-coarse:hidden" />;\n',
      at: "packages/client/src/features/rpg/components/x.tsx",
      expect: { count: 1, messageIncludes: "pointer/hover CAPABILITY variant" },
      why: "the founding shape — a `pointer-coarse:` variant spelled inline in a feature (the rpg HUD echo this gate's landing commit relocated)",
    },
    {
      files: 'export const G = <div className="pointer-fine:group-hover:pointer-events-auto" />;\n',
      at: "packages/client/src/features/persona/components/x.tsx",
      expect: { count: 1 },
      why: "a STACKED `pointer-fine:` form (the persona inert-at-rest cluster) — the capability variant is the prefix, so a stacked chain still reds",
    },
    {
      files: 'export const G = <div className="[@media(pointer:coarse)]:hidden" />;\n',
      at: "packages/client/src/features/chat/components/x.tsx",
      expect: { count: 1 },
      why: "the ARBITRARY-media escape hatch a plain prefix ban would miss — a raw pointer @media query is the same axis-3 violation",
    },
    {
      files: { "packages/client/src/main.tsx": "export const app = 1;\n" },
      expect: { count: 1, messageIncludes: "BLIND" },
      why: "the §4.6 blindness tripwire — the anchor loads but NOT one feature file, i.e. the features root vanished; the gate must RED rather than pass silently",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <div className="min-w-touch-target min-h-touch-target" />;\n',
      at: "packages/client/src/features/rpg/components/x.tsx",
      why: "the sanctioned pointer-conditional TOKEN — its 44px-coarse/fine-narrower behaviour is baked into the token itself (no variant), so it is LEGAL in a feature and must never be flagged",
    },
    {
      files: 'export const G = <div className="hover:bg-accent @md:flex-row" />;\n',
      at: "packages/client/src/features/chat/components/x.tsx",
      why: "the `:hover` PSEUDO-CLASS (an interaction state) and a `@md:` CONTAINER query are both legal — neither is a device-capability media query",
    },
    {
      files: 'export const G = <div className="pointer-events-none pointer-events-auto" />;\n',
      at: "packages/client/src/features/rpg/components/x.tsx",
      why: "`pointer-events-*` is a plain utility, not a `pointer-(coarse|fine):` variant — the RE anchors on the capability form and must not catch it",
    },
    {
      files: 'export const G = <div className="pointer-coarse:hidden" />;\n',
      at: "packages/client/src/features/app-shell/x.tsx",
      why: "app-shell is the SHELL tier (the one legal viewport-@media site, §4b axis 2) — scoped out, exactly as `no-media-queries-in-features` exempts it",
    },
  ],
};
