// Reserved clip vocabularies under D55.
// The parked world-state-clips plan owns implementation scope and terminology.

import { z } from "zod";

/** Reserved durable-fact categories, distinct from conversational memory (D55). */
export const CLIP_KINDS = ["fact", "trait", "relationship", "world-state", "plot-thread"] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];
export const clipKindSchema = z.enum(CLIP_KINDS) satisfies z.ZodType<ClipKind>;

/** Reserved provenance; the world-state-clips plan owns preservation semantics. */
export const CLIP_SOURCE_KINDS = ["user", "synthesized", "promoted"] as const;
export type ClipSourceKind = (typeof CLIP_SOURCE_KINDS)[number];
export const clipSourceKindSchema = z.enum(CLIP_SOURCE_KINDS) satisfies z.ZodType<ClipSourceKind>;

export const CLIP_SCOPES = ["character", "chat", "global"] as const;
export type ClipScope = (typeof CLIP_SCOPES)[number];
export const clipScopeSchema = z.enum(CLIP_SCOPES) satisfies z.ZodType<ClipScope>;
