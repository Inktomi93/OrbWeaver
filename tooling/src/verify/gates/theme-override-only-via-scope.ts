// Policy: theme-override-only-via-scope (UI-Theming-and-Content.md §12.1, D44) — a raw `style` prop that
// sets a `--color-*` design token bypasses the `<ThemeScope>` clamp (parse-as-color; reject
// url()/expression()/@import). Token overrides go through the clamp, which is where the value is validated.
//
// AUTHORITY IS reviewed-grant, WITH NO ROWS TODAY. The two legacy `SANCTIONED_HOMES` rows — the clamp
// itself and the null-origin srcdoc host — are structural permissions that neither home currently
// EXERCISES: `theme-scope.tsx` hands `style` a computed `CSSProperties` built by `derive-vars.ts`, and the
// sandbox frame's `style` carries no `--color-*` key. A grant row consumed zero times after a complete run
// is STALE by contract, so an unexercised permission is not representable and must not be invented; the
// homes are SCANNED and clean. The authority is what survives: an exception to a D44 clamp is a REVIEWED
// row, never an inline marker.
//
// IDENTITY, NOT TEXT. The legacy check was `attr.getText().includes("--color-")`, which reads a COMMENT, a
// nested string, or an unrelated payload the same as a real override. The subject is now the authored
// OBJECT the style prop is given: its KEYS are read through the shared static-value reader, which follows
// const chains and imports, and a key is a subject only when it names a `--color-*` custom property.
//
// DECLARED LIMIT, with its own row: a style object the reader cannot resolve statically (a computed
// `CSSProperties`, a spread of a call result) is NOT a subject. That is the clamp's own shape and the legacy
// gate's behaviour too — its text check never saw those either. Closing it needs a value-provenance fact no
// shared reader supplies today.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { readStaticAuthoredValue } from "../lib/static-authored-value.ts";

const ATTRIBUTE = "style";
const TOKEN_PREFIX = "--color-";
const OPERATION = "color-token-inline-override";

const MESSAGE =
  "an inline `style` prop overrides a `--color-*` design token — token overrides go through `<ThemeScope>`, " +
  "where the value is clamped at the boundary (parse-as-color; reject url()/expression()/@import). D44, " +
  "UI-Theming-and-Content.md §12.1.";
const FIX = "wrap the subtree in <ThemeScope> and pass the override there; a new sanctioned clamp home needs an exact reviewed grant, not an inline waiver.";

/** The `--color-*` keys a style prop's authored object sets, read through the shared static-value reader so
 *  a const-hoisted or imported object is the same fact. A value the reader refuses is not a subject. */
function overriddenTokens(attribute: MorphNode): readonly string[] {
  if (!Node.isJsxAttribute(attribute)) {
    return [];
  }
  const initializer = attribute.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return [];
  }
  const expression = initializer.getExpression();
  if (expression === undefined) {
    return [];
  }
  const value = readStaticAuthoredValue(expression);
  if (value.kind === "unresolved" || value.value.kind !== "object") {
    return [];
  }
  return value.value.properties.map((property) => property.key).filter((key) => key.startsWith(TOKEN_PREFIX));
}

export const gate = defineGate({
  id: "theme-override-only-via-scope",
  family: "theme-override-only-via-scope",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy scope regex was `/packages/(client|ui)/src/`; the clamp homes are NOT subtracted.
  population: ["@client", "@ui"],
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxAttribute],
          visit: (node, sourceFile): void => {
            if (!Node.isJsxAttribute(node) || node.getNameNode().getText() !== ATTRIBUTE) {
              return;
            }
            const tokens = overriddenTokens(node);
            if (tokens.length > 0) {
              candidates.push({ node, subject: ctx.relativePath(sourceFile), operation: OPERATION, token: ATTRIBUTE, offset: 0 });
            }
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div style={{ '--color-primary': 'red' }} />;\n" },
      expect: { count: 1, token: ATTRIBUTE },
      why: "the founding shape — an inline style overriding a color token outside the clamp",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/content/theme-scope/theme-scope.tsx": "export const T = () => <div style={{ '--color-primary': 'red' }} />;\n",
      },
      expect: { count: 1 },
      why: "THE CLAMP REDS TOO: it carries no static `--color-*` override on this tree (it hands `style` a computed CSSProperties), so it holds no grant row. A LITERAL override authored there is exactly the decision that belongs in review, which is what replaced a directory exemption licensing nothing",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/hoisted.tsx": "const vars = { '--color-primary': 'red' };\nexport const A = () => <div style={vars} />;\n",
      },
      expect: { count: 1 },
      why: "A CONST-HOISTED object is the same override one binding away — the shared static-value reader follows it, where the legacy `attr.getText()` check saw only the identifier `vars`",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/imported.tsx": 'import { vars } from "./vars.ts";\nexport const A = () => <div style={vars} />;\n',
        "packages/client/src/components/vars.ts": "export const vars = { '--color-primary': 'red' };\n",
      },
      expect: { count: 1 },
      why: "and the same object one MODULE away — the reader follows the import, which no text check can",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div style={{ width: 10 }} />;\n" },
      why: "an inline style that overrides no design token at all",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/comment.tsx":
          "export const A = () => (\n  // the plate used to set --color-primary here; it does not any more\n  <div style={{ width: 10 }} />\n);\n",
      },
      why: "THE TEXT COUNTERFACTUAL: a COMMENT mentioning the token is not an override. `attr.getText()` includes trivia, so the legacy check red exactly this shape",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/content/theme-scope/theme-scope.tsx":
          "declare function derive(seed: string): Record<string, string>;\nexport const T = (seed: string) => <div style={derive(seed)} />;\n",
      },
      why: "THE DECLARED LIMIT and the clamp's real shape: a COMPUTED style object is not statically readable, so it is not a subject. This is why the clamp needs no grant today — and the legacy text check was equally blind to it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/other-token.tsx": "export const A = () => <div style={{ '--space-inline': '4px' }} />;\n",
      },
      why: "a non-COLOR custom property is a different vocabulary and a different rule — this policy's subject is exactly the `--color-*` clamp",
    },
  ],
});
