// @orb/contracts/discovery — the cross-boundary vocabulary of the discovery (library-semantics) domain.
// Kit-only (zod; no domain, no @orb/db, no sibling contracts node).
//
// Today this homes ONE axis: the dedup `relation`. The duplicate-pair rollup (the `find-duplicates`
// workload) labels each near-identical CHAT pair as a genuine accidental look-alike (`duplicate`) vs a
// known fork-lineage family (`forked` — chats sharing a `chats.parentChatId` fork root, D27). Promoted
// here (it was a local tuple in `@orb/db/schema/discovery`) so the `duplicate_chat_pairs.relation` column
// DERIVES it + CHECK-enforces it + a `.int` test-mirror pins the two — the D34 one-home rule, mirroring
// `IMAGE_LENSES` in `@orb/contracts/embeddings`. Characters have NO fork lineage (D28 snapshots), so only
// `duplicate_chat_pairs` carries the column; `duplicate_character_pairs` has none.

import { z } from "zod";

export const RELATIONS = ["duplicate", "forked"] as const;
export type DuplicateRelation = (typeof RELATIONS)[number];
export const duplicateRelationSchema = z.enum(RELATIONS);
