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
import type { Node as MorphNode, TypeChecker, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { canonicalIdBrand, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { idBrandProofModule } from "./_proof/id-brand.ts";

const MESSAGE =
  "a parameter or field uses bare `string` even though @orb/kit/ids owns the same name as a canonical brand — wrong-id values therefore type-check at this boundary.";
const FIX =
  "use the canonical branded type and mint or parse it at the owning boundary. For a foreign wire that only shares the name, add `@orb-waive brand-in-name-position(<position>): <whose id + end condition>` on the exact declaration.";
const POPULATION = ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@tests"] as const;
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
              message: `${candidate.name} is bare string, but canonical ${expected.typeName} (${expected.brand}) owns this position.`,
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
  ],
});
