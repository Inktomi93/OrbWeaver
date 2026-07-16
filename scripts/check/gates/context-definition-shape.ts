// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TS/TSX fixture snippets, not secrets.
// Gate: context-definition-shape (client-architecture-lockdown.md §6b / §16 G3) — post-M3, the walls
// around the `defineContextTabs<S>` mint (`lib/registry-contracts.ts`). FOUR arms: (1) a hand-rolled
// `{ kind: "tabs", useResolved }` object literal outside the mint's own file — a badge-wearing tabs
// renderer bypassing the duplicate-id throw + the resolve/actions wiring; (2) a `defineContextTabs` call
// with `tabs: []` AND no `contributors` — a dead mint with no reachable content; (3) O5 strict — a
// `defineContextTabs` call or a `ContextTabDef<…>` type-ref whose type argument is not `void` and not an
// identifier resolving to a type EXPORTED from `registry-contracts.ts` (an inline literal/index
// signature/`any`/`unknown` escape re-opens the loose-projection hole O5 closed); (4) the dead
// CONTEXT_SLOTS↔bodies split resurrected — a `bodies: Record<string, ReactNode>`-shaped JSX attr or
// interface/type member under `client/src`.
import type { SourceFile, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { GateDescriptor } from "../contract.ts";

const CLIENT_SRC = "packages/client/src/";
const REGISTRY_CONTRACTS_RE = /\/lib\/registry-contracts\.ts$/;
const BODIES_RECORD_RE = /^(?:readonly\s+)?(?:Partial<\s*)?Record<\s*string\s*,\s*ReactNode\s*>>?$/;

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Arm 1 — a `{ kind:"tabs", useResolved }` object literal outside `registry-contracts.ts`: the ONLY
 *  legal minter of this shape is `defineContextTabs` itself. */
function checkMintOnlyTabs(sf: SourceFile, out: (line: number, message: string) => void): void {
  if (REGISTRY_CONTRACTS_RE.test(sf.getFilePath())) {
    return;
  }
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const kind = obj.getProperty("kind");
    if (kind === undefined || !Node.isPropertyAssignment(kind)) {
      continue;
    }
    const init = kind.getInitializer();
    if (init === undefined || readStringValue(init) !== "tabs") {
      continue;
    }
    if (obj.getProperty("useResolved") !== undefined) {
      out(
        obj.getStartLineNumber(),
        'a hand-rolled `{ kind: "tabs", useResolved }` object literal outside `lib/registry-contracts.ts` — ' +
          "a tabs ContextDefinition is minted ONLY by `defineContextTabs` (the duplicate-id throw + the " +
          "resolve/actions wiring live there) — client-architecture-lockdown.md §6b.",
      );
    }
  }
}

/** Arm 2 — `defineContextTabs({ tabs: [], … })` with no `contributors`: a dead mint, zero reachable tabs. */
function checkZeroTabMint(sf: SourceFile, out: (line: number, message: string) => void): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "defineContextTabs") {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
      continue;
    }
    const tabs = arg.getProperty("tabs");
    if (tabs === undefined || !Node.isPropertyAssignment(tabs)) {
      continue;
    }
    const tabsInit = tabs.getInitializer();
    const isEmptyArray = tabsInit !== undefined && Node.isArrayLiteralExpression(tabsInit) && tabsInit.getElements().length === 0;
    if (isEmptyArray && arg.getProperty("contributors") === undefined) {
      out(
        call.getStartLineNumber(),
        "`defineContextTabs` called with `tabs: []` and no `contributors` — a dead mint with no reachable " +
          "content (an intentional contributors-only mint MUST pass a `contributors` registry) — " +
          "client-architecture-lockdown.md §16 G3.",
      );
    }
  }
}

/** True when a type arg is `void` or an identifier whose declaration resolves to a type EXPORTED from
 *  `lib/registry-contracts.ts` (O5 strict — no any/unknown/inline literal/index signature escape). */
function isStrictProjectionArg(typeArg: TypeNode): boolean {
  if (typeArg.getKind() === SyntaxKind.VoidKeyword) {
    return true;
  }
  if (Node.isTypeReference(typeArg) && typeArg.getTypeArguments().length === 0) {
    const nameNode = typeArg.getTypeName();
    if (Node.isIdentifier(nameNode)) {
      return nameNode.getDefinitionNodes().some((def) => REGISTRY_CONTRACTS_RE.test(def.getSourceFile().getFilePath()));
    }
  }
  return false;
}

/** Arm 3 — every `defineContextTabs<S>` call and `ContextTabDef<S>` type-ref must spell `S` EXPLICITLY as
 *  `void` or an identifier resolving to a `registry-contracts.ts`-exported type (O5 strict/publication).
 *  A `defineContextTabs` call with NO type arg (relying on inference from `useContextState`) is RED. */
function checkStrictProjection(sf: SourceFile, out: (line: number, message: string) => void): void {
  const flagTypeArg = (typeArg: TypeNode, siteName: string): void => {
    if (isStrictProjectionArg(typeArg)) {
      return;
    }
    out(
      typeArg.getStartLineNumber(),
      `${siteName}'s type argument "${typeArg.getText()}" is not \`void\` and not an identifier resolving ` +
        "to a type EXPORTED from `lib/registry-contracts.ts` (O5 strict/publication) — publish the real " +
        "projection type there rather than an inline literal/index-signature/any/unknown escape — " +
        "client-architecture-lockdown.md §16 G3.",
    );
  };
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "defineContextTabs") {
      continue;
    }
    const typeArg = call.getTypeArguments()[0];
    // A MISSING type arg lets tsc INFER `S` from `useContextState`'s return, so an inline/anonymous
    // projection sails through unpublished — O5 requires `S` be SPELLED against a published type, so the
    // explicit arg is mandatory (`<void>` or a registry-contracts export), never inference.
    if (typeArg === undefined) {
      out(
        call.getStartLineNumber(),
        "a `defineContextTabs` call has no explicit type argument — O5 requires the projection type be " +
          "SPELLED (`<CharacterContextState>` / `<void>`), never inferred from `useContextState` (an " +
          "inline/anonymous return would leak an unpublished shape) — client-architecture-lockdown.md §16 G3.",
      );
      continue;
    }
    flagTypeArg(typeArg, "a `defineContextTabs` call");
  }
  for (const tr of sf.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    if (tr.getTypeName().getText() !== "ContextTabDef") {
      continue;
    }
    const typeArg = tr.getTypeArguments()[0];
    if (typeArg !== undefined) {
      flagTypeArg(typeArg, "a `ContextTabDef<…>` type reference");
    }
  }
}

/** Arm 4 — the dead CONTEXT_SLOTS↔bodies split resurrected: a `bodies` JSX attr, or a `bodies`
 *  interface/type-literal member typed `Record<string, ReactNode>` (readonly/Partial included). */
function checkBodiesSplit(sf: SourceFile, out: (line: number, message: string) => void): void {
  const flag = (line: number): void =>
    out(
      line,
      'a "bodies" member/attribute shaped `Record<string, ReactNode>` — the CONTEXT_SLOTS↔bodies split ' +
        "the mint killed structurally (tab id + label + when + body are ONE object; a route-injected " +
        "bodies map can silently miss an entry) — client-architecture-lockdown.md §6b.",
    );
  for (const sig of sf.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
    if (sig.getName() !== "bodies") {
      continue;
    }
    const typeNode = sig.getTypeNode();
    if (typeNode !== undefined && BODIES_RECORD_RE.test(typeNode.getText().replace(/\s+/g, " ").trim())) {
      flag(sig.getStartLineNumber());
    }
  }
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() === "bodies") {
      flag(attr.getStartLineNumber());
    }
  }
}

export const gate: GateDescriptor = {
  name: "context-definition-shape",
  docRow: "client-architecture-lockdown.md §6b / §16 G3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a CONTEXT-definition shape violates the `defineContextTabs<S>` mint's walls (client-architecture-" +
    'lockdown.md §6b): a hand-rolled `{kind:"tabs",useResolved}` outside the mint, a zero-tab mint with ' +
    "no contributors, a non-strict `S` (not `void`/a registry-contracts export), or a resurrected " +
    "`bodies: Record<string, ReactNode>` split.",
  fix: "mint tabs contexts via `defineContextTabs` only; give a contributors-only mint a real `contributors` registry; publish the projection type in `lib/registry-contracts.ts` and reference it by name; keep tab id+label+when+body as ONE object, never a route-injected bodies map.",
  scanRoot: (p) => p.includes(CLIENT_SRC),
  visitFile: (sf, ctx) => {
    const path = rel(sf.getFilePath());
    const report = (line: number, message: string): void => ctx.report({ file: path, line, column: 0, message });
    checkMintOnlyTabs(sf, report);
    checkZeroTabMint(sf, report);
    checkStrictProjection(sf, report);
    checkBodiesSplit(sf, report);
  },
  mustFlag: [
    {
      files: 'const badgeMint = { kind: "tabs", useResolved: () => null };\n',
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "hand-rolled" },
      why: 'arm 1 — a hand-rolled `{kind:"tabs",useResolved}` outside the mint file',
    },
    {
      files: 'const badgeMint = { kind: "tabs" as const, useResolved: () => null };\n',
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "hand-rolled" },
      why: 'arm 1 — `kind: "tabs" as const` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader silently PASSED before hardening',
    },
    {
      files:
        'import { defineContextTabs, type ChatContextState } from "#lib";\n' +
        "export const x = defineContextTabs<ChatContextState>({ useContextState: () => null, tabs: [] });\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      expect: { messageIncludes: "dead mint" },
      why: "arm 2 — a `defineContextTabs` call with `tabs: []` and no `contributors`",
    },
    {
      files:
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "export const x = defineContextTabs<any>({ useContextState: () => null, tabs: [] as any });\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "O5 strict" },
      why: "arm 3 — `defineContextTabs<any>` — the strict/publication arm rejects `any`",
    },
    {
      files:
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "export const x = defineContextTabs({\n" +
        "  useContextState: () => ({ leakedInlineShape: 1 }),\n" +
        '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
        "});\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { messageIncludes: "no explicit type argument" },
      why: "arm 3 — a `defineContextTabs` call with NO type arg — inference leaks an inline projection unpublished (O5)",
    },
    {
      files: "interface X {\n  readonly bodies: Record<string, ReactNode>;\n}\n",
      at: "packages/client/src/features/x/lib/x-types.ts",
      expect: { messageIncludes: "bodies" },
      why: "arm 4 — a `bodies: Record<string, ReactNode>` interface member — the resurrected split",
    },
  ],
  mustPass: [
    {
      files:
        "declare const VOID_STATE: void;\n" +
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "export const x = defineContextTabs<void>({\n" +
        "  useContextState: () => VOID_STATE,\n" +
        '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
        "});\n",
      at: "packages/client/src/features/discovery/lib/corpus-section.tsx",
      why: "a `void`-projection mint with a real tab — passes",
    },
    {
      files: {
        "packages/client/src/lib/registry-contracts.ts": "export interface CharacterContextState { readonly characterId: string }\n",
        "packages/client/src/features/character/lib/characters-section.tsx":
          'import type { CharacterContextState } from "../../../lib/registry-contracts";\n' +
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "export const x = defineContextTabs<CharacterContextState>({\n" +
          "  useContextState: () => null,\n" +
          '  tabs: [{ id: "a", label: "A", body: () => null }],\n' +
          "});\n",
      },
      why: "a mint whose `S` is an identifier resolving to a registry-contracts export, with real tabs — passes",
    },
    {
      files:
        "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
        "declare const chatContextContributors: unknown;\n" +
        "export const x = defineContextTabs<void>({\n" +
        "  useContextState: () => undefined,\n" +
        "  tabs: [],\n" +
        "  contributors: chatContextContributors,\n" +
        "});\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      why: "a contributors-only mint (`tabs: []` + a real `contributors`) — passes arm 2",
    },
    {
      files: "interface X {\n  readonly bodies: Record<string, number>;\n}\n",
      at: "packages/client/src/features/x/lib/x-types.ts",
      why: "a `bodies` member typed `Record<string, number>` (not ReactNode) — the false-positive check, passes",
    },
  ],
};
