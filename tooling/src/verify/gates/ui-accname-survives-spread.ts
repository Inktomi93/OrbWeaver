// Gate: ui-accname-survives-spread — a `@orb/ui` seal that writes an ACCESSIBLE-NAME attribute AFTER the
// caller-props spread clobbers every caller's name silently: JSX later-wins, so `<div {...rest} aria-label=…>`
// makes the caller's `aria-label` unwinnable (avatar-stack shipped "N people" over both committed "N characters"
// callers for months; §13.10 asserts names are CORRECT, nothing asserted a caller's name SURVIVES). data-*/role
// seals stay legal. Member-expression/aliased/wrapped spreads are invisible; type-level Omit is conservatively flagged.
//
// FAMILY: declared SINGLETON (`ui-accname-survives-spread`). It consumes NO `lib/` reader — caller-bag
// resolution is ts-morph parameter/binding inspection on the nodes delivered to its own visitors — and no
// sibling policy judges JSX attribute-vs-spread ORDER. The a11y gates it sits beside each resolve a different
// subject through a different reader, so a merge would join verdicts that share no computation; a shared
// topic is not a family.
//
// THE REPORTED POSITION is the ATTRIBUTE NAME (`aria-label`), supplied with offset 0 on the JsxAttribute
// node; `fix` states the spelling. Two guarded attributes after one spread are two findings with two
// DIFFERENT position tokens, so they stay separately waivable — pinned by the `Pair` mustFlag row below,
// whose `token` names the SECOND of the two. Population `@ui`: this is a `@orb/ui` seal by design.
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement, Node, ParameterDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

/** The accessible-NAME/description attrs a caller legitimately customizes — the clobber class. `role`,
 *  `aria-live` and `data-*` are deliberately OUT: a primitive's role/liveness IS its semantic seal
 *  (status-chip's `role="status"`/`aria-live="polite"` after-spread is the sanctioned shape). */
const GUARDED = new Set(["aria-label", "aria-labelledby", "aria-describedby", "aria-description", "title"]);

const QUOTE_TRIM_RE = /^["']|["']$/gu;

const MESSAGE =
  "an accessible-name attribute written AFTER the caller-props spread — JSX later-wins, so a caller's " +
  'aria-label/title can NEVER take effect (the avatar-stack "N people" clobber: both live callers passed ' +
  '"N characters" and a screen reader never said it). Put the DEFAULT before the spread so the caller wins, ' +
  "or destructure the prop and merge it. See packages/ui/src/primitives/avatar-stack/avatar-stack.tsx.";
const FIX =
  "move the default attribute BEFORE the {...rest} spread (caller-passed values then win), or destructure the " +
  "prop out of rest and compose it explicitly. A deliberate post-spread seal is waived with " +
  "`// @orb-waive ui-accname-survives-spread(<position>): <reason>` on a line above the element, where " +
  "<position> is the GUARDED ATTRIBUTE NAME itself — `aria-label`, `title` — never the element or the spread. " +
  "Two guarded attributes after one spread are two findings with two positions, and take two markers.";

/** The caller-props bag the spread carries, resolved against the ENCLOSING function-like: either the rest
 *  element of a parameter ObjectBindingPattern (`{ a, ...rest }`) or a whole simple parameter (`props`).
 *  Returns the names destructured OUT of that same pattern (those are consumed, not clobbered);
 *  `undefined` = the spread identifier is not a caller bag at all (a local const, an import). */
function callerBagDestructuredNames(el: JsxSelfClosingElement | JsxOpeningElement, spreadName: string): ReadonlySet<string> | undefined {
  const fn = el.getFirstAncestor(
    (a) => a.isKind(SyntaxKind.FunctionDeclaration) || a.isKind(SyntaxKind.FunctionExpression) || a.isKind(SyntaxKind.ArrowFunction),
  );
  // ONE return path (the pass.ts accumulator idiom): tsc's noImplicitReturns wants every path to return,
  // biome calls a trailing bare return unnecessary — the accumulator satisfies both without suppressing either.
  let found: ReadonlySet<string> | undefined;
  if (fn !== undefined && (fn.isKind(SyntaxKind.FunctionDeclaration) || fn.isKind(SyntaxKind.FunctionExpression) || fn.isKind(SyntaxKind.ArrowFunction))) {
    for (const param of fn.getParameters()) {
      found = bagFromParam(param, spreadName);
      if (found !== undefined) {
        break;
      }
    }
  }
  return found;
}

/** One parameter's verdict: the consumed-name set when its binding carries the caller bag, else undefined. */
function bagFromParam(param: ParameterDeclaration, spreadName: string): ReadonlySet<string> | undefined {
  const nameNode = param.getNameNode();
  if (nameNode.isKind(SyntaxKind.Identifier)) {
    // the WHOLE props bag — nothing destructured out
    return nameNode.getText() === spreadName ? new Set() : undefined;
  }
  if (!nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
    return;
  }
  const elements = nameNode.getElements();
  if (!elements.some((e) => e.getDotDotDotToken() !== undefined && e.getName() === spreadName)) {
    return;
  }
  const names = new Set<string>();
  for (const e of elements) {
    if (e.getDotDotDotToken() === undefined) {
      // `{ "aria-label": label }` spells the property as a StringLiteral — strip its quotes.
      names.add((e.getPropertyNameNode() ?? e.getNameNode()).getText().replace(QUOTE_TRIM_RE, ""));
    }
  }
  return names;
}

function checkElement(el: JsxSelfClosingElement | JsxOpeningElement, report: (attr: JsxAttribute, name: string) => void): void {
  const attrs = el.getAttributes();
  let lastBagIndex = -1;
  let destructured: ReadonlySet<string> = new Set();
  attrs.forEach((a, i) => {
    if (!a.isKind(SyntaxKind.JsxSpreadAttribute)) {
      return;
    }
    const expr = a.getExpression();
    if (!expr.isKind(SyntaxKind.Identifier)) {
      return; // DECLARED LIMIT: a member-expression spread ({...p.rest}) is invisible
    }
    const names = callerBagDestructuredNames(el, expr.getText());
    if (names !== undefined) {
      lastBagIndex = i;
      destructured = names;
    }
  });
  if (lastBagIndex === -1) {
    return;
  }
  for (const a of attrs.slice(lastBagIndex + 1)) {
    if (!a.isKind(SyntaxKind.JsxAttribute)) {
      continue;
    }
    const name = a.getNameNode().getText();
    if (GUARDED.has(name) && !destructured.has(name)) {
      report(a, name);
    }
  }
}

export const gate = defineGate({
  id: "ui-accname-survives-spread",
  family: "ui-accname-survives-spread",
  authority: "ordinary",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxOpeningElement],
        visit: (node: Node) => {
          if (node.isKind(SyntaxKind.JsxSelfClosingElement) || node.isKind(SyntaxKind.JsxOpeningElement)) {
            checkElement(node, (attr, name) => {
              ctx.report.node(attr, { token: name, offset: 0 });
            });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/avatar-stack/avatar-stack.tsx":
          "export function AvatarStack({ className, items, ...rest }: { className?: string; items: string[]; 'aria-label'?: string }) {\n" +
          '  return <div {...rest} aria-label="N people" className={className} data-slot="x" role="group" />;\n' +
          "}\n",
      },
      expect: { count: 1, messageIncludes: "AFTER the caller-props spread" },
      why: "the founding shape — avatar-stack's post-spread aria-label default, unwinnable by both committed callers",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/chip/chip.tsx": 'export function Chip(props: { title?: string }) {\n  return <span {...props} title="always this" />;\n}\n',
      },
      expect: { count: 1 },
      why: "the WHOLE-props-parameter spelling of the same clobber — no destructuring, the whole caller bag loses",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/pair/pair.tsx":
          "export function Pair({ x, ...rest }: { x?: number }) {\n" +
          '  return (\n    <div {...rest} aria-label="a" aria-describedby="b">\n      <i />\n    </div>\n  );\n' +
          "}\n",
      },
      expect: { count: 2, token: "aria-describedby" },
      why: "a PAIRED (non-self-closing) element with TWO guarded attrs after the spread — one finding each, both token-named. `count` proves the pair and `token` names the SECOND: the two positions DIFFER, which is what keeps them separately waivable (one marker consumes one occurrence, matched on exact position identity)",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/omitted/omitted.tsx":
          'interface P { readonly title?: string }\nexport function Omitted(props: Omit<P, "title">) {\n  return <div {...props} title="fixed" />;\n}\n',
      },
      expect: { count: 1 },
      why: "the syntax policy deliberately does not resolve a type-level Omit; a direct caller-parameter spread remains conservatively governed",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/avatar-stack/avatar-stack.tsx":
          "export function AvatarStack({ className, items, ...rest }: { className?: string; items: string[] }) {\n" +
          '  return <div aria-label="N people" {...rest} className={className} data-slot="x" role="group" />;\n' +
          "}\n",
      },
      why: "the FIX shape — the default BEFORE the spread, so a caller's aria-label wins; data-slot/role seals after the spread stay legal",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/field/field.tsx":
          "export function Field({ 'aria-label': ariaLabel, ...rest }: { 'aria-label'?: string }) {\n" +
          '  return <input {...rest} aria-label={ariaLabel ?? "field"} />;\n' +
          "}\n",
      },
      why: "the prop is DESTRUCTURED out of rest and merged — consumed, not clobbered",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/chip/chip.tsx":
          'export function Chip({ src }: { src?: string }) {\n  return <img {...(src === undefined ? {} : { src })} aria-label="decorative" />;\n}\n',
      },
      why: "a conditional NARROW-object spread is not the caller bag — nothing of the caller's can be in it",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/box/box.tsx":
          "export function Box(props: { title?: string }) {\n  const styles = { id: 'x' };\n  return <div {...styles} title={props.title} />;\n}\n",
      },
      why: "a spread of a LOCAL const (not a parameter/rest binding) is not the caller bag — passes",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/deep/deep.tsx":
          'interface P { readonly wrap: { rest: object } }\nexport function Deep({ wrap }: P) {\n  return <div {...wrap.rest} aria-label="x" />;\n}\n',
      },
      why: "DECLARED LIMIT written down: a member-expression spread is invisible to this reader",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/wrapped/wrapped.tsx":
          'declare function filtered(value: object): object;\nexport function Wrapped(props: { title?: string }) {\n  return <div {...filtered(props)} title="fixed" />;\n}\n',
      },
      why: "DECLARED LIMIT: a caller bag behind a wrapper call is not a direct parameter spread",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/alias/alias.tsx":
          'export function Alias(props: { title?: string }) {\n  const caller = props;\n  return <div {...caller} title="fixed" />;\n}\n',
      },
      why: "DECLARED LIMIT: a local alias of the caller bag is not resolved back to the parameter",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/order/order.tsx":
          'export function Order(props: { title?: string }, callerOverrides: object) {\n  return <div {...props} title="default" {...callerOverrides} />;\n}\n',
      },
      why: "a later caller-parameter spread restores caller precedence after the default attribute",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/chip/chip.tsx":
          'export function Chip(props: { title?: string }) {\n  // @orb-waive ui-accname-survives-spread(title): a stand-in reason and its end condition.\n  return <span {...props} title="always this" />;\n}\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the SUPPLIED position (the guarded attribute NAME) suppresses the twin of mustFlag[1] — a ONE-finding fixture is used deliberately, since one marker consumes one occurrence and the two-attribute `Pair` shape would leave the second effective. Zero effective findings, zero authority alarms; a wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
  ],
});
