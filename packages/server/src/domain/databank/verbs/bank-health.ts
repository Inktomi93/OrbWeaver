// verb: bankHealth — the caller's bank as a CENSUS: how many documents, how many passages a chat can
// actually pull from out of the passages that exist, and how many documents sit in each ingest phase. The
// home tile's D-7 health line and its attention chips ("12 stalled") are this, and nothing else.
//
// WHY IT IS ITS OWN VERB AND NOT A FIELD ON `list` (owner ruling 2026-08-14). The tile used to derive all
// three from the ONE page it renders four rows of, so every claim it made was scoped to the newest 100
// documents while reading as a claim about the bank — the same blind-lens class as a client-side list filter.
// The fix cannot ride `databank.list`: the phase counts need the bank-wide chunk read below, and folding that
// into the paged list would pay it on EVERY page fetch of a library the user is scrolling. Here it is paid
// once per tile mount.
//
// EVERY PHASE COUNT IS `countOwnedDocuments` OVER THE SAME PREDICATE THE LIST FILTERS BY — not a second
// spelling of the phase arithmetic. That is what makes a chip and the list it scopes to agree by
// construction: clicking "12 stalled" cannot land on a pane showing eleven rows.
//
// The chunk half rides the same injected op the list's phase lens uses (`chunkCountsByOwner`) — databank
// never reads `document_chunks` (D20 / Knowledge-Cluster inv 1-2; verbs/list.ts carries the declared limit
// and its escalation path). A read: no audit.

import type { BankHealthView, IngestPhase } from "@orb/contracts/databank";
import type { BankHealthParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import { countOwnedDocuments } from "../persistence/queries.ts";
import { activeSpaceModel } from "../substrate/active-space.ts";

export function createBankHealth(ctx: DatabankContext): DatabankService["bankHealth"] {
  return async ({ principal }: BankHealthParams): Promise<BankHealthView> => {
    const chunkCounts = await ctx.chunkCountsByOwner({ ownerId: principal.userId, model: await activeSpaceModel(ctx, principal.userId) });
    const chunkedIds = [...chunkCounts.keys()];
    const nowMs = ctx.now();
    // In this substrate a chunk row exists only after a successful embed, so the two sums are the same
    // number today — see `BankHealthView`'s note on why they are still two fields.
    let chunks = 0;
    for (const count of chunkCounts.values()) {
      chunks += count;
    }
    // One COUNT per phase over the whole bank, plus the unfiltered total. The record is spelled out rather
    // than folded from the tuple: a literal is exhaustive by construction (a new phase fails tsc here) and
    // needs no cast to become a total Record. `embedding` is counted like the rest even though the substrate
    // cannot produce it — the day it can, this needs no edit, and skipping it would be a second place that
    // knows the arm is empty.
    const countOf = async (phase: IngestPhase): Promise<number> => countOwnedDocuments(ctx.db, principal.userId, { phase: { chunkedIds, nowMs, phase } });
    const [empty, indexing, embedding, ready, stalled, total] = await Promise.all([
      countOf("empty"),
      countOf("indexing"),
      countOf("embedding"),
      countOf("ready"),
      countOf("stalled"),
      countOwnedDocuments(ctx.db, principal.userId, {}),
    ]);
    return { byPhase: { embedding, empty, indexing, ready, stalled }, chunks, passages: chunks, total };
  };
}
