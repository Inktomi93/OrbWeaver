// Gate: no-off-token-inline-style (design-enforcement.md §3) — the inline/imperative arm the
// className + CSS gates can't see: a token-backed CSS property written straight onto an element via a
// JSX `style={{...}}` literal or an imperative `.style`/`setProperty` call bypasses both. A RATCHET —
// currently EMPTY drift surface (class lane + CSS are 100% on-token); catches the first future
// raw-literal inline style. Scope: packages/{ui,client}/src, and only a static literal value.
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

// Three carriers, ONE gate: a JSX `style={{ <prop>: <raw> }}` PropertyAssignment, an imperative
// `<expr>.style.<prop> = <raw>` BinaryExpression, and a `.style.setProperty("<prop>", <raw>)`
// CallExpression. The empty ALLOWLIST's stale arm is finalize-guarded to project scope.
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
