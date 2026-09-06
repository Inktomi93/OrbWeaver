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
  "this JSX tag ends in `.Provider` but the checker resolves no readable identity for that member, so whether it is React's deprecated `Context.Provider` or an unrelated namespace component CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

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
  fix: "render the context directly — `<MyContext value={…}>` — and delete the `.Provider` access.",
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
  ],
});
