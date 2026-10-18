// Context projections name void or a type published by registry-contracts.ts; inference is not publication.
// Native lint owns the literal construction walls. Whole-population region/bracket counts stay with health.
import type { TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { referenceResolutionServices, resolveModuleMemberOrigin } from "../../floor/code-facts/reference-fact.ts";
import { resolveTypeIdentityOrigin } from "../../floor/code-facts/type-member-origin.ts";
import { defineGate } from "../contract/policy.ts";
import { DEFINE_CONTEXT_TABS, REGISTRY_CONTRACTS_RE } from "../lib/context-definition-shape.ts";

const CONTEXT_TAB_DEF = "ContextTabDef";
const MESSAGE = "A context projection must explicitly name void or a type published by lib/registry-contracts.ts (O5 strict).";
const FIX =
  "Publish the projection in lib/registry-contracts.ts and reference it explicitly; do not infer or hand-declare a substitute. A deliberate exception waives with `@orb-waive context-definition-shape(<position>): <reason + end condition>` at the type argument, or defineContextTabs when it is missing.";
const NO_TYPE_ARG_MESSAGE = "A defineContextTabs call has no explicit type argument; O5 requires the published projection be spelled, never inferred.";

function strictProjectionMessage(siteName: string, text: string): string {
  return (
    `${siteName}'s type argument "${text}" is not \`void\` and not an identifier resolving to a type EXPORTED ` +
    "from `lib/registry-contracts.ts` (O5 strict/publication) — publish the real projection type there rather " +
    "than an inline literal/index-signature/any/unknown escape — client-architecture-state-and-gates.md §16 G3."
  );
}

function isStrictProjectionArg(typeArg: TypeNode): boolean {
  if (typeArg.getKind() === SyntaxKind.VoidKeyword) {
    return true;
  }
  if (!Node.isTypeReference(typeArg) || typeArg.getTypeArguments().length > 0) {
    return false;
  }
  const nameNode = typeArg.getTypeName();
  const origin = resolveModuleMemberOrigin(nameNode);
  const lexical = Node.isIdentifier(nameNode) ? referenceResolutionServices.declarationOf(nameNode) : undefined;
  if ((origin.kind === "unresolved" && origin.reason === "ambiguous") || (lexical?.kind === "unresolved" && lexical.reason === "ambiguous")) {
    // Declaration merging retains the published type; it is not an unreadable projection.
    const type = resolveTypeIdentityOrigin(typeArg);
    return type.kind === "resolved" && type.value.declarations.some((home) => REGISTRY_CONTRACTS_RE.test(home.getSourceFile().getFilePath()));
  }
  let declaration = lexical?.kind === "resolved" ? lexical.value : undefined;
  if (origin.kind === "resolved" && origin.value.canonical.kind === "project") {
    declaration = origin.value.canonical.declaration;
  }
  return declaration !== undefined && REGISTRY_CONTRACTS_RE.test(declaration.getSourceFile().getFilePath());
}

export const gate = defineGate({
  id: "context-definition-shape",
  family: "context-definition-shape",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node): void => {
          if (!Node.isCallExpression(node)) {
            return;
          }
          const expr = node.getExpression();
          if (!Node.isIdentifier(expr) || expr.getText() !== DEFINE_CONTEXT_TABS) {
            return;
          }
          const typeArg = node.getTypeArguments()[0];
          if (typeArg === undefined) {
            ctx.report.node(expr, { message: NO_TYPE_ARG_MESSAGE, fix: FIX });
          } else if (!isStrictProjectionArg(typeArg)) {
            ctx.report.node(typeArg, { message: strictProjectionMessage("a `defineContextTabs` call", typeArg.getText()), fix: FIX });
          }
        },
      },
      {
        kinds: [SyntaxKind.TypeReference],
        visit: (node): void => {
          if (!Node.isTypeReference(node) || node.getTypeName().getText() !== CONTEXT_TAB_DEF) {
            return;
          }
          const typeArg = node.getTypeArguments()[0];
          if (typeArg !== undefined && !isStrictProjectionArg(typeArg)) {
            ctx.report.node(typeArg, { message: strictProjectionMessage("a `ContextTabDef<…>` type reference", typeArg.getText()), fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import { defineContextTabs, type ChatContextState } from "#lib";\n' +
          "export const x = defineContextTabs<ChatContextState>({ useContextState: () => null, tabs: [] });\n",
      },
      expect: { count: 1, token: "ChatContextState", messageIncludes: "O5 strict" },
      why: "An unresolved projection import is not evidence of publication; native lint separately owns the empty-tabs wall.",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/lib/x-section.tsx":
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "export const x = defineContextTabs<any>({ useContextState: () => null, tabs: [{ id: 1 }] });\n",
      },
      expect: { count: 1, token: "any", messageIncludes: "O5 strict" },
      why: "arm 3 — `defineContextTabs<any>`: the strict/publication arm rejects `any`, and the position is the type argument's own first token",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/lib/x-section.tsx":
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "export const x = defineContextTabs({\n" +
          "  useContextState: () => ({ leakedInlineShape: 1 }),\n" +
          '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
          "});\n",
      },
      expect: { count: 1, token: DEFINE_CONTEXT_TABS, messageIncludes: "no explicit type argument" },
      why: "arm 3 — a `defineContextTabs` call with NO type arg lets tsc INFER `S` from `useContextState`'s return, so an inline/anonymous projection sails through unpublished. With no type argument there is no type-argument node to anchor on, so this one case anchors on the CALLEE — a node the dead-mint arm deliberately does not use",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/discovery/lib/corpus-section.tsx":
          "declare const VOID_STATE: void;\n" +
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "export const x = defineContextTabs<void>({\n" +
          "  useContextState: () => VOID_STATE,\n" +
          '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
          "});\n",
      },
      why: "a `void`-projection mint with a real tab. This is the `void` half of O5 strict — drop the `VoidKeyword` acceptance and this row is the one that dies",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry-contracts.ts": "export interface CharacterContextState { readonly characterId: string }\n",
        "packages/client/src/features/character/lib/characters-section.tsx":
          'import type { CharacterContextState } from "../../../lib/registry-contracts.ts";\n' +
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "export const x = defineContextTabs<CharacterContextState>({\n" +
          "  useContextState: () => null,\n" +
          '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
          "});\n",
      },
      why: "A projection imported from its actual published declaration is accepted; the unresolved-import control discriminates the other direction.",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry-contracts.ts": "export interface CharacterContextState { readonly characterId: string }\n",
        "packages/client/src/features/character/lib/namespace-section.tsx":
          'import type * as contracts from "../../../lib/registry-contracts.ts";\n' +
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "export const x = defineContextTabs<contracts.CharacterContextState>({\n" +
          "  useContextState: () => null,\n" +
          '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
          "});\n",
      },
      why: "THE NAMESPACE-QUALIFIED PUBLICATION spelling: the projection still resolves to the registry-contracts export and remains strict",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/lib/waived.tsx":
          "// @orb-waive context-definition-shape(any): bounded publication permission control; ends when the fixture is removed.\n" +
          "defineContextTabs<any>({tabs:[tab]});\n",
      },
      why: "The remaining publication finding binds its own type-argument token, not a retired literal-wall token.",
    },
  ],
});
