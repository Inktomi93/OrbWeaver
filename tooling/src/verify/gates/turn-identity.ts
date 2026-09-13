// Ledger D16/D17/D19: the turn pipeline runs as the HOST (`runAsUserId`) with `triggeredBy` as the
// responsible human, so `domain/chat/engine/**` is PRINCIPAL-BLIND. Two arms, ONE reason. IDENTITY: a
// reference that resolves to the canonical `@orb/contracts` `Principal` — alias, namespace member and
// re-export included, a same-named export of another module excluded. VOCABULARY: a lowercase `principal`
// identifier, an intentional NAME ban (if the caller's id cannot be NAMED here it cannot flow to
// `resolveCredential`/`loadUserSettings`). The token distinguishes the arms; limits are in mustPass.
//
// FAMILY `turn-identity` — a declared SINGLETON. `lib/sealed-origin.ts` is a shared READER, not a family: it
// serves five seals over five homes. No sibling policy judges the chat engine's identity boundary.
//
// POPULATION PORT: byte-identical, legacy at `e5a7a8a8c^` (`scanRoot: (p) => ENGINE_ANCHORED.test(p)`); the
// final expression beside the population const admits exactly that set.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `turn-identity` descriptor at 509671ae2e013b6d07fe6f7e9e744e0d7cbac946, the parent of the conversion `e5a7a8a8c`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,183 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 10 and
// final `population` admits 10. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/chat/engine/__cbbhr_in_auto-mode.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

const PRINCIPAL_TYPE = "Principal";
const PRINCIPAL_OBJECT = "principal";

/** `Principal` is declared once, at `packages/contracts/src/identity/index.ts` (the type-home law makes a
 *  same-spelled declaration elsewhere a DIFFERENT type). The home is the identity DIRECTORY so an internal
 *  split cannot silently retire the arm. */
const IDENTITY_HOME: SealedHome = { pathInfix: "/packages/contracts/src/identity/", exportedNames: new Set([PRINCIPAL_TYPE]) };

const MESSAGE =
  "the chat engine is Principal-BLIND (D19 turn-identity): identity reaches it only as the resolved triple " +
  "(runAsUserId + triggeredBy — engine/turn-identity.ts). Neither the contracts `Principal` type nor a " +
  "`principal` object may be NAMED in the engine; resolve the triple at the verb layer and pass it down " +
  "(D16/D17/D19).";

const FIX =
  "resolve the identity triple (runAsUserId + triggeredBy) at the verb layer and pass it down; the " +
  "caller's Principal stays at the verb layer. A deliberate site is waived with `@orb-waive " +
  "turn-identity(<position>): <reason>` on the line above, where <position> is the literal `Principal` or " +
  "the literal `principal`, whichever arm fired.";

/** Legacy `scanRoot` tested `/packages\\/server\\/src\\/domain\\/chat\\/engine\\//` against the repo path. */
const ENGINE_POPULATION = { in: ["@server"], under: ["packages/server/src/domain/chat/engine/**"] } as const;

/** The IDENTITY arm's candidate set: an import specifier (whose `getName()` is the exported name even under
 *  an alias) or a member read spelled with the exported name (the namespace door). A bare identifier USE of
 *  an already-reported import is deliberately not a second occurrence. */
function identityCandidate(node: Node): Node | null {
  if (Node.isImportSpecifier(node)) {
    return node.getName() === PRINCIPAL_TYPE ? node : null;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return null;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && member.value.name === PRINCIPAL_TYPE ? node : null;
}

export const gate = defineGate({
  id: "turn-identity",
  family: "turn-identity",
  authority: "ordinary",
  severity: "error",
  population: ENGINE_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
        visit: (node) => {
          const anchor = identityCandidate(node);
          if (anchor === null) {
            return;
          }
          // FAIL-CLOSED THROUGH THE SHARED DECISION: an unreadable `Principal` import DOOR is reported,
          // while a proven foreign origin and a candidate that provably binds a non-module declaration both
          // acquit. `readSealedOrigin` returns the VERDICT; `sealedOriginReports` is the decision.
          if (sealedOriginReports(readSealedOrigin(anchor, IDENTITY_HOME), anchor)) {
            ctx.report.node(anchor, { token: PRINCIPAL_TYPE, offset: anchor.getText().indexOf(PRINCIPAL_TYPE) });
          }
        },
      },
      {
        kinds: [SyntaxKind.Identifier],
        visit: (node) => {
          // THE VOCABULARY ARM IS A NAME BAN BY DESIGN, and it is the backstop that makes the identity arm's
          // narrowing safe: a local object named `principal` carries the caller's id just as well as the
          // contracts type does, and the engine may not name it either way.
          if (node.getText() === PRINCIPAL_OBJECT) {
            ctx.report.node(node, { token: PRINCIPAL_OBJECT, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts": "export interface Principal {\n  readonly userId: string;\n}\n",
        "packages/server/src/domain/chat/engine/a.ts":
          'import type { Principal } from "../../../../../contracts/src/identity/index.ts";\nexport const p: Principal = { userId: "u" };\n',
      },
      expect: { count: 1, token: "Principal" },
      why: "the founding shape — the caller's identity TYPE named inside the engine, which is how the id reaches a wallet lookup",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts": "export interface Principal {\n  readonly userId: string;\n}\n",
        "packages/server/src/domain/chat/engine/alias.ts":
          'import type { Principal as Caller } from "../../../../../contracts/src/identity/index.ts";\nexport const p: Caller = { userId: "u" };\n',
      },
      expect: { count: 1, token: "Principal" },
      why: "AN IMPORT ALIAS is the same type — the identity arm keys on the canonical declaration, so renaming the binding is not an escape",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts": "export interface Principal {\n  readonly userId: string;\n}\n",
        "packages/contracts/src/index.ts": 'export type { Principal } from "./identity/index.ts";\n',
        "packages/server/src/domain/chat/engine/reexport.ts":
          'import type { Principal } from "../../../../../contracts/src/index.ts";\nexport const p: Principal = { userId: "u" };\n',
      },
      expect: { count: 1, token: "Principal" },
      why: "A RE-EXPORT through the contracts barrel is the same declaration — the barrel is not a laundry for a blindness rule",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/engine/b.ts": "export function h(principal: { readonly userId: string }): string {\n  return principal.userId;\n}\n",
      },
      expect: { count: 2, token: "principal" },
      why: "the VOCABULARY arm — a lowercase `principal` binding AND its use are each an occurrence of the name the engine may not carry; per-occurrence granularity is what lets a single site be waived without blessing the file",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/engine/quoted.ts":
          'export const bag: Record<string, string> = { principal: "u" };\nexport const v = bag["principal"];\n',
      },
      expect: { count: 1, token: "principal" },
      why: 'DECLARED LIMIT, written down as a MIXED row: an object KEY spelled `principal` is an Identifier and is reported, while the QUOTED read `bag["principal"]` is a string literal and is not. The arm bans the identifier spelling, deliberately — a string key cannot be a typed carrier of the caller\'s id',
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/engine/unreadable.ts": 'import type { Principal } from "./missing.ts";\nexport type P = Principal;\n' },
      expect: { count: 1, token: "Principal" },
      why: "FAIL-CLOSED — a `Principal` door that does not resolve is reported; a blindness rule that an unreadable module can walk through is not one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/engine/local-bag.ts": "const bag = { Principal: 1 };\nexport const n = bag.Principal;\n",
      },
      why: 'THE LOCAL-OBJECT COUNTERFACTUAL — a plain object whose KEY is spelled like the sealed export binds a property, not a module member, so it is NOT A SUBJECT. `readSealedOrigin` returns `unresolved` here and the shared decision function scopes that refusal (lib/sealed-origin.ts): reading the VERDICT as the DECISION (`kind !== "foreign"`) accuses this row on unmodified source (#2006)',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts": "export interface Principal {\n  readonly userId: string;\n}\n",
        "packages/server/src/domain/chat/verbs/c.ts":
          'import type { Principal } from "../../../../../contracts/src/identity/index.ts";\nexport function ok(principal: Principal): string {\n  return principal.userId;\n}\n',
        "packages/server/src/domain/chat/engine/quiet.ts": "export const quiet = 1;\n",
      },
      why: "the VERB LAYER legitimately holds the caller's Principal and names it — only `engine/**` is blind, and the engine file in the same fixture stays silent",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/engine/lib/wire.ts": "export interface Principal {\n  readonly wireVersion: number;\n}\n",
        "packages/server/src/domain/chat/engine/foreign.ts": 'import type { Principal } from "./lib/wire.ts";\nexport type P = Principal;\n',
      },
      why: "THE HOME COUNTERFACTUAL — a GENUINE export named `Principal` that resolves cleanly to a DIFFERENT declaration is a different type by the type-home law. This is a deliberate narrowing of the legacy name match, and deleting the home comparison turns this row red. The lowercase vocabulary arm still covers a `principal` OBJECT carrying a caller id",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts": "export interface Principal {\n  readonly userId: string;\n}\n",
        "packages/server/src/domain/chat/engine/waived.ts":
          '// @orb-waive turn-identity(Principal): the engine\'s own re-export shim during the D19 migration; ends when the shim is deleted.\nimport type { Principal } from "../../../../../contracts/src/identity/index.ts";\nexport type P = Principal;\n',
      },
      why: "the ONE central positioned waiver naming the exact reported token, per arm — the identity arm's token is `Principal`, the vocabulary arm's is `principal`",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/engine/triple.ts":
          "export function run(identity: { readonly runAsUserId: string; readonly triggeredBy: string }): string {\n  return identity.runAsUserId;\n}\n",
      },
      why: "the SANCTIONED shape — the resolved triple (runAsUserId + triggeredBy) reaches the engine under its own name and carries no Principal",
    },
  ],
});
