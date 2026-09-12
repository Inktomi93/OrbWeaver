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
  `CALLER_FREE_OPS names "${op}" but no domain contract declares an op function type of that name TAKING A ` +
  "BRANDED ENTITY ID — either the op is gone, or it no longer reaches tenant data, and in both cases the " +
  "exemption permits nothing the sibling detector would have flagged. Delete the stale row in " +
  "tooling/src/verify/gates/injected-op-caller-param.ts (two-direction ratchet; a stale exemption is " +
  "inherited by the next op that takes the name).";

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
    // THE CENSUS PREDICATE IS THE SIBLING'S TRIGGER, NOT "any op function type" (owner ruling, 2026-09-12,
    // #2000): an op is only SEEN — and so only keeps its exemption alive — when its params mention a branded
    // entity-id type, because that is the exact condition under which the ordinary sibling could have fired.
    // An exemption for an op that no longer takes one suppresses nothing and is dead by construction. The
    // legacy `finalize` this policy succeeded had that predicate (`seenOps.add` ran AFTER the entity-id
    // trigger); the conversion widened it to every Promise-returning op, which left such a row standing and
    // silent forever. Restored here, with the message corrected to describe what is actually flagged — the
    // legacy text ("no domain contract declares an op function type of that name") was true of the widened
    // predicate and false of this one, which is the half of the defect the ruling would otherwise carry
    // forward. Measured pair, both directions: injected-op-caller-param-family.test.ts.
    const candidateAliases = new Map<TypeAliasDeclaration, string>();
    const paramNamesByAlias = new Map<TypeAliasDeclaration, string[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.TypeAliasDeclaration],
          visit: (node, sf) => {
            if (node.isKind(SyntaxKind.TypeAliasDeclaration) && CONTRACT_RE.test(ctx.relativePath(sf)) && isOpFunctionType(node)) {
              candidateAliases.set(node, node.getName());
              paramNamesByAlias.set(node, []);
            }
          },
        },
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node) => {
            const paramAncestor = node.getFirstAncestorByKind(SyntaxKind.Parameter);
            const alias = paramAncestor?.getFirstAncestorByKind(SyntaxKind.TypeAliasDeclaration);
            const bucket = alias === undefined ? undefined : paramNamesByAlias.get(alias);
            bucket?.push(node.getText());
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
        const seenOps = new Set<string>();
        for (const [alias, name] of candidateAliases) {
          if ((paramNamesByAlias.get(alias) ?? []).some((paramName) => entityIdTypes.has(paramName))) {
            seenOps.add(name);
          }
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
      expect: { count: Object.keys(CALLER_FREE_OPS).length + 1, messageIncludes: "derived ZERO entity-id type names" },
      why: "THE BLIND ARM: the anchor is loaded but the ids module derives no TypeIdOf-shaped export at all — the vocabulary the gate scans for no longer exists. The count is one BLIND finding plus one STALE per row: with an empty vocabulary no op can take a branded entity id, so `ReapAssetsOp` (declared here over `readonly string[]`) is NOT seen either — the restored census predicate, and the reason this row's count is rows+1 rather than rows",
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
