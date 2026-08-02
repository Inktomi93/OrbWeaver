// Gate: injected-op-caller-param — a cross-domain op declared in a domain's `contract/` that takes an
// ENTITY ID and returns a Promise must also take the caller/scope (a Principal, a userId/ownerId, a chatId).
// An op whose params drop the caller is a cross-tenant hole gated ONLY by its call sites' discipline (AGENTS
// §2: cross-feature dependency is an op declared in contract/ + wired at compose — the op is the boundary,
// so the boundary must carry the scope). Exemptions are TYPED rows with a reason + an end condition, and the
// table is TWO-SIDED (a row naming no live op is RED). The entity-id vocabulary is DERIVED from
// `@orb/kit/ids`, with a blindness tripwire when that derivation comes back empty.
import type { Node, TypeAliasDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const IDS_MODULE = "packages/kit/src/ids/index.ts";
/** The real-tree ANCHOR for the stale arm. Deliberately NOT the ids module: the conformance examples PLANT
 *  that file (they have to — it is the derivation source), so anchoring there would fire the whole-tree stale
 *  arm inside every mini-project and red the gate's own self-proof (GATE-AUTHORING §4.5). */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const CONTRACT_RE = /packages\/server\/src\/domain\/[^/]+\/contract\//u;
const GATE_SELF = "scripts/check/gates/injected-op-caller-param.ts";
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
 *  the exemption. Two-sided: a row naming an op no contract declares is RED. */
const CALLER_FREE_OPS: ExemptionTable = {
  ReapAssetsOp: {
    why:
      "the authority is STRUCTURAL, not the caller's: `reapIfOrphan` purges an id only when the whole " +
      "asset-ref REGISTRY holds no reference to it (`selectReferencedAmong`), so a foreign id that is still " +
      "referenced is skipped and a foreign id referenced by nothing is an orphan blob `collectGarbage` would " +
      "reap anyway. UN-PRINCIPAL by design (D20, stated in `assets/verbs/reap-if-orphan.ts`'s header) and it " +
      "returns no row data. Ends the day the reap stops consulting the reference registry first.",
  },
  ReapCharacterSpritesOp: {
    why:
      "expressions-design/01 §8 — OPTIONAL and currently UNWIRED (no compose root supplies it; the FK cascade " +
      "plus the next GC sweep is the live behavior). Ends the day the expressions leaf lands: the wiring must " +
      "carry the caller then, because it DELETES bindings by characterId.",
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

const STALE = (op: string): string =>
  `CALLER_FREE_OPS names "${op}" but no domain contract declares an op function type of that name — delete ` +
  `the stale row in ${GATE_SELF} (two-direction ratchet; a stale exemption is inherited by the next op that ` +
  "takes the name).";

const BLIND =
  "injected-op-caller-param derived ZERO entity-id type names from packages/kit/src/ids/index.ts — the gate " +
  "is scanning for a vocabulary that no longer exists and has gone silently green. Re-point the derivation " +
  "in scripts/check/gates/injected-op-caller-param.ts";

/** Branded ENTITY-row id type names, derived from `@orb/kit/ids`: every `export type X = TypeIdOf<"…">`.
 *  `UserId`/`Handle`/`SessionToken`/`ModelId` are `Branded<…>`, not `TypeIdOf<…>` — identity and foreign
 *  handles, not tenant rows — so they are excluded by construction, not by a hand-kept skip list. */
const entityIdTypes = new Set<string>();
const seenOps = new Set<string>();

function deriveEntityIdTypes(ctx: GateRunCtx): void {
  entityIdTypes.clear();
  for (const sf of ctx.project.getSourceFiles()) {
    if (!sf.getFilePath().includes(IDS_MODULE)) {
      continue;
    }
    for (const ta of sf.getTypeAliases()) {
      const tn = ta.getTypeNode();
      if (tn?.isKind(SyntaxKind.TypeReference) === true && tn.getTypeName().getText() === TYPEID_OF) {
        entityIdTypes.add(ta.getName());
      }
    }
  }
}

/** Every identifier-ish name in a subtree — param names, destructured elements, object members, type names. */
function namesIn(node: Node): string[] {
  const out = [node.getKind() === SyntaxKind.Identifier ? node.getText() : ""];
  for (const d of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    out.push(d.getText());
  }
  return out.filter((s) => s !== "");
}

export const gate: GateDescriptor = {
  name: "injected-op-caller-param",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — AGENTS §2 (cross-feature dependency is an injected op); Core-Path-Registry.md D20",
  status: "active",
  scopeSafety: "whole-project", // the id vocabulary comes from another package; the stale arm is tree-wide
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => CONTRACT_RE.test(p) || p.includes(IDS_MODULE),
  kinds: [SyntaxKind.TypeAliasDeclaration],

  begin: (ctx) => {
    seenOps.clear();
    deriveEntityIdTypes(ctx);
  },

  visit: (node, sf, ctx) => {
    if (!(node.isKind(SyntaxKind.TypeAliasDeclaration) && CONTRACT_RE.test(sf.getFilePath()))) {
      return;
    }
    const alias: TypeAliasDeclaration = node;
    const fnType = alias.getTypeNode();
    if (fnType?.isKind(SyntaxKind.FunctionType) !== true) {
      return;
    }
    // AN OP = async (a Promise return). A pure/sync function type is a computation, not a data door.
    const ret = fnType.getReturnTypeNode();
    if (ret?.isKind(SyntaxKind.TypeReference) !== true || ret.getTypeName().getText() !== "Promise") {
      return;
    }
    const params = fnType.getParameters();
    // REACHES TENANT DATA = a param mentions a branded ENTITY-row id (the derived vocabulary). An op over
    // credentials / urls / model names touches no tenant row and needs no caller.
    const paramNames = params.flatMap((p) => namesIn(p));
    if (!paramNames.some((n) => entityIdTypes.has(n))) {
      return;
    }
    seenOps.add(alias.getName());
    if (paramNames.some((n) => SCOPE_NAMES.has(n) || SCOPE_TYPES.has(n))) {
      return;
    }
    if (alias.getName() in CALLER_FREE_OPS) {
      return;
    }
    ctx.report(alias, { token: alias.getName(), offset: alias.getText().indexOf(alias.getName()) });
  },

  finalize: (ctx) => {
    // WHOLE-TREE claims: a conformance mini-project declares one op and would "prove" every row dead
    // (§4.5/§4.6). The anchor is the schema barrel — on every real run, on no example's path.
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    if (entityIdTypes.size === 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND });
    }
    for (const op of Object.keys(CALLER_FREE_OPS)) {
      if (!seenOps.has(op)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE(op) });
      }
    }
  },

  mustFlag: [
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type CharacterId = TypeIdOf<"character">;\nexport type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/character/contract/service.ts":
          "export type CopyCharacterBooksOp = (args: { readonly fromCharacterId: CharacterId; readonly toCharacterId: CharacterId }) => Promise<void>;\n",
      },
      expect: { count: 1, messageIncludes: "takes an entity id but NO caller" },
      why: "the founding shape — the census's open item: an op moving state between two character ids, safe today only because its ONE call site happens to have proved ownership first",
    },
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/x/contract/service.ts": "export type LoadThingOp = (assetId: AssetId) => Promise<Uint8Array>;\n",
      },
      expect: { count: 1 },
      why: "the POSITIONAL form of the same hole — a bare id param, not an options object; a gate reading only object members would miss half the corpus",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type CharacterId = TypeIdOf<"character">;\n',
        "packages/server/src/domain/character/contract/service.ts":
          "export type AttachCardTagOp = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;\n",
      },
      why: "the SHAPE the fix asks for — the live `AttachCardTagOp`: the scope rides in the args object beside the entity id",
    },
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type CharacterId = TypeIdOf<"character">;\n',
        "packages/server/src/domain/character/contract/service.ts":
          'export type ResolveGreetingTemplateOp = (args: { readonly caller: Principal; readonly kind: "a" }) => Promise<string>;\n',
      },
      why: "no entity id in the params — nothing tenant-scoped is reachable, so the trigger does not fire (and the `caller` would satisfy it anyway)",
    },
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/character/contract/service.ts": "export type ReapAssetsOp = (assetIds: readonly AssetId[]) => Promise<void>;\n",
      },
      why: "the CALLER_FREE_OPS row: the reap's authority is the asset-ref registry, not the caller (D20 un-principal). The reason — and its end condition — is the deliverable, not the silence",
    },
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type ChatId = TypeIdOf<"chat">;\nexport type CharacterId = TypeIdOf<"character">;\n',
        "packages/server/src/domain/x/contract/service.ts":
          "export type PostToRoomOp = (args: { readonly chatId: ChatId; readonly characterId: CharacterId }) => Promise<void>;\n",
      },
      why: "a `chatId` IS a scope — a membership-scoped op carries the room the `requireParticipant` check runs on (D18), not a userId",
    },
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/discovery/contract/service.ts":
          "export type Tier0RangeOp = (tier: number, blockIdx: number) => { readonly startIdx: number };\n",
      },
      why: "DECLARED LIMIT: a SYNC function type is a computation, not a data door — the Promise return is what makes an op an I/O boundary",
    },
    {
      files: {
        "packages/kit/src/ids/index.ts": 'export type AssetId = TypeIdOf<"asset">;\n',
        "packages/server/src/domain/x/contract/service.ts": "export type EmbeddingsStoreOp = (params: StoreDigestParams) => Promise<void>;\n",
      },
      why: "DECLARED LIMIT, written down not assumed: an id reached through a NAMED type reference is invisible here (the reader is syntactic over the param subtree, the same literal-shape limit `own-tables-only` carries for namespace imports). This row is the baseline a checker-resolved widening would start from",
    },
  ],
};
