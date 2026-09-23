// domain/character/contract/service — typed API surface: CharacterContext (DI bundle) + CharacterService
// (verb interface) + cross-feature injected-op types (character never sideways-imports assets or tag).

import type { CharacterBulkTagResult, CharacterCard } from "@orb/contracts/character";
import type { DomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { BumpStatsCanonVersion } from "@orb/contracts/stats";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { AssetId, CharacterId, CharacterSnapshotId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  BulkAddCardTagParams,
  BulkArchiveParams,
  BulkRemoveCardTagParams,
  BulkRemoveParams,
  CreateCharacterParams,
  DuplicateCharacterParams,
  FindByHandleParams,
  FindByImportedFromParams,
  FindByImportHashParams,
  FindGroupCharParams,
  GenerateGreetingParams,
  GetCardParams,
  GetCharacterParams,
  GetSnapshotParams,
  ListCharactersParams,
  ListCharacterTagGroupsParams,
  ListSnapshotsParams,
  MintGroupCharParams,
  RemoveCharacterParams,
  RestoreParams,
  RewriteGreetingParams,
  SnapshotParams,
  UpdateCharacterParams,
} from "./params.ts";
import type {
  CharacterRef,
  GeneratedGreeting,
  ImportedFromMatch,
  ListCharactersResult,
  ListCharacterTagGroupsResult,
  SnapshotRef,
  SnapshotSummary,
  SnapshotView,
} from "./results.ts";
import type { CharacterDetail } from "./views.ts";

/** Best-effort reap of avatar assets a deleted character may have orphaned (FK is onDelete: set null). */
export type ReapAssetsOp = (assetIds: readonly AssetId[]) => Promise<void>;

/** READS the assetIds bound to a character's expression sprites, so remove can fold them into the
 *  `reapAssets` set AFTER the character row is actually gone (docs/plans/expressions/design.md). Injected +
 *  OPTIONAL: a deploy without the expressions leaf (tests/scripts) omits it and the FK cascade still wipes
 *  the bindings — the now-unreferenced blobs are reclaimed by the next `assets:gc` mark-sweep instead of the
 *  targeted reap.
 *
 *  IT IS A READ, AND IT RUNS BEFORE THE DELETE. This op used to DELETE the bindings and return what it had
 *  freed, and remove called it before `deleteOwnedCharacter` — so a delete that then failed (a lost race, a
 *  db error) left a LIVE character whose sprites had already been detached, silently. The reason the call
 *  has to happen first is unchanged and still true — the FK cascade wipes the bindings without surfacing
 *  their ids — so the fix is to READ the ids first and let the cascade do the detaching: nothing is
 *  destroyed until the row delete has succeeded, and a refused delete costs one wasted SELECT. */
type ListCharacterSpriteAssetsOp = (characterId: CharacterId) => Promise<readonly AssetId[]>;

/** Attaches a tag by name to one owned character; returns whether it was newly attached (idempotent). */
export type AttachCardTagOp = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;

export type DetachCardTagOp = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;

/** Carries the source character's attached world-info book REFERENCES onto the duplicate: fresh
 *  character_books rows pointing at the SAME books; world-info owns the junction write. Zero attachments =
 *  no-op. Internal to the DI bundle (the runtime op is world-info's `CopyCharacterBooks`, wired at compose).
 *  `ownerId` is the owned-source gate — the op re-checks BOTH ends rather than trusting the call site. */
type CopyCharacterBooksOp = (args: { readonly ownerId: UserId; readonly fromCharacterId: CharacterId; readonly toCharacterId: CharacterId }) => Promise<void>;

/** The editable greeting-studio prompt material resolved from the CALLER's preset (audit §3): the
 *  `greeting_rewrite`/`greeting_new` `guidedActions` template PLUS that preset's `prose` overrides. Wired at
 *  compose to the preset domain's active-preset read; character never imports preset.
 *
 *  The `prose` half landed with the templating fork's ARM B (owner 2026-08-09): the greeting studio's
 *  transform fragments are `preset.greetingTransform.*` slots now, so the verb needs the same override bag
 *  the chat assembly seam already composes — the wire carries the picked ids, the bytes are resolved HERE.
 *  Absent overrides (`{}`) resolve every fragment to its shipped default, which is byte-identical to the
 *  pre-fork client-composed steer. */
type ResolveGreetingTemplateOp = (args: {
  readonly caller: Principal;
  readonly kind: "greeting_rewrite" | "greeting_new";
}) => Promise<{ readonly template: string; readonly prose: ProseOverrides }>;

/** The bounded side-LLM completion the greeting-studio verbs await (the imagery `captionImage` precedent —
 *  the summarize lane at compose). ONE prompt in, `{text, costUsd}` out; the caller's connection is resolved
 *  at compose (the caller IS the request owner — every studio verb is owner-gated). The sampling posture is
 *  resolved at compose through the side-gen ladder (`greeting_studio` floor ← the caller's preset params) —
 *  the same for BOTH studio kinds, so the op carries no `kind` (per-template sampling was deleted, owner
 *  ruling 2026-08-01; `kind` still selects the TEMPLATE, on `resolveGreetingTemplate`). */
type GenerateGreetingTextOp = (args: { readonly caller: Principal; readonly prompt: string }) => Promise<GeneratedGreeting>;

/** DI bundle every character verb closes over. */
export interface CharacterContext {
  readonly db: Db;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>;
  readonly now: () => number;
  readonly newCharacterId: () => CharacterId;
  readonly newSnapshotId: () => CharacterSnapshotId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly emit: (event: DomainEvent) => void;
  readonly reapAssets: ReapAssetsOp;
  /** Injected sprite-asset READ (docs/plans/expressions/design.md); OPTIONAL — absent = the FK cascade + a later GC sweep. */
  readonly listCharacterSpriteAssets?: ListCharacterSpriteAssetsOp;
  readonly attachCardTag: AttachCardTagOp;
  readonly detachCardTag: DetachCardTagOp;
  /** Carries attached world-info book references onto a duplicate (world-info owns the junction, D28). */
  readonly copyCharacterBooks: CopyCharacterBooksOp;
  /** Fires charactersChanged with the owner's userId after each durable write; distinct from emit
   *  (which drives embedding re-index, not client cache). */
  readonly emitUserEvent: EmitUserEvent;
  /** Materialize a user-pasted external carried-background URL into an owned CAS asset (side-eye F-P0-2) —
   *  `update` runs it for a `kind:"external"` `backgroundOverride` so the persisted card background is always
   *  same-origin-paintable (an external URL is CSP-blocked). Compose-built from infra + assets.store. */
  readonly materializeBackground: MaterializeBackgroundOp;
  /** Reads the caller's preset greeting-studio template (audit §3); character never imports preset. */
  readonly resolveGreetingTemplate: ResolveGreetingTemplateOp;
  /** Runs the bounded side-LLM completion the greeting-studio verbs await (the summarize lane at compose). */
  readonly generateGreetingText: GenerateGreetingTextOp;
}

export interface CharacterService {
  readonly create: (params: CreateCharacterParams) => Promise<CharacterDetail>;
  readonly get: (params: GetCharacterParams) => Promise<CharacterDetail>;
  readonly list: (params: ListCharactersParams) => Promise<ListCharactersResult>;
  /** The GROUP-BY-TAG census over the SAME lens `list` pages (#1696) — see `verbs/list-tag-groups.ts`. */
  readonly listTagGroups: (params: ListCharacterTagGroupsParams) => Promise<ListCharacterTagGroupsResult>;
  /** Edits the live card in place (no CAS/COW); recomputes contentHash. */
  readonly update: (params: UpdateCharacterParams) => Promise<CharacterDetail>;
  /** Cascades snapshots/personas; best-effort reaps the avatar asset. */
  readonly remove: (params: RemoveCharacterParams) => Promise<void>;
  readonly duplicate: (params: DuplicateCharacterParams) => Promise<CharacterDetail>;
  /** Missing/foreign ids are skipped, not thrown. */
  readonly bulkRemove: (params: BulkRemoveParams) => Promise<void>;
  readonly bulkArchive: (params: BulkArchiveParams) => Promise<void>;
  /** Per-item outcome — the honest wire for a partial batch (#1694). */
  readonly bulkAddCardTag: (params: BulkAddCardTagParams) => Promise<CharacterBulkTagResult>;
  /** Per-item outcome — the honest wire for a partial batch (#1694). */
  readonly bulkRemoveCardTag: (params: BulkRemoveCardTagParams) => Promise<CharacterBulkTagResult>;

  readonly snapshot: (params: SnapshotParams) => Promise<SnapshotRef>;
  readonly listSnapshots: (params: ListSnapshotsParams) => Promise<SnapshotSummary[]>;
  /** One snapshot WITH its blob — the compare/inspect read (refinery Versions walk, §16.2). */
  readonly getSnapshot: (params: GetSnapshotParams) => Promise<SnapshotView>;
  readonly restore: (params: RestoreParams) => Promise<CharacterDetail>;

  /** Live card for an owned character, or null for not-owned/mid-delete — never throws. */
  readonly getCard: (params: GetCardParams) => Promise<CharacterCard | null>;

  /** Keyed by id alone, no owner scope — trusted system re-reader. */
  readonly loadCardText: (characterId: CharacterId) => Promise<string | null>;

  /** ownerId scopes to one owner, omitted/null = all owners. */
  readonly listEmbeddableCharacterIds: (ownerId?: UserId | null) => Promise<readonly CharacterId[]>;

  readonly findByImportHash: (params: FindByImportHashParams) => Promise<CharacterRef | null>;
  /** Batched provenance oracle (hub-injected): the owner's characters carrying any of `values` in
   *  `importedFrom` — backs the hub search page's already-imported markers (doc 03 §2.1). */
  readonly findByImportedFrom: (params: FindByImportedFromParams) => Promise<ImportedFromMatch[]>;
  readonly findByHandle: (params: FindByHandleParams) => Promise<CharacterRef | null>;

  readonly mintSyntheticGroupCharacter: (params: MintGroupCharParams) => Promise<CharacterRef>;
  readonly findSyntheticGroupCharacter: (params: FindGroupCharParams) => Promise<CharacterRef | null>;

  /** Greeting studio (audit §3): rewrite the supplied base greeting under the caller's `greeting_rewrite`
   *  template + composed steer. Owner-gated (leak-free NOT_FOUND for a non-owner); RETURNS text, NEVER writes. */
  readonly rewriteGreeting: (params: RewriteGreetingParams) => Promise<GeneratedGreeting>;
  /** Greeting studio (audit §3): generate a fresh greeting under the caller's `greeting_new` template +
   *  composed steer. Owner-gated (leak-free NOT_FOUND for a non-owner); RETURNS text, NEVER writes. */
  readonly generateGreeting: (params: GenerateGreetingParams) => Promise<GeneratedGreeting>;
}
