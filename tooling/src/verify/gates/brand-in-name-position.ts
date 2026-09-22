// A signature position whose name is owned by a canonical @orb/kit/ids brand cannot stay bare string.
// Compiler-resolved brand identity and the central ordinary-waiver plane replace the legacy text vocabulary,
// three descendant walks, module-global pass state, @foreign-id-ok parser, and local stale-marker logic.
//
// NO #944 THIRD ANSWER EXISTS HERE, audited #2041 — recorded rather than faked. The subject is a CENSUS
// join, not a reference: canonical positions are collected from the type aliases declared in
// `ID_BRAND_HOME` (with a `population` receipt naming their count) and joined by NAME against bare-string
// declarations. Nothing resolves an origin, so no reader ever refuses and there is no refusal to classify.
// The two constructions attempted both land elsewhere by design: a canonical alias whose type carries no
// `[brand]` property is simply not a position (`collectCanonicalPosition` returns early), and an alias with
// no type node at all is a TOOL ERROR that withholds the whole policy — which is the correct fail-closure
// for a census, since a partial roster would silently stop claiming positions. Its family siblings
// (`no-mint-via-cast`, `no-fake-disabled-id`, `no-raw-id`) DO resolve origins and each carries the arm.
//
// FAMILY (`id-brand-flow`): the shared reader is `lib/id-brand.ts` — `canonicalIdBrand` (the checker-backed
// `[brand]`-property test, shared with `no-loose-id-cast`) and `ID_BRAND_HOME`, the one spelling of the ids
// module every member of the family resolves against. The per-pass accumulators in `create` are invocation
// state, which the contract allows; there is no private reader, table, walk or filesystem read.
//
// POPULATION PORT: an intentional NARROWING of an unstated legacy scope, and the reason the array is written
// out rather than spelled `@authored`. The legacy descriptor (`d10462449^`) declared NO `scanRoot` — it
// judged whatever the legacy pass loaded — and carried a `FILE_CLASS_EXEMPT` table (empty since #1692) plus
// a `REAL_TREE_ANCHOR` instead. The final population is the seven AUTHORED PRODUCT roots: `@authored` minus
// `@tooling` and `@scripts`. That subtraction is the decision — an instrument or a script naming a variable
// `chatId` is not an id-confusion hole in the product's type surface, and this policy's message is about the
// product's boundaries. `@tests` is IN, deliberately and against the same instinct, because a fixture can
// launder a raw id into a typed call (`mustFlag[4]` is that row).
// SUPERSEDED 2026-09-13 (lane cb-b-header-residue), the text above kept: "declared NO `scanRoot` — it judged whatever
// the legacy pass loaded" and "`@authored` minus `@tooling` and `@scripts`. That subtraction is the decision" are
// REFUTED by the blob. The descriptor at `d10462449^` declared `scanRoot: inScope`,
// `path.includes("packages/") || path.includes("tests/")`, which ALREADY excluded `tooling/src` and `scripts/`.
// Measured over that tree's harness candidates: legacy − final = {`packages/showcase-plugins/src/index.ts`},
// final − legacy = ∅. The tooling/scripts exclusion was inherited, not decided here; the port narrowed by one file.
//
// RETIRED VOCABULARY, WITH THE COUNT (§5b.5). The `@foreign-id-ok(<position>): <reason>` parser, its
// module-global stale-marker state and the `FILE_CLASS_EXEMPT` table all retired into the central
// ordinary-waiver plane. Census re-derived 2026-09-12 over `packages/ tooling/ tests/ scripts/`:
// **76 live `@orb-waive brand-in-name-position(<position>)` markers** — the translated set — against
// **ZERO live `@foreign-id-ok` markers**. The two surviving `@foreign-id-ok` occurrences in the repo are
// both non-markers: this sentence, and a NEGATIVE fixture listing it as a foreign spelling
// (`tests/tooling/verify/lib/ordinary-waiver.test.ts:151`). Nothing parses the old grammar any more, which
// is why the roster row advertising it was a live defect (#2047).
//
// DECLARED LIMITS, each with a `mustPass` row below rather than only this paragraph:
//   - a QUOTED declaration name (`{ "chatId": string }`) is not claimed — `declaredBarePosition` requires an
//     Identifier name node. Measured 2026-09-12 across the policy's own seven roots: **0 live sites** of a
//     quoted canonical position typed bare `string`, against a positive control of **116 unquoted ones**.
//     So this is a declared limit and not a live escape — but note the FAMILY ASYMMETRY, because it is the
//     thing to reconsider if a site ever appears: `no-raw-id.ts#idProperty` DOES accept a StringLiteral name
//     and strips the quotes. TWO clauses hold this limit, not one, which is why its row is labelled a limit
//     rather than a §4.1 falsifier: `Node.isIdentifier(name)` AND the unstripped `name.getText()`. Cut either
//     alone and the row stays green; the JOINT cut (§4.1's mutual-redundancy procedure) reds it, and it reds
//     as `PASS TOOL ERROR … token "chatId" is not anchored at its declared offset` — which is the price of
//     widening, measured rather than guessed: the reported token must stay an exact source slice, so a
//     quoted name needs its own offset and cannot ride `offset: 0`.
//   - a TYPE ALIAS is not a signature position, even though `TypeAliasDeclaration` is in the visitor's
//     `kinds` (it is there to collect canonical brands from the ids home, not to be judged).
//   - a canonical brand alias declared OUTSIDE `ID_BRAND_HOME` does not mint a position. The vocabulary has
//     exactly one home, by design: a domain-local `Branded<"RoomId">` cannot silently claim `roomId:` across
//     the whole product.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `brand-in-name-position` descriptor at 32b66931e2a921557108b9e03e2f834f8208c116, the parent of the conversion
// `d10462449` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,130 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 6,109 and final `population` admits 6,108. legacy − final = {`packages/showcase-plugins/src/index.ts`} — the
// one source of an authored package outside the declared composite roots (`@showcase` is not in
// `@authored`/`@packages`, #1980, `contract/population.ts`); a one-file NARROWING. final − legacy = ∅. Controls:
// inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `scripts/codemods/__cbbhr_out_rename-roster-participants.ts` (virtual) rejected by both.
import type { Node as MorphNode, TypeChecker, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { canonicalIdBrand, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { idBrandProofModule } from "./_proof/id-brand.ts";

/** #2047, §5b.2: this text used to end *"wrong-id values therefore type-check AT THIS BOUNDARY."* That clause
 *  was untrue of one of the policy's own two live real-tree findings. `tests/kit/ids/index.test-d.ts:60:59`
 *  is a property signature inside an inline type literal handed to `toEqualTypeOf` as a TYPE ARGUMENT —
 *  a position nothing can be passed through, so it is not a boundary and no value crosses it. The finding
 *  itself is TRUE by the policy's letter (the population deliberately admits `@tests`, per `mustFlag[4]`);
 *  it was the MESSAGE that overclaimed. The PREDICATE is untouched — §4.6: a legacy gate's code is routinely
 *  stricter than its own message, and implementing the message is how a catch gets lost while every check
 *  stays green. The replacement states the assignability fact, which holds in every position the policy
 *  reports — parameter, property signature, property declaration, and a type-literal member alike. */
const MESSAGE =
  "a parameter or field uses bare `string` even though @orb/kit/ids owns the same name as a canonical brand — every other id brand is assignable to it, so a wrong-id value type-checks wherever this declaration is read.";
const FIX =
  "use the canonical branded type and mint or parse it at the owning boundary. For a foreign wire that only shares the name, add `@orb-waive brand-in-name-position(<position>): <whose id + end condition>` on the exact declaration.";
// `@inference` joined after the identity ruling recorded by the AST/codebase audit: canonical Orb model
// positions carry `ModelId`, while Agent SDK session handles carry the package-owned foreign
// `AgentSdkSessionId` type. The old attempted widening found 21 + 11 bare positions respectively; neither
// class is waived.
const POPULATION = ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@tests"] as const;
interface BrandPosition {
  readonly typeName: string;
  readonly brand: string;
}

interface BarePosition {
  readonly name: string;
  readonly node: MorphNode;
}

function positionName(typeName: string): string {
  return typeName.charAt(0).toLowerCase() + typeName.slice(1);
}

function unwrapType(node: TypeNode): TypeNode {
  return Node.isParenthesizedTypeNode(node) ? unwrapType(node.getTypeNode()) : node;
}

function bareTypeArm(node: TypeNode): "string" | "nullable" | null {
  const unwrapped = unwrapType(node);
  if (unwrapped.isKind(SyntaxKind.StringKeyword)) {
    return "string";
  }
  if (unwrapped.isKind(SyntaxKind.UndefinedKeyword)) {
    return "nullable";
  }
  return Node.isLiteralTypeNode(unwrapped) && unwrapped.getLiteral().isKind(SyntaxKind.NullKeyword) ? "nullable" : null;
}

function isBareString(node: TypeNode): boolean {
  const unwrapped = unwrapType(node);
  const arms = Node.isUnionTypeNode(unwrapped) ? unwrapped.getTypeNodes() : [unwrapped];
  const kinds = arms.map(bareTypeArm);
  return kinds.includes("string") && kinds.every((kind) => kind !== null);
}

function declaredBarePosition(node: MorphNode): BarePosition | null {
  if (!(Node.isParameterDeclaration(node) || Node.isPropertySignature(node) || Node.isPropertyDeclaration(node))) {
    return null;
  }
  const name = node.getNameNode();
  const type = node.getTypeNode();
  return Node.isIdentifier(name) && type !== undefined && isBareString(type) ? { name: name.getText(), node: name } : null;
}

function collectCanonicalPosition(node: MorphNode, sourcePath: string, getChecker: () => TypeChecker, brands: Map<string, BrandPosition>): boolean {
  if (!Node.isTypeAliasDeclaration(node) || sourcePath !== ID_BRAND_HOME) {
    return false;
  }
  const typeNode = node.getTypeNode();
  if (typeNode === undefined) {
    throw new Error(`canonical id type ${node.getName()} has no type node`);
  }
  const checker = getChecker();
  const brand = canonicalIdBrand(checker.getTypeAtLocation(typeNode), typeNode, checker);
  if (brand === null) {
    return true;
  }
  const name = positionName(node.getName());
  const prior = brands.get(name);
  if (prior !== undefined && (prior.typeName !== node.getName() || prior.brand !== brand)) {
    throw new Error(`duplicate canonical id-brand position ${name}`);
  }
  brands.set(name, { typeName: node.getName(), brand });
  return true;
}

export const gate = defineGate({
  id: "brand-in-name-position",
  family: "id-brand-flow",
  authority: "ordinary",
  severity: "error",
  population: POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const brands = new Map<string, BrandPosition>();
    const bare: BarePosition[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.Parameter, SyntaxKind.PropertySignature, SyntaxKind.PropertyDeclaration],
          visit: (node, sourceFile) => {
            if (collectCanonicalPosition(node, ctx.relativePath(sourceFile), ctx.checker, brands)) {
              return;
            }
            const candidate = declaredBarePosition(node);
            if (candidate !== null) {
              bare.push(candidate);
            }
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "kit-id-brand-positions", members: brands.size });
        for (const candidate of bare) {
          const expected = brands.get(candidate.name);
          if (expected !== undefined) {
            ctx.report.node(candidate.node, {
              token: candidate.name,
              offset: 0,
              message: `${candidate.name} is bare string, but canonical ${expected.typeName} (${expected.brand}) owns this position. (@orb/kit/ids)`,
            });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(chatId: string): void { void chatId; }\n",
      },
      expect: { count: 1, token: "chatId", messageIncludes: "canonical ChatId" },
      why: "a bare chatId signature accepts every other id brand",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type MessageId = TypeIdOf<"message">;\n'),
        "packages/contracts/src/x/views.ts": "export interface Row { readonly messageId: string | null; }\n",
      },
      expect: { count: 1, token: "messageId" },
      why: "nullable bare-string fields remain identity holes",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type SessionToken = Branded<"SessionToken">;\n'),
        "packages/server/src/domain/sessions/contract/service.ts": "export interface Args { readonly sessionToken: string; }\n",
      },
      expect: { count: 1, token: "sessionToken" },
      why: "plain branded identities participate alongside TypeIDs",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\nexport type SessionId = TypeIdOf<"session">;\n'),
        "packages/server/src/infra/providers/backends/agent-sdk/session/store.ts":
          "export class Store {\n  // @orb-waive brand-in-name-position(sessionId): the SDK owns this session id; ends if it becomes an Orb session row.\n  record(chatId: string, sessionId: string): void { void chatId; void sessionId; }\n}\n",
      },
      expect: { count: 1, token: "chatId" },
      why: "a positioned waiver for a foreign sessionId cannot absolve the adjacent Orb chatId",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "tests/server/domain/chat/thing.test.ts": "export interface Fixture { readonly chatId: string; }\n",
      },
      expect: { count: 1, token: "chatId" },
      why: "tests remain in scope because fixtures can launder raw ids into typed calls",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type SessionId = TypeIdOf<"session">;\n'),
        "packages/inference/src/contract/identity.ts": "export type AgentSdkSessionId = string & { readonly sdkSessionIdentity: unique symbol };\n",
        "packages/inference/src/backends/agent-sdk/session/store.ts":
          'import type { AgentSdkSessionId } from "../../../contract/identity.ts";\nexport function record(sessionId: AgentSdkSessionId): void { void sessionId; }\n',
      },
      why: "a foreign Agent SDK session handle has an explicit package-owned identity type instead of borrowing Orb's SessionId brand or escaping through a waiver",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(chatId: ChatId): void { void chatId; }\n",
      },
      why: "the signature carries its canonical brand",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type SessionId = TypeIdOf<"session">;\n'),
        "packages/server/src/infra/providers/backends/agent-sdk/log.ts":
          "export interface Frame {\n  // @orb-waive brand-in-name-position(sessionId): the SDK owns this id; ends if renamed or parsed as an Orb session.\n  readonly sessionId: string;\n}\n",
      },
      why: "a foreign wire uses the central positioned waiver",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(fromChatId: string, ownerId: string): void { void fromChatId; void ownerId; }\n",
      },
      why: "only exact canonical lower-camel positions are claimed",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/chat/verbs/post.ts": 'export function post(): void { const chatId: string = "x"; void chatId; }\n',
      },
      why: "local variables are outside the signature-flow policy",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(chatId: string | number): void { void chatId; }\n",
      },
      why: "a genuinely polymorphic value is not the bare-string defect class",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(roomId: string): void { void roomId; }\n",
      },
      why: "a name no canonical brand owns is not guessed from suffixes",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/rpg/ids.ts": 'import type { Branded } from "../../../../kit/src/ids/index";\nexport type RoomId = Branded<"RoomId">;\n',
        "packages/server/src/domain/rpg/verbs/post.ts": "export function post(roomId: string): void { void roomId; }\n",
      },
      why: "§4.1 NARROWING (THE VOCABULARY HAS ONE HOME): `sourcePath !== ID_BRAND_HOME` in `collectCanonicalPosition`. A brand alias declared in a DOMAIN file — built from the canonical `Branded` helper, so `canonicalIdBrand` accepts it — still mints no position, and `roomId: string` beside it passes. Before #2047 the fence was unpinned: every fixture declared its aliases in the ids home, so dropping the home test left all eleven rows green while the policy quietly claimed every `Branded<…>` alias anywhere in the product. The `ChatId` alias in the ids home is the in-population anchor that keeps this row a real comparison rather than an empty derivation",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/contracts/src/x/views.ts": 'export interface Row { readonly "chatId": string; }\n',
      },
      why: 'DECLARED LIMIT, and honestly labelled: a QUOTED declaration name is not claimed. This row is NOT a §4.1 narrowing falsifier and no single cut kills it — cutting `Node.isIdentifier(name)` alone leaves it green, because `name.getText()` then yields `"chatId"` WITH its quotes and misses the brands map anyway. The two clauses are MUTUALLY REDUNDANT, so the §4.1 procedure is the JOINT cut, and it was run: dropping the kind test AND stripping quotes in the same patch reds this row — as a `PASS TOOL ERROR [evaluate] node finding token "chatId" is not anchored at its declared offset`, which is the third fact and the reason widening is not free. Measured 2026-09-12 over this policy\'s own seven roots: 0 live quoted sites against 116 unquoted',
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/server/src/domain/chat/verbs/post.ts": "export type chatId = string;\n",
      },
      why: "§4.1 NARROWING (THE DECLARATION KIND): `declaredBarePosition`'s parameter/property-signature/property-declaration test. This row exists because the obvious reading is wrong — `TypeAliasDeclaration` IS in the visitor's `kinds`, so the kind test is NOT redundant with the walk: an alias outside the ids home falls straight through `collectCanonicalPosition` into the bare-position check, and with the kind test cut this alias is claimed as a signature position. It is not one; the policy's subject is what a CALLER can hand you",
    },
  ],
});
