// React 19 deprecates `<Context.Provider>`; a context renders directly as `<Context>`. The SUBJECT is the
// `.Provider` member of a REACT CONTEXT — not every JSX tag whose last segment happens to be "Provider".
//
// THIS IS THE POLICY THE OLD ONE'S OWN EXEMPTIONS INDICTED. The legacy gate flagged any
// `JsxTagName.getName() === "Provider"`, and the tree carried three permanent legacy ignore markers naming
// this gate — Base UI's `Drawer.Provider`, `Tooltip.Provider` and `Toast.Provider`, each
// a namespace COMPONENT that has nothing to do with React context. Three standing markers whose reason is
// "the gate is asking the wrong question" are a detector defect, not an exemption vocabulary, so the
// markers are DELETED with this conversion and the identity is read instead: the `Provider` property symbol
// the checker resolves off the tag's receiver must be declared by React's own type surface.
//
// THIRD ANSWER, never silence: a `.Provider` tag whose member identity cannot be read at all is REPORTED as
// unreadable (GATE-AUTHORING §5, #944) — the spelling alone is not the identity in either direction.
//
// FAMILY `react-origin` — the shared reader is `lib/react-origin.ts` (canonical React export identity).
// This member takes its `REACT_TYPE_HOMES` door list rather than `reactExportVisitors`, because its subject
// is a TYPE MEMBER (`.Provider` off a context's type) rather than a module export; the door list is the one
// place the family says which `node_modules` homes declare React's public surface, so a future inline
// `react/index.d.ts` moves for all five members at once.
// POPULATION PORT: NOT byte-identical, and it moves in both directions. The legacy descriptor declared no
// `scanRoot` at all (`7ed48eca8^`), so its population was the legacy harness fileset (`packages/*/src` plus
// `tests/`); the final is `@authored` — a NARROWING by `packages/showcase-plugins/src` and a WIDENING by
// `tooling/src` + `scripts/`, both measured empty of subjects. The derivation and its planted control have
// ONE home, in the shared reader's own header, rather than three copies across this family.
// SUPERSEDED 2026-09-13 (lane cb-b-header-residue), the refuted text kept above: "it moves in both directions",
// "(`packages/*/src` plus `tests/`)" and "a WIDENING by `tooling/src` + `scripts/`" are REFUTED. The live legacy pass
// at `7ed48eca8^` loaded `_shared/ts-workspace.ts#harnessGlobs` (`lib/pass.ts:434`, `getWorkspace({ root })`), which
// already carried `tooling/src` and `scripts/`; the narrower glob list in `lib/harness.ts` served only the baseline
// writers. Measured over that tree's harness candidates: legacy − final = {`packages/showcase-plugins/src/index.ts`},
// final − legacy = ∅ — a one-file NARROWING, with the sets and controls at the end of this header.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-context-provider` descriptor at a4ec5c1b6525da029b9d35bda2c3c4b7720e5c0a, the parent of the conversion
// `7ed48eca8` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,196 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy harness
// dispatch (no `scanRoot`) admits 7,196 and final `population` admits 7,195. legacy − final =
// {`packages/showcase-plugins/src/index.ts`} — the one source of an authored package outside the declared composite
// roots (`@showcase` is not in `@authored`/`@packages`, #1980, `contract/population.ts`); a one-file NARROWING.
// final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by
// both; outside `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
// CURRENT 2026-09-21: showcase/default-content are members of `@authored`, closing the dated one-file
// narrowing above. The widened policy remains clean on the real tree.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { REACT_TYPE_HOMES } from "../lib/react-origin.ts";
import { declaredByAnyPackage, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { REACT_LOOKALIKE_HOME, REACT_TYPES_HOME, reactLookalikeProofModule, reactProofModule } from "./_proof/react.ts";

const MEMBER = "Provider";
const MESSAGE =
  "React 19 deprecates `<Context.Provider>`. You can now render `<Context>` directly. Drop the `.Provider` property access. (Spine-TypeScript-and-Patterns.md §1)";
const UNREADABLE =
  "this JSX tag ends in `.Provider` but the checker resolves no readable identity for that member, so whether it is React's deprecated `Context.Provider` or an unrelated namespace component CANNOT be established. Reported rather than passed: the spelling alone is not the identity. (tooling/src/verify/gates/GATE-AUTHORING.md)";

const REACT_PROOF = { [REACT_TYPES_HOME]: reactProofModule() };

const CONTEXT_HOST = ['import { createContext } from "react";', 'export const ThemeContext = createContext("night");', ""].join("\n");

function tagMemberAccess(node: MorphNode): MorphNode | undefined {
  const tagName = Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node) ? node.getTagNameNode() : undefined;
  if (tagName === undefined || !Node.isPropertyAccessExpression(tagName) || tagName.getName() !== MEMBER) {
    return;
  }
  return tagName;
}

export const gate = defineGate({
  id: "no-context-provider",
  family: "react-origin",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "render the context directly — `<MyContext value={…}>` — and delete the `.Provider` access. A " +
    "deliberate site is waived with `@orb-waive no-context-provider(<position>): <reason>` on the line " +
    "above, where <position> is the literal `Provider`.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
        visit: (node): void => {
          const access = tagMemberAccess(node);
          if (access === undefined) {
            return;
          }
          const origin = resolveTypeMemberOrigin(access);
          if (origin.kind === "unresolved") {
            ctx.report.node(access, { message: UNREADABLE, token: MEMBER, offset: access.getText().lastIndexOf(MEMBER) });
            return;
          }
          if (declaredByAnyPackage(origin.value.declarations, REACT_TYPE_HOMES)) {
            ctx.report.node(access, { token: MEMBER, offset: access.getText().lastIndexOf(MEMBER) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": `${CONTEXT_HOST}export function Host({ children }: { children: unknown }): unknown {\n  return <ThemeContext.Provider value="day">{children}</ThemeContext.Provider>;\n}\n`,
      },
      expect: { count: 1, token: "Provider" },
      why: "the founding shape — a real React context rendered through its deprecated `.Provider` property; the CLOSING tag is not a second finding",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": `${CONTEXT_HOST}export function Host(): unknown {\n  return <ThemeContext.Provider value="day" />;\n}\n`,
      },
      expect: { count: 1 },
      why: "the SELF-CLOSING arm — the same member on the other JSX element kind",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/context-home.ts": CONTEXT_HOST,
        "packages/client/src/feature/ui.tsx":
          'import { ThemeContext as Ctx } from "../context-home.ts";\nexport function Host(): unknown {\n  return <Ctx.Provider value="day" />;\n}\n',
      },
      expect: { count: 1 },
      why: "AN IMPORT ALIAS on the context itself: the receiver spelling changes but the resolved `Provider` property is still React's, which is the only thing the law is about",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": `${CONTEXT_HOST}export function Host(): unknown {\n  return <ThemeContext.Provider value="day" />;\n}\nexport function Second(): unknown {\n  return <ThemeContext.Provider value="night" />;\n}\n`,
      },
      expect: { count: 2 },
      why: "the verdict is per OCCURRENCE, not per context — two provider tags are two findings and two waiver positions",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/feature/ui.tsx":
          'declare const AnyThing: any;\nexport function Host(): unknown {\n  return <AnyThing.Provider value="day" />;\n}\n',
      },
      expect: { count: 1, token: "Provider", messageIncludes: "CANNOT be established" },
      why: "#1990/D1 — THE UNREADABLE ARM, PROVEN: the tag's receiver is opaque (`any`-typed), so `resolveTypeMemberOrigin` cannot place the `.Provider` member and every unresolved origin here reports unconditionally (:60-64) — not merely on a proven-foreign refusal. Reported rather than passed (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": `${CONTEXT_HOST}export function Host({ children }: { children: unknown }): unknown {\n  return <ThemeContext value="day">{children}</ThemeContext>;\n}\n`,
      },
      why: "the React 19 replacement this policy exists to drive traffic to — the context rendered directly",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/feature/ui.tsx":
          'export const MyProvider = (props: { value: string }): unknown => props.value;\nexport function Host(): unknown {\n  return <MyProvider value="day" />;\n}\n',
      },
      why: "a component merely NAMED Provider is untouched — it is not even a member access",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/base-namespace.tsx":
          "export const Root = (props: { children?: unknown }): unknown => props.children;\nexport const Provider = (props: { children?: unknown }): unknown => props.children;\n",
        "packages/ui/src/primitives/tooltip.tsx":
          'import * as BaseTooltip from "./base-namespace.tsx";\nexport function Wrap(props: { children?: unknown }): unknown {\n  return <BaseTooltip.Provider {...props} />;\n}\n',
      },
      why: "THE THREE LIVE MARKERS THIS CONVERSION DELETES: Base UI's `Tooltip.Provider` / `Drawer.Provider` / `Toast.Provider` are namespace COMPONENTS, not React contexts. The legacy gate red them by spelling and needed three permanent legacy ignore markers; the resolved member home passes them with no exemption at all",
    },
    {
      mode: "types",
      files: {
        [REACT_LOOKALIKE_HOME]: reactLookalikeProofModule(),
        "packages/client/src/feature/ui.tsx":
          'import { createContext } from "not-react";\nconst C = createContext("night");\nexport function Host(): unknown {\n  return <C.Provider value="day" />;\n}\n',
      },
      why: "SAME SHAPE, WRONG PACKAGE: another library's context-like object with a `Provider` property is not React's deprecated API — React 19's deprecation is what the law is about, and only the declaring package can say so",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": `${CONTEXT_HOST}export function Host({ children }: { children: unknown }): unknown {\n  // @orb-waive no-context-provider(Provider): the proof's stand-in reason; ends when this fixture stops flagging.\n  return <ThemeContext.Provider value="day">{children}</ThemeContext.Provider>;\n}\n`,
      },
      why: "POSITIONAL IDENTITY: the report anchors on the `.Provider` member access with the token `Provider`, so that member — not the context receiver and not the whole tag — is what an author waives. The fixture is mustFlag[0] (:73) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule().replace(
          "export interface Context<T> {\n  Provider: Provider<T>;\n  displayName?: string;\n}",
          "export interface Context<T> {\n  Provider: Provider<T>;\n  Consumer: Provider<T>;\n  displayName?: string;\n}",
        ),
        "packages/client/src/feature/ui.tsx": `${CONTEXT_HOST}export function Host(): unknown {\n  return <ThemeContext.Consumer value="day" />;\n}\n`,
      },
      why: "#1999 — THE MEMBER-NAME FENCE, PINNED (`tagMemberAccess`, :33): a `.Consumer` access on the SAME react-declared context resolves to a real React member but is not `.Provider`, so it must pass untouched. Cutting `tagName.getName() !== MEMBER` turns this red — every react-declared tag member, not only `.Provider`, would then be reported",
    },
  ],
});
