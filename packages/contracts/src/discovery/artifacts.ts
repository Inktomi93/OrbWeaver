// Corpus retains these wire snapshots below the client data layer; producers and navigation share one shape.

import type { CharacterId, EmbedGenerationId, ThemeClusterId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { TokenProvenance } from "../chat/messages.ts";
import { tokenProvenanceSchema } from "../chat/messages.ts";
import type { ThemeLevel } from "./vocabulary.ts";
import { THEME_LEVELS } from "./vocabulary.ts";

/** One owner-scoped emergent theme cluster (k-means over digest embeddings, LLM-named). `name` is null
 *  until the naming pass runs or the cluster is below the name-worthiness floor. */
export interface ThemeRow {
  readonly id: ThemeClusterId;
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly name: string | null;
  readonly size: number;
  readonly model: string;
  readonly computedAt: number;
}

/** A complete grouping member's name and current portrait; a missing portrait renders initials. */
export interface ArchetypeMember {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** One character archetype — a k-means cluster of an owner's card embeddings, labelled from the dominant
 *  distilled facets. `members` retains the complete grouping; finders bound their own display. */
export interface Archetype {
  readonly baseLabel: string;
  readonly passId: string;
  readonly generationId: EmbedGenerationId;
  readonly fingerprint: string | null;
  readonly label: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly topTags: string[];
  readonly size: number;
  readonly members: ArchetypeMember[];
  readonly model: string;
}

/** One art-style cluster — k-means over avatar vectors, labelled by dominant caption artStyle/mood. */
export interface VisualArchetype {
  readonly baseLabel: string;
  readonly passId: string;
  readonly generationId: EmbedGenerationId;
  readonly fingerprint: string | null;
  readonly label: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly artStyle: string | null;
  readonly palette: string | null;
  readonly mood: string | null;
  readonly size: number;
  readonly members: ArchetypeMember[];
  readonly model: string;
}

/** One (genre, model) routing row — which model was used for the owner's distilled genre and how it performed. */
export interface ModelRoutingRow {
  readonly genre: string;
  readonly model: string;
  readonly provider: string | null;
  readonly generations: number;
  readonly tokensOut: number | null;
  /** Dominant provenance across the character/model rows aggregated into this route. */
  readonly tokensOutProvenance: TokenProvenance;
  readonly avgGenTimeMs: number | null;
  readonly genTimeSamples: number;
  /** `null` = no generation in this route reported a dollar cost. */
  readonly costUsd: number | null;
}

export const themeRowSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.themeCluster),
  level: z.enum(THEME_LEVELS),
  clusterIdx: z.number(),
  name: z.string().nullable(),
  size: z.number(),
  model: z.string(),
  computedAt: z.number(),
}) satisfies z.ZodType<ThemeRow>;

export const archetypeMemberSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  avatarHash: z.string().nullable(),
}) satisfies z.ZodType<ArchetypeMember>;

export const archetypeSchema = z.strictObject({
  baseLabel: z.string(),
  // @orb-waive no-raw-id(passId): SHA-256 corpus fingerprint produced by clustering, not a minted row identity; ends if clustering passes become persisted identity-bearing rows.
  passId: z.string(),
  generationId: brandedId<EmbedGenerationId>(),
  fingerprint: z.string().nullable(),
  label: z.string(),
  genre: z.string().nullable(),
  tone: z.string().nullable(),
  topTags: z.array(z.string()),
  size: z.number(),
  members: z.array(archetypeMemberSchema),
  model: z.string(),
}) satisfies z.ZodType<Archetype>;

export const visualArchetypeSchema = z.strictObject({
  baseLabel: z.string(),
  // @orb-waive no-raw-id(passId): SHA-256 corpus fingerprint produced by clustering, not a minted row identity; ends if clustering passes become persisted identity-bearing rows.
  passId: z.string(),
  generationId: brandedId<EmbedGenerationId>(),
  fingerprint: z.string().nullable(),
  label: z.string(),
  genre: z.string().nullable(),
  tone: z.string().nullable(),
  artStyle: z.string().nullable(),
  palette: z.string().nullable(),
  mood: z.string().nullable(),
  size: z.number(),
  members: z.array(archetypeMemberSchema),
  model: z.string(),
}) satisfies z.ZodType<VisualArchetype>;

export const modelRoutingRowSchema = z.strictObject({
  genre: z.string(),
  model: z.string(),
  provider: z.string().nullable(),
  generations: z.number(),
  tokensOut: z.number().nullable(),
  tokensOutProvenance: tokenProvenanceSchema,
  avgGenTimeMs: z.number().nullable(),
  genTimeSamples: z.number(),
  costUsd: z.number().nullable(),
}) satisfies z.ZodType<ModelRoutingRow>;
