// Policy: empty-state-has-action (rule 1, "no dead ends") — an
// `<EmptyState>` rendered in a feature must offer a next step. Without one the user reaches a screen that
// states a fact and gives them nowhere to go.
//
// AUTHORITY IS ordinary, and the sixteen path rows are GONE. The exception census rules that a path-only
// file allowlist cannot be copied verbatim, because a file row suppresses every matching occurrence in
// that file — including the dead end someone adds tomorrow — and offers the two honest replacements: one
// exact grant per justified OCCURRENCE, or the central ordinary marker. There is no stable per-occurrence
// SUBJECT to key a grant on (a title is often an expression, and an index moves on the next edit), so the
// marker is the exact instrument: it lives AT the occurrence, consumes exactly one finding, and carries
// its own reason. Each of the sixteen rows' rationales was translated to the site it was written about,
// and a second dead end in the same file is now its own decision instead of riding a neighbour's row.
//
// THE STALE ARM IS GONE WITH THE TABLE. Legacy re-implemented liveness by hand — a `finalize` sweep over
// the allowlist keys, anchored on a real-tree file so a synthetic fileset could not call every row stale.
// The central engine owns both halves for markers: an unused marker, a marker at a dead position and a
// marker covering more than one finding are all reconciliation findings, on the same run.
//
// IDENTITY, NOT SPELLING. The legacy check compared the tag's TEXT to `EmptyState`, so an aliased import,
// a namespace member and a re-export were invisible while any same-named local component matched. The
// subject is the canonical declaration in the `@orb/ui` empty-state primitive, resolved through the shared
// sealed-origin reader; an unreadable door is reported (fail-closed) rather than silently passed.
//
// WIDENED, deliberately: legacy subscribed only to `JsxSelfClosingElement`, so the PAIRED spelling
// `<EmptyState …></EmptyState>` was outside its subject entirely. Both tag kinds are judged here.
//
// UNCHANGED: a SPREAD attribute is treated as satisfying the rule. It may carry a conditional `action`
// this policy cannot statically resolve, and accusing it would demand a fix for something that may
// already be correct.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `empty-state-has-action` descriptor at 5dd83aaa42c85c361d321fe56bf13063c93edf17, the parent of the conversion
// `4885cde80` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,263 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 620 and final `population` admits 620. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/features/app-shell/anchors/__cbbhr_in_region-anchor.tsx` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
//
// FAMILY: a declared SINGLETON under its own id. Its readers are corpus-wide primitives — `lib/sealed-origin.ts`
// (`readSealedOrigin`, `sealedOriginReports`) and `lib/origin-verdict.ts#referenceNamesExport`, shared with seals
// over other homes — and no sibling policy judges an `EmptyState`'s next step.
import type { JsxOpeningElement, JsxSelfClosingElement, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { referenceNamesExport } from "../lib/origin-verdict.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

const TAG = "EmptyState";
const ACTION = "action";
/** The primitive's implementation home — an absolute-path infix, because the declaration lives OUTSIDE this
 *  policy's population (`@client` features), where `ctx.relativePath` refuses by contract. */
const EMPTY_STATE_HOME = { pathInfix: "/packages/ui/src/primitives/empty-state/", exportedNames: new Set([TAG]) };

const MESSAGE =
  "an <EmptyState> with no `action` CTA (D62 rule 1, packages/ui/src/primitives/empty-state/empty-state.tsx) — every empty state must " +
  "offer a next-step affordance so the user is not stranded at a dead end. A state that genuinely has no " +
  "next step (the affordance lives in a sibling pane, or the dialog's own Close is the only move) takes an " +
  "`@orb-waive empty-state-has-action(EmptyState): <reason and end condition>` at the occurrence.";
const FIX =
  "pass an `action` prop (an @orb/ui Button, typically), or waive the occurrence with the reason it has no " +
  "next step. A deliberate site is waived with `@orb-waive empty-state-has-action(<position>): <reason>` on " +
  "the line above, where <position> is the Empty-state component's own JSX tag name as imported (e.g. `Empty`).";

/** Does this tag carry an `action` prop, or a SPREAD that might (a conditional CTA no static read resolves)? */
function hasAction(element: JsxOpeningElement | JsxSelfClosingElement): boolean {
  return element.getAttributes().some((attribute) => {
    if (Node.isJsxSpreadAttribute(attribute)) {
      return true;
    }
    return Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === ACTION;
  });
}

/** The JSX tag delivered to the visitor, in either spelling. */
function jsxElement(node: MorphNode): JsxOpeningElement | JsxSelfClosingElement | undefined {
  return Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node) ? node : undefined;
}

export const gate = defineGate({
  id: "empty-state-has-action",
  family: "empty-state-has-action",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**"], ext: ["tsx"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
        visit: (node): void => {
          const element = jsxElement(node);
          if (element === undefined || hasAction(element)) {
            return;
          }
          const tagName = element.getTagNameNode();
          // The NAME PREFILTER that keeps fail-closure honest: only a tag that could name the primitive is
          // ever resolved, so an unreadable verdict accuses a candidate rather than every opaque tag.
          if (!referenceNamesExport(tagName, TAG)) {
            return;
          }
          if (sealedOriginReports(readSealedOrigin(tagName, EMPTY_STATE_HOME), tagName)) {
            ctx.report.node(tagName, { token: tagName.getText(), offset: 0, message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/client/src/features/demo/thing.tsx":
          'import { EmptyState } from "../../../../ui/src/primitives/empty-state/empty-state.tsx";\nexport const G = (): unknown => <EmptyState title="Nothing here" />;\n',
      },
      expect: { count: 1, token: TAG },
      why: "the founding shape — an empty state with no next-step CTA, which strands the user (§3.2)",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/client/src/features/demo/paired.tsx":
          'import { EmptyState } from "../../../../ui/src/primitives/empty-state/empty-state.tsx";\nexport const G = (): unknown => <EmptyState title="Nothing here"></EmptyState>;\n',
      },
      expect: { count: 1, token: TAG },
      why: "THE PAIRED SPELLING, newly in subject: legacy subscribed only to self-closing tags, so writing the same dead end with a closing tag left the rule with nothing to judge",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/client/src/features/demo/alias.tsx":
          'import { EmptyState as Empty } from "../../../../ui/src/primitives/empty-state/empty-state.tsx";\nexport const G = (): unknown => <Empty title="Nothing here" />;\n',
      },
      expect: { count: 1, token: "Empty" },
      why: "THE ALIAS RED: the same primitive under another local name is the same dead end, and the token the finding carries is the AUTHORED tag — which is what an `@orb-waive` position must name",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/ui/src/primitives/empty-state/index.ts": 'export { EmptyState } from "./empty-state.tsx";\n',
        "packages/client/src/features/demo/barrel.tsx":
          'import { EmptyState } from "../../../../ui/src/primitives/empty-state/index.ts";\nexport const G = (): unknown => <EmptyState title="Nothing here" />;\n',
      },
      expect: { count: 1, token: TAG },
      why: "a name-preserving RE-EXPORT resolves to the same canonical declaration — a barrel hop is not a different component",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/client/src/features/demo/ok.tsx":
          'import { EmptyState } from "../../../../ui/src/primitives/empty-state/empty-state.tsx";\nexport const G = (): unknown => <EmptyState action={<button type="button">Go</button>} title="Nothing here" />;\n',
      },
      why: "the fix: the empty state carries its next-step affordance",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/client/src/features/demo/spread.tsx":
          'import { EmptyState } from "../../../../ui/src/primitives/empty-state/empty-state.tsx";\nexport const G = (cond: boolean): unknown => <EmptyState title="x" {...(cond ? { action: 1 } : {})} />;\n',
      },
      why: "UNCHANGED BY DESIGN: a spread MIGHT carry a conditional `action` no static read can resolve, so accusing it would demand a fix for something that may already be correct",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/client/src/features/demo/local.tsx":
          'function EmptyState(props: { title: string }): unknown {\n  return props.title;\n}\nexport const G = (): unknown => <EmptyState title="Nothing here" />;\n',
      },
      why: "THE COUNTERFACTUAL: a LOCAL component with the primitive's name is a different identity — the legacy tag-text check accused it",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/empty-state/empty-state.tsx": "export declare function EmptyState(props: { title: string; action?: unknown }): unknown;\n",
        "packages/client/src/features/demo/anchor.tsx": "export const G = (): unknown => null;\n",
        "packages/ui/src/primitives/empty-state/demo.tsx":
          'import { EmptyState } from "./empty-state.tsx";\nexport const G = (): unknown => <EmptyState title="x" />;\n',
      },
      why: "SCOPE: an `<EmptyState>` outside `features/**` is the primitive's own surface, not a feature dead end — it is not in the population at all",
    },
  ],
});
