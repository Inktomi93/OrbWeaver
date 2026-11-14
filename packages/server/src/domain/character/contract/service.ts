// domain/character/contract/service — typed API surface: CharacterContext (DI bundle) + CharacterService
// (verb interface) + cross-feature injected-op types (character never sideways-imports assets or tag).

import type { ReapAssetsOp } from "@orb/contracts/assets";
import type {
  CharacterAvatarNames,
  CharacterBulkTagResult,
  CharacterDetail,
  CharacterRef,
  CreateCharacterOp,
  DuplicateCharacterOp,
  FindCharacterByHandleOp,
  FindCharacterByImportHashOp,
  FindSyntheticGroupCharacterOp,
  GetCharacterCardOp,
  GetCharacterOp,
  LoadCharacterCardTextOp,
  MintSyntheticGroupCharacterOp,
  SnapshotCharacterOp,
  UpdateCharacterOp,
} from "@orb/contracts/character";
import type { ListCharacterIds } from "@orb/contracts/embeddings";
import type { EmitDomainEvent } from "@orb/contracts/events";
import type { Principal } from "@orb/contracts/identity";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { BumpStatsCanonVersion, RetireCharacterCensus } from "@orb/contracts/stats";
import type { AttachCardTagByNameOp, DetachCardTagOp } from "@orb/contracts/tag";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { CopyCharacterBooks } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import type { BatchHandle, DatabaseHandle, DbAssemblyInput } from "@orb/db/wiring";
import type { CharacterId, CharacterSnapshotId, UserId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import type { AuditWiring, Logger } from "#foundation/observability";
import type {
  AdmitsImportedArtParams,
  AttachImportedArtParams,
  BulkAddCardTagParams,
  BulkArchiveParams,
  BulkRemoveCardTagParams,
  BulkRemoveParams,
  FindByNameParams,
  GenerateGreetingParams,
  GetSnapshotParams,
  ListCharactersParams,
  ListCharacterTagGroupsParams,
  ListSnapshotsParams,
  NamesByAvatarAssetsParams,
  RemoveCharacterParams,
  RestoreParams,
  RewriteGreetingParams,
  StampImportIdentityParams,
} from "./params.ts";
import type { GeneratedGreeting, ListCharactersResult, ListCharacterTagGroupsResult, SnapshotSummary, SnapshotView } from "./results.ts";

/** The editable greeting-studio prompt material resolved from the CALLER's preset: the
 *  `greeting_rewrite`/`greeting_new` `guidedActions` template PLUS that preset's `prose` overrides. Wired at
 *  compose to the preset domain's optional configuration read; character owns selection and never imports preset.
 *
 *  The `prose` half landed with the templating fork's ARM B (owner ruling): the greeting studio's
 *  transform fragments are `preset.greetingTransform.*` slots now, so the verb needs the same override bag
 *  the chat assembly seam already composes — the wire carries the picked ids, the bytes are resolved HERE.
 *  Absent overrides (`{}`) resolve every fragment to its shipped default, which is byte-identical to the
 *  pre-fork client-composed steer. */
type ResolveGreetingTemplateOp = (args: {
  readonly caller: Principal;
  readonly kind: "greeting_rewrite" | "greeting_new";
}) => Promise<{ readonly template: string; readonly prose: ProseOverrides }>;

/** The bounded side-LLM completion the greeting-studio verbs await (the imagery `captionImage` precedent —
 *  the summarize lane). ONE prompt in, `{text, costUsd}` out; character resolves the caller's live connection
 *  through the injected runtime port (every studio verb is owner-gated). Character resolves sampling from
 *  the caller's Utility-role preset over the `greeting_studio` posture —
 *  the same for BOTH studio kinds, so the op carries no `kind` (per-template sampling is deleted, owner
 *  ruling; `kind` still selects the TEMPLATE, on `resolveGreetingTemplate`). */
type GenerateGreetingTextOp = (args: { readonly caller: Principal; readonly prompt: string }) => Promise<GeneratedGreeting>;

/** DI bundle every character verb closes over. */
export interface CharacterContext {
  readonly logger: Logger;
  readonly db: Db;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>;
  readonly retireCharacterCensus: RetireCharacterCensus<BatchStmt[], Db>;
  readonly now: Clock;
  readonly newCharacterId: () => CharacterId;
  readonly newSnapshotId: () => CharacterSnapshotId;
  readonly audit: AuditWiring["log"];
  readonly emit: EmitDomainEvent;
  readonly reapAssets: ReapAssetsOp;
  readonly attachCardTag: AttachCardTagByNameOp;
  readonly detachCardTag: DetachCardTagOp;
  /** Carries attached world-info book references onto a duplicate (world-info owns the junction, D28). */
  /** Carries the source character's attached book references onto a duplicate; wired at compose. */
  readonly copyCharacterBooks: CopyCharacterBooks;
  /** Fires charactersChanged with the owner's userId after each durable write; distinct from emit
   *  (which drives embedding re-index, not client cache). */
  readonly emitUserEvent: EmitUserEvent;
  /** Materialize a user-pasted external carried-background URL into an owned CAS asset —
   *  `update` runs it for a `kind:"external"` `backgroundOverride` so the persisted card background is always
   *  same-origin-paintable (an external URL is CSP-blocked). Compose-built from infra + assets.store. */
  readonly materializeBackground: MaterializeBackgroundOp;
  /** Reads the caller's preset greeting-studio template; character never imports preset. */
  readonly resolveGreetingTemplate: ResolveGreetingTemplateOp;
  /** Runs the bounded side-LLM completion the greeting-studio verbs await (the summarize lane at compose). */
  readonly generateGreetingText: GenerateGreetingTextOp;
}

export type CharacterAssemblyInput = Omit<DbAssemblyInput<CharacterContext>, "bumpStatsCanonVersion" | "retireCharacterCensus"> & {
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchHandle, DatabaseHandle>;
  readonly retireCharacterCensus: RetireCharacterCensus<BatchHandle, DatabaseHandle>;
};

export interface CharacterService {
  readonly create: CreateCharacterOp;
  readonly get: GetCharacterOp;
  readonly count: (params: ListCharacterTagGroupsParams) => Promise<number>;
  /** The caller's characters named by the avatar asset ids they wear — a by-ids read, never a page walk. */
  readonly namesByAvatarAssets: (params: NamesByAvatarAssetsParams) => Promise<CharacterAvatarNames>;
  readonly list: (params: ListCharactersParams) => Promise<ListCharactersResult>;
  /** The GROUP-BY-TAG census over the SAME lens `list` pages — see `verbs/list-tag-groups.ts`. */
  readonly listTagGroups: (params: ListCharacterTagGroupsParams) => Promise<ListCharacterTagGroupsResult>;
  /** Edits the live card in place (no CAS/COW); recomputes contentHash. */
  readonly update: UpdateCharacterOp;
  /** Cascades snapshots/personas; best-effort reaps the avatar asset. */
  readonly remove: (params: RemoveCharacterParams) => Promise<void>;
  readonly duplicate: DuplicateCharacterOp;
  /** Missing/foreign ids are skipped, not thrown. */
  readonly bulkRemove: (params: BulkRemoveParams) => Promise<void>;
  readonly bulkArchive: (params: BulkArchiveParams) => Promise<void>;
  /** Per-item outcome — the honest wire for a partial batch. */
  readonly bulkAddCardTag: (params: BulkAddCardTagParams) => Promise<CharacterBulkTagResult>;
  /** Per-item outcome — the honest wire for a partial batch. */
  readonly bulkRemoveCardTag: (params: BulkRemoveCardTagParams) => Promise<CharacterBulkTagResult>;

  readonly snapshot: SnapshotCharacterOp;
  readonly listSnapshots: (params: ListSnapshotsParams) => Promise<SnapshotSummary[]>;
  /** One snapshot WITH its blob — the compare/inspect read (refinery Versions walk, §16.2). */
  readonly getSnapshot: (params: GetSnapshotParams) => Promise<SnapshotView>;
  readonly restore: (params: RestoreParams) => Promise<CharacterDetail>;

  /** Live card for an owned character, or null for not-owned/mid-delete — never throws. */
  readonly getCard: GetCharacterCardOp;

  /** Keyed by id alone, no owner scope — trusted system re-reader. */
  readonly loadCardText: LoadCharacterCardTextOp;

  /** ownerId scopes to one owner, omitted/null = all owners. */
  readonly listEmbeddableCharacterIds: ListCharacterIds;

  readonly findByImportHash: FindCharacterByImportHashOp;
  /** Give an art-less owned character its avatar and re-key its import identity, in one conditional write.
   *  True when the row took the art; false when it already had one (nothing written). */
  readonly attachImportedArt: (params: AttachImportedArtParams) => Promise<boolean>;
  /** Whether {@link CharacterService.attachImportedArt} would give the character art now, asked without writing. */
  readonly admitsImportedArt: (params: AdmitsImportedArtParams) => Promise<boolean>;
  /** Give a seeded card the import identity its own export carries, so restoring that export onto a box that
   *  seeded the same card dedups. True when written; false when the row already carries an identity. */
  readonly stampImportIdentity: (params: StampImportIdentityParams) => Promise<boolean>;
  readonly findByHandle: FindCharacterByHandleOp;
  /** Every owner character carrying the display name, oldest first: empty, one, or an ambiguity for the caller. */
  readonly findByName: (params: FindByNameParams) => Promise<readonly CharacterRef[]>;

  readonly mintSyntheticGroupCharacter: MintSyntheticGroupCharacterOp;
  readonly findSyntheticGroupCharacter: FindSyntheticGroupCharacterOp;

  /** Greeting studio: rewrite the supplied base greeting under the caller's `greeting_rewrite`
   *  template + composed steer. Owner-gated (leak-free NOT_FOUND for a non-owner); RETURNS text, NEVER writes. */
  readonly rewriteGreeting: (params: RewriteGreetingParams) => Promise<GeneratedGreeting>;
  /** Greeting studio: generate a fresh greeting under the caller's `greeting_new` template +
   *  composed steer. Owner-gated (leak-free NOT_FOUND for a non-owner); RETURNS text, NEVER writes. */
  readonly generateGreeting: (params: GenerateGreetingParams) => Promise<GeneratedGreeting>;
}

/** Narrow owner-scoped roster decoration read; card prose and tag enrichment are not part of this view. */
export type LoadSeatCards = (
  ownerId: UserId,
  characterIds: readonly CharacterId[],
) => Promise<
  readonly Pick<
    CharacterDetail,
    "id" | "name" | "avatarAssetId" | "trustHtml" | "forbidExternalMedia" | "interactiveHtml" | "themeOverride" | "backgroundOverride"
  >[]
>;
