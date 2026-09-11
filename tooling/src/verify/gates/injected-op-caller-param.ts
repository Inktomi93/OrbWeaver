// Gate: injected-op-caller-param — a cross-domain op declared in a domain's `contract/` that takes an
// ENTITY ID and returns a Promise must also take the caller/scope (a Principal, a userId/ownerId, a chatId).
// An op whose params drop the caller is a cross-tenant hole gated ONLY by its call sites' discipline (AGENTS
// §2: cross-feature dependency is an op declared in contract/ + wired at compose — the op is the boundary,
// so the boundary must carry the scope). Exemptions are TYPED rows with a reason + an end condition, and the
// table is TWO-SIDED (a row naming no live op is RED). The entity-id vocabulary is DERIVED from
// `@orb/kit/ids`, with a blindness tripwire when that derivation comes back empty.
//
// NO BOUNDED-SUBTREE WALK: the legacy shape called `node.getDescendantsOfKind(Identifier)` per parameter to
// collect every identifier under it (param names, destructured elements, object members). The final
// contract bans that primitive outright (#1930 — no bounded-subtree API exists). This is INVERTED per
// GATE-AUTHORING.md's own prescription: every Identifier in the population is visited once, and each one
// walks UP via `getFirstAncestorByKind(Parameter)` to ask "am I inside some op candidate's parameter list at
// all", then up again to the owning `TypeAliasDeclaration` to attribute the name. Pre-order dispatch
// guarantees the alias visitor registers its candidate slot before any of its own descendant identifiers
// are visited in the same walk.
//
// ARM SPLIT (this file + injected-op-caller-param-health.ts, family "injected-op-caller-param"): the
// occurrence check is `ordinary` (a genuinely structural/un-principal op takes a reviewed CALLER_FREE_OPS
// row); the two-sided stale-exemption ratchet AND the empty-derivation blindness tripwire are whole-tree,
// unsuppressible claims and live in their own `hard` policy id under the same family.
import type { SourceFile, TypeAliasDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable } from "../contract/gate.ts";
import { defineGate } from "../contract/policy.ts";

export const IDS_MODULE = "packages/kit/src/ids/index.ts";
const CONTRACT_RE = /^packages\/server\/src\/domain\/[^/]+\/contract\//u;
const TYPEID_OF = "TypeIdOf";

/** The scope vocabulary: a param NAME, a destructured element, or an object-member name that carries the
 *  caller. `Principal` / `UserId` are the TYPE spellings of the same thing. */
const SCOPE_NAMES = new Set([
  "principal",
  "caller",
  "actor",
  "userId",
  "ownerId",
  "chatId",
  "actorUserId",
  "recipientUserId",
  "forUserId",
  "runAsUserId",
  "hostUserId",
  "subjectUserId",
  "triggeredBy",
]);
const SCOPE_TYPES = new Set(["Principal", "UserId"]);

/** Ops that legitimately carry NO caller. Each row says WHY the authority is elsewhere and what would END
 *  the exemption. Two-sided: a row naming an op no contract declares is RED (the health sibling). Exported
 *  for the health sibling's staleness sweep. */
export const CALLER_FREE_OPS: ExemptionTable = {
  ReapAssetsOp: {
    why:
      "the authority is STRUCTURAL, not the caller's: `reapIfOrphan` purges an id only when the whole " +
      "asset-ref REGISTRY holds no reference to it (`selectReferencedAmong`), so a foreign id that is still " +
      "referenced is skipped and a foreign id referenced by nothing is an orphan blob `collectGarbage` would " +
      "reap anyway. UN-PRINCIPAL by design (D20, stated in `assets/verbs/reap-if-orphan.ts`'s header) and it " +
      "returns no row data. Ends the day the reap stops consulting the reference registry first.",
  },
  ListCharacterSpriteAssetsOp: {
    why:
      "expressions-design/01 §8 — OPTIONAL and currently UNWIRED (no compose root supplies it; the FK cascade " +
      "plus the next GC sweep is the live behavior). It is now a READ of the assetIds bound to a character, " +
      "taken before the owner-scoped delete that actually frees them, and it returns ids the caller already " +
      "proved it owns; it no longer DELETES anything (renamed from `ReapCharacterSpritesOp` when the detach " +
      "was moved behind the delete). Ends the day the expressions leaf lands: the wiring must carry the " +
      "caller then, because the ids it returns would be reachable by characterId alone.",
  },
  ResolveAssetHashOp: {
    why:
      "the un-principal indexer/assembly read (D20): it returns a CAS content hash, never row data, and its " +
      "assetId comes from the chat's own already-authorized canon (a seated card's avatar), not from caller " +
      "input. Ends if it ever returns owner-identifying fields.",
  },
  LoadAssetBytesOp: {
    why:
      "D20 un-principal blob read for the databank INGEST path, which runs after the enqueue authority check " +
      "(the workload row's owner is the gate). `assets/contract/service.ts` names this the un-principal read " +
      "explicitly, distinct from the principal-carrying door. Ends if ingest ever runs on caller-supplied ids.",
  },
  LoadAssetBytes: {
    why: "the embeddings twin of LoadAssetBytesOp — the indexer sweeps ids IT enumerated (D20 un-principal). Ends if the indexer starts taking ids from a request.",
  },
  LoadAssetMime: {
    why: "the embeddings mime probe over ids the indexer enumerated itself (D20 un-principal); returns a mime string, no row data. Ends with LoadAssetBytes.",
  },
  LoadCardText: {
    why:
      "the embeddings/admin card-text read over ids the indexer enumerated itself (`listEmbeddableCharacterIds`) " +
      "— D20 un-principal, the bulk pass sweeps the whole corpus by construction. Ends if a request-supplied " +
      "characterId ever reaches it.",
  },
};

const MESSAGE =
  "a cross-domain op takes an entity id but NO caller — the op is the domain boundary (AGENTS §2: a verb " +
  "declares the op's TYPE in its contract/ and the runtime op is wired at the composition root), so the " +
  "boundary is where the scope has to be carried. An op whose signature drops the caller is safe only by its " +
  "call sites' discipline: the next call site, or the next wiring, inherits nothing that says so.";

const FIX =
  "add the scope to the op's params — a `principal: Principal`, an `ownerId`/`userId: UserId`, or the " +
  "`chatId` the membership check runs on — and apply it in the implementing factory's WHERE (the " +
  "`AttachCardTagOp`/`DetachCardTagOp` shape: `{ ownerId, characterId, tagName }`). If the op's authority is " +
  "genuinely structural or un-principal (D20), add a CALLER_FREE_OPS row saying why AND what would end it.";

/** Every branded ENTITY-row id type name in `@orb/kit/ids`: every `export type X = TypeIdOf<"…">`.
 *  Exported for the health sibling's blindness tripwire. */
export function deriveEntityIdTypes(files: readonly SourceFile[], relativePath: (sf: SourceFile) => string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const sf of files) {
    if (relativePath(sf) !== IDS_MODULE) {
      continue;
    }
    for (const ta of sf.getTypeAliases()) {
      const tn = ta.getTypeNode();
      if (tn?.isKind(SyntaxKind.TypeReference) === true && tn.getTypeName().getText() === TYPEID_OF) {
        names.add(ta.getName());
      }
    }
  }
  return names;
}

/** True when a FunctionType is an OP — a Promise-returning boundary, not a pure/sync computation. */
function isOpFunctionType(alias: TypeAliasDeclaration): boolean {
  const fnType = alias.getTypeNode();
  if (fnType?.isKind(SyntaxKind.FunctionType) !== true) {
    return false;
  }
  const ret = fnType.getReturnTypeNode();
  return ret?.isKind(SyntaxKind.TypeReference) === true && ret.getTypeName().getText() === "Promise";
}

export const gate = defineGate({
  id: "injected-op-caller-param",
  family: "injected-op-caller-param",
  authority: "ordinary",
  severity: "error",
  // The id vocabulary is derived from another package (@kit), so the verdict is whole-population.
  population: ["@server", "@kit"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidateAliases = new Map<TypeAliasDeclaration, string>();
    const paramNamesByAlias = new Map<TypeAliasDeclaration, string[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.TypeAliasDeclaration],
          visit: (node, sf) => {
            const isCandidate = node.isKind(SyntaxKind.TypeAliasDeclaration) && CONTRACT_RE.test(ctx.relativePath(sf)) && isOpFunctionType(node);
            if (!isCandidate) {
              return;
            }
            candidateAliases.set(node, node.getName());
            paramNamesByAlias.set(node, []);
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
        const entityIdTypes = deriveEntityIdTypes(ctx.files, ctx.relativePath);
        for (const [alias, name] of candidateAliases) {
          const paramNames = paramNamesByAlias.get(alias) ?? [];
          if (!paramNames.some((n) => entityIdTypes.has(n))) {
            continue;
          }
          if (paramNames.some((n) => SCOPE_NAMES.has(n) || SCOPE_TYPES.has(n))) {
            continue;
          }
          if (name in CALLER_FREE_OPS) {
            continue;
          }
          ctx.report.node(alias, { token: name, offset: alias.getText().indexOf(name) });
        }
      },
    };
  },

  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type CharacterId = TypeIdOf<"character">;\nexport type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/character/contract/service.ts":
          "export type CopyCharacterBooksOp = (args: { readonly fromCharacterId: CharacterId; readonly toCharacterId: CharacterId }) => Promise<void>;\n",
      },
      expect: { count: 1, messageIncludes: "takes an entity id but NO caller" },
      why: "the founding shape — the census's open item: an op moving state between two character ids, safe today only because its ONE call site happens to have proved ownership first",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/x/contract/service.ts": "export type LoadThingOp = (assetId: AssetId) => Promise<Uint8Array>;\n",
      },
      expect: { count: 1 },
      why: "the POSITIONAL form of the same hole — a bare id param, not an options object; a reader keyed only on object members would miss half the corpus",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type CharacterId = TypeIdOf<"character">;\n',
        "packages/server/src/domain/character/contract/service.ts":
          "export type AttachCardTagOp = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;\n",
      },
      why: "the SHAPE the fix asks for — the live `AttachCardTagOp`: the scope rides in the args object beside the entity id",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type CharacterId = TypeIdOf<"character">;\n',
        "packages/server/src/domain/character/contract/service.ts":
          'export type ResolveGreetingTemplateOp = (args: { readonly caller: Principal; readonly kind: "a" }) => Promise<string>;\n',
      },
      why: "no entity id in the params — nothing tenant-scoped is reachable, so the trigger does not fire (and the `caller` would satisfy it anyway)",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/character/contract/service.ts": "export type ReapAssetsOp = (assetIds: readonly AssetId[]) => Promise<void>;\n",
      },
      why: "the CALLER_FREE_OPS row: the reap's authority is the asset-ref registry, not the caller (D20 un-principal). The reason — and its end condition — is the deliverable, not the silence",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type ChatId = TypeIdOf<"chat">;\nexport type CharacterId = TypeIdOf<"character">;\n',
        "packages/server/src/domain/x/contract/service.ts":
          "export type PostToRoomOp = (args: { readonly chatId: ChatId; readonly characterId: CharacterId }) => Promise<void>;\n",
      },
      why: "a `chatId` IS a scope — a membership-scoped op carries the room the `requireParticipant` check runs on (D18), not a userId",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/discovery/contract/service.ts":
          "export type Tier0RangeOp = (tier: number, blockIdx: number) => { readonly startIdx: number };\n",
      },
      why: "DECLARED LIMIT: a SYNC function type is a computation, not a data door — the Promise return is what makes an op an I/O boundary",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/x/contract/service.ts": "export type EmbeddingsStoreOp = (params: StoreDigestParams) => Promise<void>;\n",
      },
      why: "DECLARED LIMIT, written down not assumed: an id reached through a NAMED type reference is invisible here (the reader is syntactic over the param subtree, the same literal-shape limit `own-tables-only` carries for namespace imports). This row is the baseline a checker-resolved widening would start from",
    },
  ],
});
