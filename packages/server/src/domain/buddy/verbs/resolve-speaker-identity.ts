// verb: resolveSpeakerIdentity — the buddy's RESOLVE-phase product for a SEATED agent speaker (D60, doc 04
// §5). Owner-keyed (the `buddies` PK IS the owner userId): load the soul → the soul system-prompt (NO tools —
// a room turn is a plain roleplay turn, doc 04 §5) + the display name. NOT a request-path verb (no principal):
// the chat compose dispatch resolves agent→owner (the sanctioned `users` read) and calls this via the
// `AGENT_SPEAKER_SOURCES` registry. An owner with no hatched buddy → null (chat skips voicing it).

import type { AgentSpeakerIdentity } from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";
import type { BuddyContext } from "../context";
import type { BuddyService } from "../contract/service";
import { loadBuddy } from "../persistence/queries";
import { buildSoulPrompt } from "../substrate/agent";
import { bondTierOf, formOf } from "../substrate/mood";

export function createResolveSpeakerIdentity(ctx: BuddyContext): BuddyService["resolveSpeakerIdentity"] {
  return async (ownerUserId: UserId): Promise<AgentSpeakerIdentity | null> => {
    const row = await loadBuddy(ctx.db, ownerUserId);
    if (row === null) {
      return null; // no buddy hatched for this owner — nothing to voice.
    }
    const form = formOf(row.stats);
    const systemPrompt = buildSoulPrompt(
      { name: row.name, personality: row.personality },
      { formTitle: form.title, formBlurb: form.blurb, bondTier: bondTierOf(row.bondXp) },
    );
    return {
      displayName: row.name,
      systemPrompt,
      avatarAssetId: null, // v1: sprites are client-side (doc 04 §5); a real avatar lands with the D22 card view.
    };
  };
}
