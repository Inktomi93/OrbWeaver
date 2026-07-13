// Gate: no-off-token-inline-style (design-enforcement.md §3 — the inline/imperative arm the className +
// CSS gates can't see). `no-arbitrary-tw-values`/`no-off-token-radius-shadow`/`no-color-literals` guard
// the Tailwind CLASS lane; `motion-token-purity` guards raw-CSS files. But a token-backed CSS property can
// also be written STRAIGHT ONTO an element — a JSX `style={{ borderRadius: "8px" }}` object literal, or an
// imperative `el.style.color = "#fff"` / `el.style.setProperty("--x", "12px")` — and every one of those
// bypasses ALL of the above (the class gates scan className strings; the CSS gate scans .css files; neither
// walks a style object or a `.style` assignment). This gate closes that last hole for the axes we tokenize.
//
// HONEST FRAMING: this is a RATCHET. A radius audit + the motion pass both found the drift surface is
// currently EMPTY — the class lane + CSS are 100% on-token, and the handful of inline `style` uses are all
// either a var(--…) reference (on-token, just inline) or a genuinely-off-Tailwind canvas/editor sink. So it
// is GREEN today; it exists to catch the FIRST future raw-literal inline style a reviewer would wave through.
//
// SCOPE: `packages/{ui,client}/src/**/*.{ts,tsx}` (the ts-morph project's own files — same packages the
// class gates cover). It flags a TOKEN-BACKED CSS property (radius/shadow/color/background/the motion axes/
// the spacing box axes — see TOKEN_BACKED_PROPS) written with a RAW STATIC LITERAL value, in either of two
// carriers:
//   • a JSX inline `style={{ <prop>: <value> }}` object literal, and
//   • an imperative `<expr>.style.<prop> = <value>` assignment or `<expr>.style.setProperty("<prop>", <value>)`.
// A property outside the token set (`left`, `width`, `zIndex`, `opacity`, `display`, a `--custom-prop`
// setProperty, …) is OUT OF SCOPE — this gate owns exactly the axes tokens.json defines a vocabulary for.
//
// ALLOW (not a violation): any value that IS or CONTAINS a `var(--…)` reference — a `"var(--radius-card)"`
// inline style is on-token, just written inline, which is fine. And it is CONSERVATIVE: only a STATIC
// string/number LITERAL value is judged. A dynamic value (an identifier, a prop/member read, a template
// with interpolation, a conditional) is NOT flagged — chasing computed values is out of scope and false-
// positive-prone; this gate catches the reviewer-waved raw literal, nothing subtler.
//
// ALLOWLIST (file-level, both-arm, the no-off-token-radius-shadow / motion-token-purity precedent): a file
// would land here with the value + reason if a raw-literal inline style were a genuinely-off-Tailwind sink.
// It is EMPTY: the two known off-Tailwind radius sinks (the ECharts `<canvas>` bar corner in
// charts/bar-list/option.ts, the CodeMirror lint-marker `9999px` pill in code-editor/code-editor.tsx) are
// NOT in this gate's scope — neither is a JSX `style={{…}}` attribute nor an imperative `.style` write.
// They are plain object PROPERTIES inside a framework config object (an ECharts `itemStyle` / a CodeMirror
// `EditorView.theme` decoration), which this gate deliberately does not scan (a variable-ref / non-`style`
// object property — the conservative scope). So they don't need an allowlist entry, and adding one would be
// a permanent STALE-entry RED. An allowlisted file gone CLEAN is RED ("stale entry — remove it"); a NEW
// offender not in the allowlist is RED immediately.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

/** Legit off-Tailwind inline-style sinks → reason. EMPTY: the two known off-Tailwind radius sinks (ECharts
 *  canvas + CodeMirror decoration) are framework-config OBJECT PROPERTIES, not JSX `style={{…}}`/imperative
 *  `.style` sites, so they fall outside this gate's scope entirely — no allowlist entry needed. A NEW
 *  raw-literal JSX/imperative inline style is RED on sight. */
const ALLOWLIST: Record<string, string> = {};

const MESSAGE =
  "off-token raw-literal inline style (design-enforcement.md §3) — a token-backed CSS property " +
  // biome-ignore lint/security/noSecrets: diagnostic PROSE (a CSS-axis enumeration), not a secret.
  "(radius/shadow/color/background/motion/spacing) written as a raw literal in a JSX `style={{…}}` or an " +
  "imperative `.style`/`setProperty` bypasses the className + CSS token gates: use a Tailwind token " +
  "utility, or (if inline is required) reference a `var(--…)` token, per tokens.json.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO off-token raw-literal inline style any more — the offender was moved onto a " +
  "token (ratchet down): delete the stale row in no-off-token-inline-style.ts: ";

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The token-backed CSS properties this gate owns — the axes tokens.json defines a closed vocabulary for.
 *  Stored in BOTH the camelCase (JSX object-literal / `el.style.x`) and kebab-case (`setProperty("x",…)`)
 *  spellings so a lookup needs no case conversion. A property outside this set is out of scope. */
const TOKEN_BACKED_PROPS: ReadonlySet<string> = new Set([
  // radius
  "borderRadius",
  "border-radius",
  // shadow
  "boxShadow",
  "box-shadow",
  // color / background
  "color",
  "background",
  "backgroundColor",
  "background-color",
  // motion
  "transition",
  "transitionDuration",
  "transition-duration",
  "transitionTimingFunction",
  "transition-timing-function",
  "animation",
  // spacing (box) axes
  "gap",
  "rowGap",
  "row-gap",
  "columnGap",
  "column-gap",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
]);

// A raw literal VALUE that reads as an off-token number/color/duration/keyword. Anchored on the shapes a
// tokenized value never has: a unit-bearing number (px/rem/em/%/ms/s/vh/vw/ch/cqh/fr/deg), a hex/rgb/hsl/
// oklch color, or a raw easing keyword. A bare integer (`gap: 4`) counts too — React treats it as px.
const RAW_UNIT_RE = /\d(?:\.\d+)?\s*(?:px|rem|em|%|ms|s|vh|vw|vmin|vmax|ch|cqh|cqw|fr|deg)\b/u;
const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\s*\(/u;
const RAW_EASE_RE = /\b(?:ease-in-out|ease-in|ease-out|ease|linear|cubic-bezier)\b/u;
const BARE_NUMBER_RE = /^-?\d+(?:\.\d+)?$/u;

/** Does a static value string read as a raw off-token literal? A value that CONTAINS `var(--…)` is
 *  on-token (just inline) and always passes; a bare `0`/`none`/`transparent`/`inherit` is a no-op keyword,
 *  not a magic value. */
function isRawLiteralValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes("var(--")) {
    return false;
  }
  if (BARE_NUMBER_RE.test(trimmed)) {
    return Number(trimmed) !== 0;
  }
  return RAW_UNIT_RE.test(trimmed) || RAW_COLOR_RE.test(trimmed) || RAW_EASE_RE.test(trimmed);
}

/** The STATIC literal text of a value node — a plain string/number literal only. Returns `""` for a
 *  dynamic value (identifier, member read, interpolated template, conditional), which never trips
 *  `isRawLiteralValue` (an empty string is not a raw literal), so a dynamic value is deliberately skipped. */
function staticLiteral(node: Node | undefined): string {
  if (
    node?.isKind(SyntaxKind.StringLiteral) ||
    node?.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  ) {
    return node.getLiteralText();
  }
  if (node?.isKind(SyntaxKind.NumericLiteral)) {
    return node.getText();
  }
  return "";
}

/** The `{ <prop>: <value> }` object literal of a JSX `style={{…}}` attribute, if this attribute is a
 *  `style` with an object-literal initializer (a dynamic `style={styleVar}` yields an empty array). */
function styleObjectLiterals(attr: Node): Node[] {
  if (!attr.isKind(SyntaxKind.JsxAttribute) || attr.getNameNode().getText() !== "style") {
    return [];
  }
  const init = attr.getInitializer();
  const obj = init?.isKind(SyntaxKind.JsxExpression) === true ? init.getExpression() : undefined;
  return obj?.isKind(SyntaxKind.ObjectLiteralExpression) === true ? [obj] : [];
}

/** Is `expr` a `<something>.style` member access (`el.style`, `ref.current.style`)? */
function isStyleAccess(expr: Node): boolean {
  return expr.isKind(SyntaxKind.PropertyAccessExpression) && expr.getName() === "style";
}

/** Is `lhs` a `<expr>.style.<token-prop>` member access (the assignment-target shape)? */
function isStyleTokenTarget(lhs: Node): boolean {
  return (
    lhs.isKind(SyntaxKind.PropertyAccessExpression) &&
    isStyleAccess(lhs.getExpression()) &&
    TOKEN_BACKED_PROPS.has(lhs.getName())
  );
}

// ── SINGLE-PASS CONTRACT FORM (§1.2 — the reference-gate shape: offender arm + finalize stale arm) ─
// Three carriers, ONE gate: a JSX `style={{ <prop>: <raw> }}` PropertyAssignment, an imperative
// `<expr>.style.<prop> = <raw>` BinaryExpression, and a `.style.setProperty("<prop>", <raw>)`
// CallExpression. scanRoot mirrors the legacy scanSrc filter (client|ui src). The empty ALLOWLIST's
// stale arm is finalize-guarded to project scope (§4.4), exactly like no-off-token-radius-shadow.
// Per-occurrence (each offending inline-style site).
const GATE_SELF = "scripts/check/gates/no-off-token-inline-style.ts";
const passSeenAllowlisted = new Set<string>();

/** Is this JSX `style={{…}}` PropertyAssignment a token-backed prop written with a raw literal value? */
function isRawStyleProp(prop: Node): boolean {
  if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
    return false;
  }
  const key = prop.getNameNode().getText().replace(/["']/gu, "");
  return TOKEN_BACKED_PROPS.has(key) && isRawLiteralValue(staticLiteral(prop.getInitializer()));
}

/** The first offending PropertyAssignment inside a JSX `style={{…}}` attribute, or undefined. A trailing
 *  return EXPRESSION (no fall-off-end) so tsc noImplicitReturns is satisfied. */
function jsxStyleOffender(attr: Node): Node | undefined {
  return styleObjectLiterals(attr)
    .flatMap((obj) => obj.getChildrenOfKind(SyntaxKind.PropertyAssignment))
    .find(isRawStyleProp);
}

/** Is this `.style.setProperty("<token-prop>", <raw>)` call an offender? */
function isSetPropertyOffender(call: Node): boolean {
  if (!call.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const callee = call.getExpression();
  if (!callee.isKind(SyntaxKind.PropertyAccessExpression) || callee.getName() !== "setProperty") {
    return false;
  }
  if (!isStyleAccess(callee.getExpression())) {
    return false;
  }
  const [propArg, valueArg] = call.getArguments();
  return (
    TOKEN_BACKED_PROPS.has(staticLiteral(propArg)) && isRawLiteralValue(staticLiteral(valueArg))
  );
}

export const gate: GateDescriptor = {
  name: "no-off-token-inline-style",
  docRow: "design-enforcement.md §3 (inline/imperative arm)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use a Tailwind token utility, or (if inline is required) reference a `var(--…)` token, per tokens.json.",
  scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/"),
  kinds: [SyntaxKind.JsxAttribute, SyntaxKind.BinaryExpression, SyntaxKind.CallExpression],
  begin: () => {
    passSeenAllowlisted.clear();
  },
  visit: (node, sf, ctx) => {
    const rel = clientRel(sf.getFilePath());
    let offender: Node | undefined;
    if (node.isKind(SyntaxKind.JsxAttribute)) {
      offender = jsxStyleOffender(node);
    } else if (
      node.isKind(SyntaxKind.BinaryExpression) &&
      node.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      isStyleTokenTarget(node.getLeft()) &&
      isRawLiteralValue(staticLiteral(node.getRight()))
    ) {
      offender = node;
    } else if (isSetPropertyOffender(node)) {
      offender = node;
    }
    if (offender === undefined) {
      return;
    }
    if (rel in ALLOWLIST) {
      passSeenAllowlisted.add(rel);
      return;
    }
    ctx.report(offender);
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return;
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      if (!passSeenAllowlisted.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-off-token-inline-style.ts`,
        });
      }
    }
  },
  // NOTE: the ALLOWLIST ratchet/stale arms are guarded to the real full tree — their coverage moves to
  // the live `pnpm check:structure` run. Only the pure FLAG/PASS branches port as examples below.
  mustFlag: [
    {
      files: 'export const G = <div style={{ borderRadius: "8px" }} />;\n',
      at: "packages/client/src/features/demo/components/thing.tsx",
      why: "a raw-literal JSX inline style (borderRadius: '8px') — bypasses the className + CSS token gates",
    },
    {
      files: 'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "8px";\n}\n',
      at: "packages/ui/src/primitives/demo/demo.ts",
      why: "an imperative `.style.x = 'raw'` assignment — the second carrier the class gates can't see",
    },
    {
      files: 'export const G = <div style={{ color: "#fff" }} />;\n',
      at: "packages/client/src/features/demo/components/hex.tsx",
      why: "a raw hex color in a JSX inline style — a token-backed color axis written off-token",
    },
    {
      files:
        'export function f(el: HTMLElement): void {\n  el.style.setProperty("gap", "12px");\n}\n',
      at: "packages/ui/src/primitives/demo/setprop.ts",
      why: "an imperative `.style.setProperty('gap','12px')` — the third carrier, a token-backed spacing axis",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <div style={{ borderRadius: "var(--radius-card)" }} />;\n',
      at: "packages/client/src/features/demo/components/ok.tsx",
      why: "a var(--…) inline value is on-token (just inline) — always passes",
    },
    {
      files: 'export const G = <div style={{ left: "8px" }} />;\n',
      at: "packages/client/src/features/demo/components/np.tsx",
      why: "a non-token property (left) is out of scope — this gate owns only tokens.json's axes",
    },
    {
      files:
        'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "var(--radius-card)";\n}\n',
      at: "packages/ui/src/primitives/demo/imp-var.ts",
      why: "an imperative `.style.x = 'var(--…)'` is on-token (just inline) — passes",
    },
    {
      files: "export const G = <div style={{ margin: 0 }} />;\n",
      at: "packages/client/src/features/demo/components/zero.tsx",
      why: "a bare `0` no-op inline value is not a magic value — passes",
    },
    {
      files: "export const G = ({ r }: { r: string }) => <div style={{ borderRadius: r }} />;\n",
      at: "packages/client/src/features/demo/components/dynamic.tsx",
      why: "a DYNAMIC inline value (identifier) is conservatively not chased — passes",
    },
  ],
};
