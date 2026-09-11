// Policy: injected-op-caller-param-health — the two-sided whole-tree ratchet for the sibling
// `injected-op-caller-param` gate's CALLER_FREE_OPS exemption table (family "injected-op-caller-param",
// shared verbatim), plus the blindness tripwire on the `@orb/kit/ids` entity-id derivation both policies
// share. Reuses the sibling's own AST-attribution machinery (the TypeAliasDeclaration + Identifier
// ancestor-walk pair) rather than re-deriving a second reader for the same subject.
import type { TypeAliasDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { CALLER_FREE_OPS, deriveEntityIdTypes, IDS_MODULE } from "./injected-op-caller-param.ts";

const CONTRACT_RE = /^packages\/server\/src\/domain\/[^/]+\/contract\//u;

/** The real-tree ANCHOR for the stale/blind arms. Deliberately NOT the ids module: the conformance examples
 *  PLANT that file (they have to — it is the derivation source), so anchoring there would fire the whole-
 *  tree stale arm inside every mini-project and red the gate's own self-proof (GATE-AUTHORING §4.5). Also
 *  the report anchor, since a finding must land inside this policy's own declared population. */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

const STALE = (op: string): string =>
  `CALLER_FREE_OPS names "${op}" but no domain contract declares an op function type of that name — delete ` +
  "the stale row in tooling/src/verify/gates/injected-op-caller-param.ts (two-direction ratchet; a stale " +
  "exemption is inherited by the next op that takes the name).";

const BLIND =
  "injected-op-caller-param derived ZERO entity-id type names from packages/kit/src/ids/index.ts — the gate " +
  "is scanning for a vocabulary that no longer exists and has gone silently green. Re-point the derivation " +
  "in tooling/src/verify/gates/injected-op-caller-param.ts";

/** True when a FunctionType is an OP — a Promise-returning boundary, not a pure/sync computation. Duplicated
 *  from the occurrence sibling deliberately: it is a three-line syntactic predicate, not a subject reader,
 *  and importing it would couple this policy's population to the sibling module for no shared derivation. */
function isOpFunctionType(alias: TypeAliasDeclaration): boolean {
  const fnType = alias.getTypeNode();
  if (fnType?.isKind(SyntaxKind.FunctionType) !== true) {
    return false;
  }
  const ret = fnType.getReturnTypeNode();
  return ret?.isKind(SyntaxKind.TypeReference) === true && ret.getTypeName().getText() === "Promise";
}

export const gate = defineGate({
  id: "injected-op-caller-param-health",
  family: "injected-op-caller-param",
  authority: "hard",
  severity: "error",
  population: ["@server", "@kit", "@db"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message:
    "either the injected-op-caller-param entity-id derivation resolved zero types (blind), or a CALLER_FREE_OPS row names an op no domain contract declares any more (stale) — both ratchet down.",
  create: (ctx) => {
    const seenOps = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.TypeAliasDeclaration],
          visit: (node, sf) => {
            if (node.isKind(SyntaxKind.TypeAliasDeclaration) && CONTRACT_RE.test(ctx.relativePath(sf)) && isOpFunctionType(node)) {
              seenOps.add(node.getName());
            }
          },
        },
      ],
      evaluate: () => {
        if (!ctx.files.some((sf) => ctx.relativePath(sf) === REAL_TREE_ANCHOR)) {
          return;
        }
        const entityIdTypes = deriveEntityIdTypes(ctx.files, ctx.relativePath);
        if (entityIdTypes.size === 0) {
          ctx.report.file(REAL_TREE_ANCHOR, { line: 1, message: BLIND });
        }
        for (const op of Object.keys(CALLER_FREE_OPS)) {
          if (!seenOps.has(op)) {
            ctx.report.file(REAL_TREE_ANCHOR, { line: 1, message: STALE(op) });
          }
        }
      },
    };
  },

  mustFlag: [
    {
      mode: "source",
      files: {
        [REAL_TREE_ANCHOR]: "export const schema = {};\n",
        [IDS_MODULE]: 'export type AssetId = TypeIdOf<"asset">;\n',
      },
      expect: { count: Object.keys(CALLER_FREE_OPS).length, messageIncludes: "no domain contract declares an op function type" },
      why: "THE STALE ARM: the anchor is loaded and the id vocabulary is nonempty, but no contract declares any CALLER_FREE_OPS name — every row is stale and ratchets down",
    },
    {
      mode: "source",
      files: {
        [REAL_TREE_ANCHOR]: "export const schema = {};\n",
        [IDS_MODULE]: "export type NotAnEntityId = string;\n",
        "packages/server/src/domain/character/contract/service.ts": "export type ReapAssetsOp = (assetIds: readonly string[]) => Promise<void>;\n",
      },
      expect: { messageIncludes: "derived ZERO entity-id type names" },
      why: "THE BLIND ARM: the anchor is loaded but the ids module derives no TypeIdOf-shaped export at all — the vocabulary the gate scans for no longer exists",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [REAL_TREE_ANCHOR]: "export const schema = {};\n",
        [IDS_MODULE]: 'export type AssetId = TypeIdOf<"asset">;\nexport type CharacterId = TypeIdOf<"character">;\n',
        "packages/server/src/domain/character/contract/service.ts":
          "export type ReapAssetsOp = (assetIds: readonly AssetId[]) => Promise<void>;\n" +
          "export type ListCharacterSpriteAssetsOp = (characterId: CharacterId) => Promise<readonly AssetId[]>;\n" +
          "export type ResolveAssetHashOp = (assetId: AssetId) => Promise<string>;\n" +
          "export type LoadAssetBytesOp = (assetId: AssetId) => Promise<Uint8Array>;\n" +
          "export type LoadAssetBytes = (assetId: AssetId) => Promise<Uint8Array>;\n" +
          "export type LoadAssetMime = (assetId: AssetId) => Promise<string>;\n" +
          "export type LoadCardText = (characterId: CharacterId) => Promise<string>;\n",
      },
      why: "every CALLER_FREE_OPS row STILL EARNED, judged against the real-tree anchor: each name is declared by a live contract, so the stale arm stays silent, and the vocabulary is nonempty so the blind arm stays silent too",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/contract/service.ts": "export const clean = true;\n" },
      why: "the anchor is not loaded (a plain fixture run) — both arms self-guard off, never claiming the tree blind or every row stale",
    },
  ],
});
