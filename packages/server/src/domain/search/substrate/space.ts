// The retrieval-side SPACE read: which `(model[@dtype])` space a scan filters on, and — for images — which
// role op embeds the query into it.
//
// THE TAG IS `embedSpaceOf`, NOT `resolved.model` (§10-2), and it must stay byte-identical to the tag
// `embeddings.store` wrote: `nearest.ts` filters `model = <this string>`, so a bare model id here answers
// EMPTY against a corpus stored under `<model>@<dtype>` — no error, no log, forever.
//
// ── THE TRANSITION REFUSAL (§10-5) ────────────────────────────────────────────────────────────────────
// A retrieval does TWO things with the space: it FILTERS the scan, and it EMBEDS THE QUERY through the
// owner's live connection. Between a binding change and the reindex completing those disagree — the corpus
// is still in the last COMPLETE space (`embed_space_state`) while the query can only be embedded by the new
// model. Every admitted embedder is 1024-wide (the §10-1 admission rule), so nothing throws: cosine across
// two models' vectors is dimensionally valid and semantically meaningless. Serving the old space with a new
// model's query vector would return confidently-ranked GARBAGE where the pre-§10-5 tree returned nothing.
//
// So a retrieval scans the live space only while it IS the last complete one, and otherwise REFUSES with
// `SEARCH_SPACE_REINDEXING` — a state the user can be told about ("re-indexing your library; search resumes
// when it finishes") instead of an empty result list that looks like an empty library. This is deliberately
// NOT the whole of §10-5's "the swap is invisible": making it invisible additionally requires embedding the
// query through the OLD connection, which means persisting the connection id and a resolve-by-connection
// door in the runtime — and that arm still needs THIS refusal as its fallback, because `connection_bindings`
// is FK SET NULL and the old connection is frequently the one the user just deleted.
//
// A NULL active space means no sweep has ever completed (a virgin box, or a corpus predating the state
// table): the live space is then the only answer there is, and it is also where everything was written, so
// it is served without a refusal. This is the bootstrap arm, not a silent fallback.
//
// A retrieval over an owner with NO binding for the task is `SearchError(SEARCH_NO_SPACE)` — the composer's
// "no connection" refusal, never a query embedded in nobody's space.

import { foldActiveSpace } from "@orb/contracts/embeddings";
import { embedDtypeOf, embedSpaceOf, servesImageVectors } from "@orb/contracts/inference";
import type { UserId } from "@orb/kit/ids";
import { SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING, SearchError } from "../contract/errors.ts";
import type { ImageQuerySpace, SearchContext } from "../contract/service.ts";
import { readCompletedSpaces } from "../persistence/active-space.ts";

/** The TEXT space every `embed`-backed scan filters on. Throws `SEARCH_NO_SPACE` when nothing is bound and
 *  `SEARCH_SPACE_REINDEXING` while the corpus is mid-move. */
export async function requireSpaceModel(ctx: Pick<SearchContext, "db" | "roleClientsFor">, ownerId: UserId, task: "embed" | "imageEmbed"): Promise<string> {
  const rc = await ctx.roleClientsFor(ownerId);
  const resolved = await rc.resolved(task);
  if (resolved === null) {
    throw new SearchError(SEARCH_NO_SPACE, `no ${task} connection is bound for this user — bind one in Connections`);
  }
  return await settledSpace(ctx, ownerId, task, embedSpaceOf(resolved.model, embedDtypeOf(resolved.capability)));
}

/** THE IMAGE QUERY SPACE — the joint-space rule (§10-3) on the READ side, and the exact mirror of the
 *  indexer's write-side `resolveImageSpace`.
 *
 *  An owner with an image-capable embedder searches their image space with an image-embedded query and both
 *  lenses. An owner without one has their pictures in the TEXT space under the `image-captioned` lens alone
 *  (the caption was embedded as text), so the query must be embedded as text too and the lens is forced —
 *  scanning `image-raw` there would scan rows that do not exist, and embedding the query through
 *  `imageEmbed` would be a different geometry. The two sides deriving this separately is precisely the class
 *  of bug §10-2 was minted for, which is why both call the same `servesImageVectors` read. */
export async function requireImageSpace(ctx: Pick<SearchContext, "db" | "roleClientsFor">, ownerId: UserId): Promise<ImageQuerySpace> {
  const rc = await ctx.roleClientsFor(ownerId);
  const imageEmbed = await rc.resolved("imageEmbed");
  if (imageEmbed !== null && servesImageVectors(imageEmbed.capability)) {
    const live = embedSpaceOf(imageEmbed.model, embedDtypeOf(imageEmbed.capability));
    return { via: "imageEmbed", model: await settledSpace(ctx, ownerId, "imageEmbed", live) };
  }
  const embed = await rc.resolved("embed");
  if (embed === null) {
    throw new SearchError(SEARCH_NO_SPACE, "no imageEmbed or embed connection is bound for this user — bind one in Connections");
  }
  const live = embedSpaceOf(embed.model, embedDtypeOf(embed.capability));
  return { via: "embed", model: await settledSpace(ctx, ownerId, "imageEmbed", live) };
}

/** The transition gate: return `live` when the corpus has settled there (or has never recorded a completion
 *  at all), else refuse. One home, so no reader can accidentally scan a space its query cannot reach. */
async function settledSpace(ctx: Pick<SearchContext, "db">, ownerId: UserId, task: "embed" | "imageEmbed", live: string): Promise<string> {
  const active = foldActiveSpace(task, await readCompletedSpaces(ctx.db, ownerId));
  // `unrecorded` is the bootstrap arm, NOT a fallback: with no completion on record, everything that exists
  // was written in the live space. `moving` is a partly-migrated corpus and refuses even though no single
  // recorded space can be named — half the scan would be in a foreign geometry, which is the same defect.
  if (active.kind === "unrecorded" || (active.kind === "complete" && active.space === live)) {
    return live;
  }
  const where = active.kind === "complete" ? `it is still in ${active.space}` : "part of it has already moved";
  throw new SearchError(SEARCH_SPACE_REINDEXING, `your library is being re-indexed into ${live} (${where}) — search resumes when the re-index finishes`);
}
