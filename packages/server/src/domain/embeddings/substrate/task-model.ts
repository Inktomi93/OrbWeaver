// The SPACE TAG reads for one owner — the WRITE side's "where do new vectors go", the PURGE side's "which
// space is actually COMPLETE", and the joint-space rule that decides whether an image can be embedded as an
// image at all.
//
// THE TAG IS `embedSpaceOf`, NOT `resolved.model` (§10-2). The connection row's `model` column names the
// weights; the SPACE additionally carries the served precision, because a re-quantised encoder produces
// different vectors (#2417). The backend stamps that same tag on its `EmbedResult.model`, so deriving only
// the bare column here wrote every row into `<model>@<dtype>` while every read filtered on `<model>` —
// silently empty search, and an old-space purge that reclaimed the live corpus.
//
// THE SPACE THIS FILE ANSWERS WITH IS ALWAYS THE LIVE ONE, and that is the write side's correct answer:
// a new vector can only be produced by the embedder the binding resolves to right now. The LAST COMPLETE
// space (§10-5, `embed_space_state`) is the READ side's question and is folded in `domain/search`
// (`substrate/space.ts`) — embeddings is that table's WRITER (each sweep's terminal records its scope's
// completion), search is its reader, and the fold itself lives once in `@orb/contracts/embeddings`.
//
// `null` from {@link requireTaskModel} means the owner has no binding for the task (`no-connection`): a
// store/sweep SKIPS that owner and says so, never a throw into a bus handler.

import { embedDtypeOf, embedSpaceOf, servesImageVectors } from "@orb/contracts/inference";
import type { RoleClientTask } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import type { ImageSpace } from "../contract/results.ts";
import type { RoleClientsFor } from "../contract/service.ts";

/** The LIVE space tag for `task`, or `null` when the owner has no connection bound for it. */
export async function requireTaskModel(ctx: { readonly roleClientsFor: RoleClientsFor }, ownerId: UserId, task: RoleClientTask): Promise<string | null> {
  const resolved = await (await ctx.roleClientsFor(ownerId)).resolved(task);
  return resolved === null ? null : embedSpaceOf(resolved.model, embedDtypeOf(resolved.capability));
}

/** WHERE AN OWNER'S PICTURES LIVE — the joint-space rule (§10-3/§6.7), resolved once for both the on-write
 *  handler and the bulk sweep.
 *
 *  `embed` and `imageEmbed` are ONE model or `imageEmbed` falls to the CAPTIONED-TEXT lens. An owner whose
 *  `imageEmbed` task is unbound, or bound to a model that takes no `image` input, previously had every image
 *  SILENTLY DROPPED by the indexer (a debug line and nothing else — their pictures were simply never
 *  searchable and nothing said so). The fallback embeds the VL caption as TEXT through the `embed`
 *  connection instead: the picture lands in the text space, where a text query already goes, so it is
 *  findable — one lens instead of two, which is a real degrade and is reported as one rather than hidden.
 *
 *  `null` only when the owner has NO vector connection at all; that IS "nothing can be embedded". */
export async function resolveImageSpace(ctx: { readonly roleClientsFor: RoleClientsFor }, ownerId: UserId): Promise<ImageSpace | null> {
  const rc = await ctx.roleClientsFor(ownerId);
  const imageEmbed = await rc.resolved("imageEmbed");
  if (imageEmbed !== null && servesImageVectors(imageEmbed.capability)) {
    return { via: "imageEmbed", model: embedSpaceOf(imageEmbed.model, embedDtypeOf(imageEmbed.capability)) };
  }
  const embed = await rc.resolved("embed");
  if (embed === null) {
    return null;
  }
  return {
    via: "embed",
    model: embedSpaceOf(embed.model, embedDtypeOf(embed.capability)),
    degraded: imageEmbed === null ? "no-image-embed-connection" : "image-embed-model-takes-no-image-input",
  };
}
