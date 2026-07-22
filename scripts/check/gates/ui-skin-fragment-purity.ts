// Gate: ui-skin-fragment-purity (derive-modernization-audit.md §W2 — the skin-fragment tier sealed).
// Once a skin fragment is homed in packages/ui/src/lib/ (the FOCUS_RING/OVERLAY_MOTION precedent), NO
// class string OUTSIDE that home may re-spell it by hand — a hand-copy silently drifts (the toast
// partial focus-ring that painted a white halo on dark themes; the arrow border/bg token pair). The
// signature table is DATA-DRIVEN so the tier grows by adding a row, never by touching the walk: each
// row is {signature, composeInstead}, so the failure names the exact lib constant to compose.
//
// SCOPE: class-string CONTEXTS only — string literals + template-literal STATIC parts (head/middle/tail
// + no-substitution) under packages/ui/src/**, excluding packages/ui/src/lib/** (the fragments' home).
// Comments/JSDoc are never these node kinds, so a prose mention of `bg-scrim` can't trip it. A template
// that INTERPOLATES a lib constant (`${FOCUS_RING}`) carries no `focus-visible:ring-` in its static
// source text — the constant's content isn't present statically — so composing is inherently clean.
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const LIB_HOME = "packages/ui/src/lib/";

type FragmentSignature = {
  /** The banned hand-spelled substring — the fragment's raw class signature. */
  readonly signature: string;
  /** The lib constant(s) to compose instead — named in the failure so the fix is a one-liner. */
  readonly composeInstead: string;
};

// Each row seals a fragment homed in packages/ui/src/lib/. Adding a fragment to lib = adding its row.
// Order the two disabled rows so the more-specific `data-disabled:…` pair is disjoint from the native
// `disabled:…` pair (neither is a substring of the other — the `data-` prefix breaks the overlap).
const SIGNATURES: readonly FragmentSignature[] = [
  {
    signature: "focus-visible:ring-",
    composeInstead: "FOCUS_RING / FOCUS_RING_WITHIN / FOCUS_RING_HAS / FOCUS_RING_INSET / FOCUS_RING_BARE (lib/focus-ring.ts)",
  },
  { signature: "before:size-touch-target", composeInstead: "TOUCH_TARGET_PSEUDO (lib/selection-control.ts)" },
  { signature: "rotate-45 border border-border bg-popover", composeInstead: "OVERLAY_ARROW (lib/overlay-arrow.ts)" },
  { signature: "bg-scrim", composeInstead: "SCRIM(tier) / SCRIM_BASE (lib/scrim.ts)" },
  { signature: "data-disabled:pointer-events-none data-disabled:opacity-50", composeInstead: "DISABLED_STATE (lib/disabled-state.ts)" },
  { signature: "disabled:pointer-events-none disabled:opacity-50", composeInstead: "DISABLED_STATE_NATIVE (lib/disabled-state.ts)" },
];

const MESSAGE =
  "a class string outside packages/ui/src/lib/ hand-spells a homed skin fragment — compose the lib constant instead so a drift in the fragment is structurally impossible (derive-modernization-audit.md §W2; the FOCUS_RING precedent).";

export const gate: GateDescriptor = {
  name: "ui-skin-fragment-purity",
  docRow: "history/derive-modernization-audit.md §W2",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "replace the hand-spelled classes with `${CONSTANT}` from packages/ui/src/lib/ (import from #lib or the fragment's module) — never re-spell a homed fragment.",
  scanRoot: (p) => p.startsWith("packages/ui/src/") && !p.startsWith(LIB_HOME),
  // String literals + every static carrier of a template literal (a tv()/cn() class string may be a
  // template interpolating lib constants — its head/middle/tail are the parts we scan).
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateHead, SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail],
  visit: (node, sf, ctx) => {
    const text = node.getText();
    const abs = sf.getFilePath();
    const file = abs.startsWith(`${ctx.root}/`) ? abs.slice(ctx.root.length + 1) : abs;
    for (const row of SIGNATURES) {
      const offset = text.indexOf(row.signature);
      if (offset === -1) {
        continue;
      }
      // Land the caret on the signature and name the exact constant to compose (the per-occurrence
      // override; the base `message` prints once as the group header).
      const { line, column } = sf.getLineAndColumnAtPos(node.getStart() + offset);
      ctx.report({
        file,
        line,
        column,
        token: row.signature,
        message: `hand-spelled skin fragment "${row.signature}" — compose ${row.composeInstead} from packages/ui/src/lib/ instead (derive-modernization-audit.md §W2).`,
      });
    }
  },
  mustFlag: [
    {
      files: 'export const overlay = { arrow: "size-row rotate-45 border border-border bg-popover" };\n',
      at: "packages/ui/src/primitives/tooltip/variants.ts",
      expect: { count: 1 },
      why: "a variants.ts re-spelling the OVERLAY_ARROW diamond by hand — the drift-forever case the tier ends",
    },
    {
      files: 'export const toast = { root: "rounded-control focus-visible:ring-2 focus-visible:ring-ring" };\n',
      at: "packages/ui/src/primitives/toast/variants.ts",
      expect: { count: 1 },
      why: "the toast PARTIAL hand focus-ring — `focus-visible:ring-` must compose FOCUS_RING (the white-halo paint defect, caught forever)",
    },
    {
      files: "declare const z: string;\nexport const scrim = `fixed inset-0 bg-scrim ${z}`;\n",
      at: "packages/ui/src/primitives/backdrop/variants.ts",
      expect: { count: 1 },
      why: "a TEMPLATE literal whose STATIC part hand-spells `bg-scrim` around an interpolation — the head/tail scan must still bite",
    },
  ],
  mustPass: [
    {
      files:
        "declare const FOCUS_RING: string;\ndeclare const DISABLED_STATE: string;\nexport const control = `relative border border-border bg-input ${FOCUS_RING} ${DISABLED_STATE}`;\n",
      at: "packages/ui/src/primitives/checkbox/variants.ts",
      why: "composing the lib constants via `${…}` — the static template parts carry no banned signature, so a composer is clean",
    },
    {
      files: 'export const OVERLAY_ARROW = "size-row rotate-45 border border-border bg-popover";\nexport const SCRIM_BASE = "fixed inset-0 bg-scrim";\n',
      at: "packages/ui/src/lib/overlay-arrow.ts",
      why: "the lib home itself IS where the signatures live — packages/ui/src/lib/ is excluded from the scan",
    },
  ],
};
