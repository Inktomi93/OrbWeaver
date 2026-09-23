// Policy: context-definition-shape (client-architecture-lockdown.md §6b / §16 G3, D119) —
// post-M3, the OCCURRENCE walls around the `defineContextTabs<S>` and `defineContextRegion` mints
// (`lib/registry-contracts.ts`). SIX arms, each a per-file verdict about one authored node:
//   1. a hand-rolled `{ kind: "tabs", useResolved }` object literal outside the mint's own file — a
//      badge-wearing tabs renderer bypassing the duplicate-id throw + the resolve/actions wiring;
//   2. a `defineContextTabs` call with `tabs: []` AND no `contributors` — a dead mint, no reachable
//      content;
//   3. O5 STRICT — a `defineContextTabs` call or a `ContextTabDef<…>` type-ref whose type argument is not
//      `void` and not a type reference resolving to a type EXPORTED from `registry-contracts.ts` (an inline
//      literal / index signature / `any` / `unknown` escape re-opens the loose-projection hole O5 closed),
//      and a call with NO explicit type argument at all (inference leaks an unpublished shape);
//   4. the dead CONTEXT_SLOTS↔bodies split resurrected — a `bodies: Record<string, ReactNode>`-shaped JSX
//      attribute or interface/type member;
//   5. a hand-rolled `{ claims, band }` region def outside the mint's own file (D119; the
//      claim is a HEAD-BAND claim since the context bracket, #860);
//   7. no feature paints shell chrome — the live `shell-panel-header` class literal under `features/**`
//      outside `features/app-shell/**`.
//
// ARMS 6 AND 8 ARE NOT HERE: they are COUNT arms ("at most ONE `defineContextRegion(` call site
// project-wide", "at most ONE writer of `data-context-bracket`") whose verdict cannot compose over a
// subset, so they are `execution: "entire-population"`, which is one-per-descriptor (§12.1). They live in
// `context-definition-shape-health.ts` under this same `family`, `authority: "hard"` — a count arm has no
// per-occurrence door to offer, and the legacy `ctx.scope.kind !== "project"` self-guard is replaced by
// the contract's own deferral of an `entire-population` policy under a narrowed request.
//
// DECLARED BLIND SPOT, carried from the legacy descriptor: arms 5 and 7 (and the health sibling's 6 and 8)
// read LITERAL shapes. A claim assembled through a variable, a re-export, or a computed property is
// invisible to them — the HUD-1 §10 CTs are the required second lens, not a nice-to-have.
//
// FAMILY `context-definition-shape` — the occurrence half and the hard `-health` half. A declared
// SINGLETON family in the `lib/`-reader sense: the subject reader is `lib/ast-read.ts`'s
// `readStringValue`, which is shared repo-wide rather than family-defining, and the mint vocabulary
// (`defineContextTabs` / `defineContextRegion` / `ContextTabDef`) is read straight off authored syntax.
// Re-derived 2026-09-12 across the whole gate corpus for those three literals: `section-registry-
// completeness` consumes the `registryDefinitionFacts.section` provider and judges SECTION definitions,
// never the CONTEXT mint, and shares no reader with this module. The census proposed "shared context-
// definition/static-shape facts"; there is no second consumer today and none is invented here.
//
// POPULATION PORT: byte-identical. The legacy `scanRoot` was `p.includes("packages/client/src/")`, and
// `@client` IS `packages/client/src/`. The fence is pinned by `mustPass[8]`, the only row that dies
// without it.
//
// ONE INTENTIONAL CORRECTION, forced by the ordinary-waiver contract. Every legacy arm reported a
// `{file, line, column: 0}` triple with NO position token at all, which `lib/ordinary-waiver.ts:394`
// rejects outright ("has no nonempty position token for waiver binding") — the legacy policy had no
// working waiver door. Every arm is now NODE-anchored on the authored token an author would actually
// waive: `useResolved` (arm 1), `tabs` (arm 2), the type argument's own first token or the callee
// `defineContextTabs` (arm 3), `bodies` (arm 4), `claims` (arm 5) and the class literal itself (arm 7).
// Arms 2 and 3's missing-type-argument case deliberately anchor on DIFFERENT nodes, because a call that
// is both a dead mint and untyped would otherwise emit two findings sharing one carrier AND one token —
// the shape `ordinary-waiver.ts` reports as `over-broad`, where every marker suppresses nothing and
// adding markers makes it worse. Marker receipt: ZERO live `@orb-gate-ignore context-definition-shape`
// markers on the tree (measured 2026-09-12), so nothing re-binds and nothing orphans.
//
// LEGACY SHA: aa8cf0d53 (`git show aa8cf0d53:tooling/src/verify/gates/context-definition-shape.ts`).
import type { Node as MorphNode, SourceFile, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { referenceResolutionServices, resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { DEFINE_CONTEXT_REGION, REGISTRY_CONTRACTS_RE } from "../lib/context-definition-shape.ts";
import { resolveTypeIdentityOrigin } from "../lib/type-member-origin.ts";

export const FEATURES_RE = /\/packages\/client\/src\/features\//u;
export const APP_SHELL_RE = /\/packages\/client\/src\/features\/app-shell\//u;
/** The live shell-chrome class vocabulary a feature may not paint (D119 fence 2). */
export const SHELL_CHROME_CLASSES = ["shell-panel-header"] as const;

const BODIES_RECORD_RE = /^(?:readonly\s+)?(?:Partial<\s*)?Record<\s*string\s*,\s*ReactNode\s*>>?$/u;
const DEFINE_CONTEXT_TABS = "defineContextTabs";
const CONTEXT_TAB_DEF = "ContextTabDef";

const MESSAGE =
  "a CONTEXT-definition shape violates the mint's walls (client-architecture-lockdown.md §6b · " +
  'D119): a hand-rolled `{kind:"tabs",useResolved}` or `{claims,band}` outside the mint, a ' +
  "zero-tab mint with no contributors, a non-strict `S`, a resurrected `bodies: Record<string, ReactNode>` " +
  "split, or a feature painting shell chrome.";
const FIX =
  "mint tabs contexts via `defineContextTabs` and band claims via `defineContextRegion` only; give a contributors-only mint a real `contributors` registry; publish the projection type in `lib/registry-contracts.ts` and reference it by name; keep tab id+label+when+body as ONE object; compose a claimed band from `@orb/ui` primitives instead of the shell's chrome classes. A deliberate exception waives with `@orb-waive context-definition-shape(<position>): <reason + end condition>`, and the position is the authored token the arm anchors on: `useResolved` for a hand-rolled tabs literal, `tabs` for a dead mint, the type argument's own first token (or the callee `defineContextTabs` when the type argument is MISSING) for O5 strict, `bodies` for the resurrected split, `claims` for a hand-rolled region def, and the bare class name (`shell-panel-header`) for feature-painted shell chrome.";

const HAND_ROLLED_TABS_MESSAGE =
  'a hand-rolled `{ kind: "tabs", useResolved }` object literal outside `lib/registry-contracts.ts` — a tabs ' +
  "ContextDefinition is minted ONLY by `defineContextTabs` (the duplicate-id throw + the resolve/actions " +
  "wiring live there) — client-architecture-lockdown.md §6b.";
const DEAD_MINT_MESSAGE =
  "`defineContextTabs` called with `tabs: []` and no `contributors` — a dead mint with no reachable content " +
  "(an intentional contributors-only mint MUST pass a `contributors` registry) — " +
  "client-architecture-lockdown.md §16 G3.";
const NO_TYPE_ARG_MESSAGE =
  "a `defineContextTabs` call has no explicit type argument — O5 requires the projection type be SPELLED " +
  "(`<CharacterContextState>` / `<void>`), never inferred from `useContextState` (an inline/anonymous return " +
  "would leak an unpublished shape) — client-architecture-lockdown.md §16 G3.";
const BODIES_MESSAGE =
  'a "bodies" member/attribute shaped `Record<string, ReactNode>` — the CONTEXT_SLOTS↔bodies split the mint ' +
  "killed structurally (tab id + label + when + body are ONE object; a route-injected bodies map can silently " +
  "miss an entry) — client-architecture-lockdown.md §6b.";
const HAND_ROLLED_REGION_MESSAGE =
  "a hand-rolled `{ claims, band }` region def outside `lib/registry-contracts.ts` — a `ContextRegionDef` is " +
  "minted ONLY by `defineContextRegion` (the one spelled home the single-claimant arm counts) — D119.";

function strictProjectionMessage(siteName: string, text: string): string {
  return (
    `${siteName}'s type argument "${text}" is not \`void\` and not an identifier resolving to a type EXPORTED ` +
    "from `lib/registry-contracts.ts` (O5 strict/publication) — publish the real projection type there rather " +
    "than an inline literal/index-signature/any/unknown escape — client-architecture-lockdown.md §16 G3."
  );
}

function shellChromeMessage(token: string): string {
  return (
    `the shell-chrome class \`${token}\` in a feature outside \`features/app-shell/**\` — a feature never paints ` +
    "the shell's band; a pane claimant composes its own chrome from `@orb/ui` primitives + token utilities " +
    "(D119 fence 2)."
  );
}

function isMintFile(sourceFile: SourceFile): boolean {
  return REGISTRY_CONTRACTS_RE.test(sourceFile.getFilePath());
}

/** True when a type arg is `void` or a reference whose declaration resolves to a type EXPORTED from
 *  `lib/registry-contracts.ts` (O5 strict — no any/unknown/inline literal/index signature escape). */
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

/** The `kind: "tabs"` + `useResolved` pair that only `defineContextTabs` may mint — anchored on
 *  `useResolved`, the property that makes the literal a RENDERER rather than a plain tagged object. */
function handRolledTabsAnchor(obj: MorphNode): MorphNode | undefined {
  let anchor: MorphNode | undefined;
  if (Node.isObjectLiteralExpression(obj)) {
    const kind = obj.getProperty("kind");
    const init = kind !== undefined && Node.isPropertyAssignment(kind) ? kind.getInitializer() : undefined;
    const renderer = init !== undefined && readStringValue(init) === "tabs" ? obj.getProperty("useResolved") : undefined;
    anchor = renderer === undefined ? undefined : nameNodeOf(renderer);
  }
  return anchor;
}

/** A `{ claims, band }` literal that is NOT the direct argument of a `defineContextRegion(` call —
 *  anchored on `claims`. (The `region:` renderer arm this also carried died with the whole-pane claim:
 *  since #860 a claim's band is FOLDED into the resolved `header` by `resolveContextTabs`, so there is no
 *  resolved-shape field left to hand-assemble.) */
function handRolledRegionAnchor(obj: MorphNode): MorphNode | undefined {
  let anchor: MorphNode | undefined;
  if (Node.isObjectLiteralExpression(obj)) {
    const claims = obj.getProperty("claims");
    const parent = obj.getParent();
    const minted = Node.isCallExpression(parent) && parent.getExpression().getText() === DEFINE_CONTEXT_REGION;
    const handRolled = claims !== undefined && obj.getProperty("band") !== undefined && !minted;
    anchor = handRolled ? nameNodeOf(claims) : undefined;
  }
  return anchor;
}

function nameNodeOf(property: MorphNode): MorphNode | undefined {
  return Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) || Node.isMethodDeclaration(property)
    ? property.getNameNode()
    : undefined;
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
  create: (ctx) => {
    const report = (node: MorphNode, message: string): void => ctx.report.node(node, { message, fix: FIX });
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ObjectLiteralExpression],
          visit: (node, sourceFile): void => {
            if (isMintFile(sourceFile)) {
              return;
            }
            const tabs = handRolledTabsAnchor(node);
            if (tabs !== undefined) {
              report(tabs, HAND_ROLLED_TABS_MESSAGE);
            }
            const region = handRolledRegionAnchor(node);
            if (region !== undefined) {
              report(region, HAND_ROLLED_REGION_MESSAGE);
            }
          },
        },
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
            reportDeadMint(node, report);
            const typeArg = node.getTypeArguments()[0];
            if (typeArg === undefined) {
              report(expr, NO_TYPE_ARG_MESSAGE);
            } else if (!isStrictProjectionArg(typeArg)) {
              report(typeArg, strictProjectionMessage("a `defineContextTabs` call", typeArg.getText()));
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
              report(typeArg, strictProjectionMessage("a `ContextTabDef<…>` type reference", typeArg.getText()));
            }
          },
        },
        {
          kinds: [SyntaxKind.PropertySignature, SyntaxKind.JsxAttribute],
          visit: (node): void => {
            if (Node.isPropertySignature(node) && node.getName() === "bodies") {
              const typeNode = node.getTypeNode();
              if (typeNode !== undefined && BODIES_RECORD_RE.test(typeNode.getText().replace(/\s+/gu, " ").trim())) {
                report(node.getNameNode(), BODIES_MESSAGE);
              }
              return;
            }
            if (Node.isJsxAttribute(node) && node.getNameNode().getText() === "bodies") {
              report(node.getNameNode(), BODIES_MESSAGE);
            }
          },
        },
        {
          kinds: [
            SyntaxKind.StringLiteral,
            SyntaxKind.NoSubstitutionTemplateLiteral,
            SyntaxKind.TemplateHead,
            SyntaxKind.TemplateMiddle,
            SyntaxKind.TemplateTail,
          ],
          visit: (node, sourceFile): void => {
            const path = sourceFile.getFilePath();
            if (!FEATURES_RE.test(path) || APP_SHELL_RE.test(path)) {
              return;
            }
            const text = node.getText();
            const hit = SHELL_CHROME_CLASSES.find((token) => text.includes(token));
            if (hit !== undefined) {
              ctx.report.node(node, { token: hit, offset: text.indexOf(hit), message: shellChromeMessage(hit), fix: FIX });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/client/src/features/x/lib/x-section.tsx": 'const badgeMint = { kind: "tabs", useResolved: () => null };\n' },
      expect: { count: 1, token: "useResolved" },
      why: 'arm 1 — a hand-rolled `{kind:"tabs",useResolved}` outside the mint file. The position is `useResolved`, the property that makes the literal a RENDERER; the legacy report carried no token at all and had no waiver door',
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/lib/x-section.tsx": 'const badgeMint = { kind: "tabs" as const, useResolved: () => null };\n' },
      expect: { count: 1, token: "useResolved" },
      why: 'arm 1 — `kind: "tabs" as const` (an AsExpression) is the wrapped-literal shape a plain StringLiteral reader silently PASSED before hardening; `readStringValue` sees through `as`/`satisfies`/parens',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import { defineContextTabs, type ChatContextState } from "#lib";\n' +
          "export const x = defineContextTabs<ChatContextState>({ useContextState: () => null, tabs: [] });\n",
      },
      expect: { count: 2, token: "tabs", messageIncludes: "dead mint" },
      why: "arm 2 — a `defineContextTabs` call with `tabs: []` and no `contributors`. TWO findings, and the second is arm 3: `ChatContextState` is imported from an unresolvable specifier, so it resolves to no registry-contracts export and fails O5 strict. The `tabs` position is deliberately NOT the callee, so the dead-mint and the untyped-call arms can never collide on one carrier and one token",
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
    {
      mode: "types",
      files: { "packages/client/src/features/x/lib/x-types.ts": "interface X {\n  readonly bodies: Record<string, ReactNode>;\n}\n" },
      expect: { count: 1, token: "bodies" },
      why: "arm 4 — a `bodies: Record<string, ReactNode>` interface member: the resurrected CONTEXT_SLOTS↔bodies split",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/lib/x-region.tsx": 'export const hud = { id: "x.hud", claims: () => true, band: () => null };\n' },
      expect: { count: 1, token: "claims" },
      why: "arm 5 — a hand-rolled `{ claims, band }` region def bypassing `defineContextRegion`",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/x-band.tsx": 'export const band = <header className="shell-panel-header" />;\n' },
      expect: { count: 1, token: "shell-panel-header" },
      why: "arm 7 — a feature painting the shell's band. The position is the BARE class name inside the literal, not the quoted literal: a string-literal token includes its quotes, and the class name alone is what an author would type in a marker",
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
      why: "THE PUBLICATION HALF of O5 strict: an `S` that is an identifier RESOLVING to a registry-contracts export, imported by a specifier that reaches a real file in this row's own map. Drop the shared declaration-origin home test and this row still passes — but drop the requirement that the home BE registry-contracts and mustFlag[2]'s second finding disappears, which is the direction that matters",
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
        "packages/client/src/features/chat/lib/chats-section.tsx":
          "declare function defineContextTabs<S>(spec: unknown): unknown;\n" +
          "declare const chatContextContributors: unknown;\n" +
          "export const x = defineContextTabs<void>({\n" +
          "  useContextState: () => undefined,\n" +
          "  tabs: [],\n" +
          "  contributors: chatContextContributors,\n" +
          "});\n",
      },
      why: "THE CONTRIBUTORS FENCE, pinned: a contributors-only mint (`tabs: []` plus a real `contributors`) has reachable content. Drop the `contributors` test and this row is the one that dies",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/lib/x-types.ts": "interface X {\n  readonly bodies: Record<string, number>;\n}\n" },
      why: "THE BODIES SHAPE FENCE, pinned: a `bodies` member typed `Record<string, number>` is not the ReactNode slot map. Drop `BODIES_RECORD_RE` and this row is the one that dies",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/rpg/lib/rpg-hud-region.tsx":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const hud = defineContextRegion({ id: "rpg.hud", claims: () => true, band: () => null });\n',
      },
      why: "THE MINT FENCE for arm 5, pinned: the single minted band claim — the `{ claims, band }` literal IS the direct argument of `defineContextRegion`. Drop the parent-call test and this row is the one that dies",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry-contracts.ts":
          'export const tabsDefinition = { kind: "tabs", useResolved: () => null };\nexport const regionDefinition = { claims: () => true, band: () => null };\n',
      },
      why: "THE MINT-FILE EXEMPTION, pinned for BOTH literal arms: `lib/registry-contracts.ts` is the one legal minter of these two shapes, so the identical literals there are the definitions themselves. Drop `REGISTRY_CONTRACTS_RE` from the object-literal visitor and this row reports twice — it is the only row that dies",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/rpg/components/rpg-hud-band.tsx":
          "// the `.shell-panel-header` band is the shell's, not this feature's\nexport const x = 1;\n",
      },
      why: "arm 7 FALSE-POSITIVE control: a COMMENT naming the shell-chrome class is not painting it. Only STRING/TEMPLATE literal nodes are read, never `sf.getFullText()`, so this policy is comment-SAFE",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/app-shell/components/panel.tsx": 'export const band = <header className="shell-panel-header" />;\n' },
      why: "THE APP-SHELL EXEMPTION for arm 7, pinned: `shell-panel-header` IS the shell's own vocabulary, and `features/app-shell/**` is where the shell lives. Drop `APP_SHELL_RE` and this row is the one that dies",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/domain/x/verbs/x.ts": 'const badgeMint = { kind: "tabs", useResolved: () => null };\n',
      },
      why: 'THE POPULATION FENCE, pinned: the identical hand-rolled literal in `@server` is not a finding — the context mint is a CLIENT registry law. Drop `population: "@client"` and this is the only row that dies. The clean client `anchor.ts` beside it is mandatory: a fence falsifier whose only file sits outside the population admits zero paths and tool-errors instead of reporting',
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/lib/tagged.ts": 'export const tagged = { kind: "tabs", label: "A" };\n' },
      why: 'THE `useResolved` FENCE for arm 1, pinned: a `{ kind: "tabs" }` literal with no `useResolved` renders nothing and is a plain tagged object — a discriminated-union member, not a badge-wearing ContextDefinition. Drop the `useResolved` requirement and this row is the one that dies',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/lib/waived.tsx":
          "// @orb-waive context-definition-shape(useResolved): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'const badgeMint = { kind: "tabs", useResolved: () => null };\nexport const x = badgeMint;\n',
      },
      why: "POSITIONAL IDENTITY (§4.2): arm 1 anchors on `useResolved`, so an author waives the renderer property the finding points at — not the literal and not the module. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});

/** Arm 2 — `defineContextTabs({ tabs: [], … })` with no `contributors`, anchored on `tabs`. */
function reportDeadMint(call: MorphNode, report: (node: MorphNode, message: string) => void): void {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const arg = call.getArguments()[0];
  if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
    return;
  }
  const tabs = arg.getProperty("tabs");
  if (tabs === undefined || !Node.isPropertyAssignment(tabs)) {
    return;
  }
  const tabsInit = tabs.getInitializer();
  const isEmptyArray = tabsInit !== undefined && Node.isArrayLiteralExpression(tabsInit) && tabsInit.getElements().length === 0;
  if (isEmptyArray && arg.getProperty("contributors") === undefined) {
    report(tabs.getNameNode(), DEAD_MINT_MESSAGE);
  }
}
