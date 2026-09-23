// Gate: no-off-token-inline-style — the inline/imperative arm the
// className + CSS gates can't see: a token-backed CSS property written straight onto an element via a
// JSX `style={{...}}` literal or an imperative `.style`/`setProperty` call bypasses both. A RATCHET —
// currently EMPTY drift surface (class lane + CSS are 100% on-token); catches the first future
// raw-literal inline style. Scope: packages/{ui,client}/src, and only a static literal value.
//
// FINAL-CONTRACT CONVERSION (#1584): the legacy ALLOWLIST/stale-arm ratchet retired with NO ROWS TO
// PORT — it was always EMPTY (the header's own claim: no known off-Tailwind inline-style sink exists in
// this gate's carrier shape). A future legitimate raw inline style is suppressed with `@orb-waive
// no-off-token-inline-style(<position>): <reason>` at the exact offending property, not a re-grown file
// table. FAMILY: singleton — this policy's own logic is intent (which token-backed property, which
// carrier), and it consumes three already-shared `lib/` readers for identity (`unwrapExpression`,
// `readMemberAccess`, `readNumericConstant`, `readStringConstant` — `lib/ast-read.ts` +
// `lib/symbol-reference.ts`), which is exactly the shared-reader boundary the final contract asks for;
// it has no sibling gate reusing those SAME readers for a related off-token-style intent, so it is not
// merged with anything.
//
// THE REPORTED POSITION IS DERIVED, AND IT DIFFERS PER CARRIER (#1584 pristine pass, 2026-09-11). Every
// `ctx.report.node` call below passes NO token, so the runtime derives one: the first identifier, literal or
// keyword in the REPORTED NODE's own text containing no paren or newline (`lib/policy-pass-context.ts`
// `derivedNodePosition`). The reported node is the PropertyAssignment for the JSX arm, so the position is the
// CSS property name (`borderRadius`); it is the whole BinaryExpression / CallExpression for the two imperative
// arms, so the position is the RECEIVER identifier (`el`), never the property. `fix` states both spellings —
// nobody can guess the second one. The `mustFlag` rows' `expect.token` values are that derivation, pinned.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-off-token-inline-style` descriptor at 47c35b61cf123295f2f00da9e11d5208e205fb5f, the parent of the conversion
// `7993f264c` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,364 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,685 and final `population` admits 1,685. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { readMemberAccess, readNumericConstant, readStringConstant } from "../lib/symbol-reference.ts";

const MESSAGE =
  "off-token raw-literal inline style — a token-backed CSS property " +
  "(radius/shadow/color/background/motion/spacing) written as a raw literal in a JSX `style={{…}}` or an " +
  "imperative `.style`/`setProperty` bypasses the className + CSS token gates: use a Tailwind token " +
  "utility, or (if inline is required) reference a `var(--…)` token, per tokens.json.";

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

/** The STATIC value text of a value node. Returns `""` for a genuinely dynamic value (a prop, a call, an
 *  interpolated template), which never trips `isRawLiteralValue` (an empty string is not a raw literal),
 *  so a dynamic value is deliberately skipped.
 *
 *  #1506: a NEGATIVE number is a `PrefixUnaryExpression`, not a NumericLiteral — `margin: -8` produced
 *  ZERO findings while `margin: 8` flagged, which made every off-token NEGATIVE offset invisible to this
 *  gate. `readNumericConstant` reads the sign (and a same-file `const GAP = -8`) and still refuses a
 *  value it cannot establish. */
function staticLiteral(raw: Node | undefined): string {
  if (raw === undefined) {
    return "";
  }
  const node = unwrapExpression(raw); // see through `"8px" as string` / `("8px")` / `"8px" satisfies X`
  const text = readStringConstant(node);
  if (text !== undefined) {
    return text;
  }
  const numeric = readNumericConstant(node);
  return numeric === undefined ? "" : String(numeric);
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

/** Is `expr` a `<something>.style` member access (`el.style`, `ref.current.style`, `el["style"]`)? */
function isStyleAccess(expr: Node): boolean {
  return readMemberAccess(expr)?.name === "style";
}

/** Is `lhs` a `<expr>.style.<token-prop>` member access (the assignment-target shape), in either member
 *  spelling — `el.style.margin` and `el.style["margin"]` set the same declaration (#1506). */
function isStyleTokenTarget(lhs: Node): boolean {
  const read = readMemberAccess(lhs);
  return read !== undefined && isStyleAccess(read.receiver) && TOKEN_BACKED_PROPS.has(read.name);
}

/** Is this JSX `style={{…}}` PropertyAssignment a token-backed prop written with a raw literal value? */
function isRawStyleProp(prop: Node): boolean {
  if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
    return false;
  }
  const key = prop.getNameNode().getText().replace(/["']/gu, "");
  return TOKEN_BACKED_PROPS.has(key) && isRawLiteralValue(staticLiteral(prop.getInitializer()));
}

/** The first offending PropertyAssignment inside a JSX `style={{…}}` attribute, or undefined. A trailing
 *  return EXPRESSION (no fall-off-end) so tsc noImplicitReturns is satisfied. Both traversals here are
 *  bounded to the ATTRIBUTE NODE DELIVERED TO THE VISITOR — `getChildrenOfKind` reads only the object
 *  literal's direct property children, never a deep subtree. */
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
  const callee = readMemberAccess(call.getExpression());
  if (callee === undefined || callee.name !== "setProperty" || !isStyleAccess(callee.receiver)) {
    return false;
  }
  const [propArg, valueArg] = call.getArguments();
  return TOKEN_BACKED_PROPS.has(staticLiteral(propArg)) && isRawLiteralValue(staticLiteral(valueArg));
}

export const gate = defineGate({
  id: "no-off-token-inline-style",
  family: "no-off-token-inline-style",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "use a Tailwind token utility, or (if inline is required) reference a `var(--…)` token, per tokens.json. " +
    "A deliberate raw inline style is waived with `// @orb-waive no-off-token-inline-style(<position>): <reason>` " +
    "on a line above the offending statement, where <position> is the CSS PROPERTY NAME for the JSX " +
    "`style={{…}}` arm (`borderRadius`) and the RECEIVER IDENTIFIER for the imperative `.style = …` / " +
    "`.style.setProperty(…)` arms (`el`) — the reported node there is the whole assignment or call, and the " +
    "runtime derives its first paren-free identifier.",
  create: (ctx) => ({
    // Three carriers, ONE gate: a JSX `style={{ <prop>: <raw> }}` PropertyAssignment, an imperative
    // `<expr>.style.<prop> = <raw>` BinaryExpression, and a `.style.setProperty("<prop>", <raw>)`
    // CallExpression.
    visitors: [
      {
        kinds: [SyntaxKind.JsxAttribute, SyntaxKind.BinaryExpression, SyntaxKind.CallExpression],
        visit: (node) => {
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
          if (offender !== undefined) {
            ctx.report.node(offender);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/demo/components/thing.tsx": 'export const G = <div style={{ borderRadius: "8px" }} />;\n' },
      expect: { count: 1, token: "borderRadius" },
      why: "a raw-literal JSX inline style (borderRadius: '8px') — bypasses the className + CSS token gates",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/negative.tsx": "export const G = <div style={{ margin: -8 }} />;\n" },
      expect: { count: 1, token: "margin" },
      why: "#1506: a NEGATIVE off-token number. `-8` is a PrefixUnaryExpression, not a NumericLiteral, so this produced ZERO findings while `margin: 8` flagged — every negative offset was invisible",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/named-number.tsx": "const GAP = 12;\nexport const G = <div style={{ gap: GAP }} />;\n" },
      expect: { count: 1, line: 2, token: "gap" },
      why: "#1506: an identifier standing for the raw number — the rendered result is the same off-token gap",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/bracket-target.tsx": 'export function f(el: HTMLElement): void {\n  el.style["borderRadius"] = "8px";\n}\n',
      },
      expect: { count: 1, line: 2, token: "el" },
      why: '#1506: the bracket spelling of the imperative assignment target — `el.style["borderRadius"]` sets the same declaration as `el.style.borderRadius`',
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/demo/demo.ts": 'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "8px";\n}\n' },
      expect: { count: 1, line: 2, token: "el" },
      why: "an imperative `.style.x = 'raw'` assignment — the second carrier the class gates can't see",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/components/hex.tsx": 'export const G = <div style={{ color: "#fff" }} />;\n' },
      expect: { count: 1, token: "color" },
      why: "a raw hex color in a JSX inline style — a token-backed color axis written off-token",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/components/cast.tsx": 'export const G = <div style={{ borderRadius: "8px" as string }} />;\n' },
      expect: { count: 1, token: "borderRadius" },
      why: 'a raw-literal inline style value wrapped in an AsExpression (`"8px" as string`) — the wrapped-literal shape the plain-literal reader silently PASSED before hardening',
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/demo/setprop.ts": 'export function f(el: HTMLElement): void {\n  el.style.setProperty("gap", "12px");\n}\n' },
      expect: { count: 1, line: 2, token: "el" },
      why: "an imperative `.style.setProperty('gap','12px')` — the third carrier, a token-backed spacing axis",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/demo/components/ok.tsx": 'export const G = <div style={{ borderRadius: "var(--radius-card)" }} />;\n' },
      why: "a var(--…) inline value is on-token (just inline) — always passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/components/np.tsx": 'export const G = <div style={{ left: "8px" }} />;\n' },
      why: "a non-token property (left) is out of scope — this gate owns only tokens.json's axes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/dynamic-number.tsx": "export const G = (props: { gap: number }) => <div style={{ gap: props.gap }} />;\n" },
      why: "#1506's NEGATIVE control: a genuinely dynamic number is UNREADABLE and is never accused — the widening resolves names and signs, it does not guess",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/negative-zero.tsx": "export const G = <div style={{ margin: -0 }} />;\n" },
      why: "#1506: `-0` is still the no-op ZERO keyword, not a magic value — the sign reader must not turn a legal zero into a finding",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/demo/imp-var.ts": 'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "var(--radius-card)";\n}\n',
      },
      why: "an imperative `.style.x = 'var(--…)'` is on-token (just inline) — passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/components/zero.tsx": "export const G = <div style={{ margin: 0 }} />;\n" },
      why: "a bare `0` no-op inline value is not a magic value — passes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/dynamic.tsx": "export const G = ({ r }: { r: string }) => <div style={{ borderRadius: r }} />;\n",
      },
      why: "a DYNAMIC inline value (identifier) is conservatively not chased — passes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/plain-object-target.ts":
          'export function f(box: { borderRadius: string }): void {\n  box.borderRadius = "8px";\n}\n',
      },
      why: "THE `.style` RECEIVER FENCE, pinned (#1584 pristine pass): a token-backed property NAME assigned on a PLAIN object is not an inline style — this gate owns the CSSOM carrier, not every property called `borderRadius`. Delete `isStyleAccess(read.receiver)` from `isStyleTokenTarget` and this row goes red; before it existed, every pre-existing row stayed green without that fence",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/non-style-attr.tsx": 'export const G = <div data-theme={{ borderRadius: "8px" }} />;\n',
      },
      why: 'THE `style` ATTRIBUTE FENCE, pinned (#1584 pristine pass): an object literal with a token-backed key under a NON-`style` JSX attribute sets no CSS declaration. Delete the `getNameNode().getText() !== "style"` guard in `styleObjectLiterals` and this row goes red; before it existed, every pre-existing row stayed green without that fence',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/waived.tsx":
          "// @orb-waive no-off-token-inline-style(borderRadius): the proof's stand-in reason and its end condition.\n" +
          'export const G = <div style={{ borderRadius: "8px" }} />;\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the DERIVED position (the CSS property name, because the reported node is the PropertyAssignment) suppresses the twin of mustFlag[0] — one finding, one marker, zero effective findings and zero authority alarms. A wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
  ],
});
