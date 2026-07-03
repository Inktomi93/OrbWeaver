// domain/chat/substrate/auth/clamp — THE D22 member-card visibility clamp. A pure
// projection: a present human member may READ a roster character's card, but only the fields at or below the
// room's `chatMetadata.group.memberCardVisibility` level (`name-avatar | sheet | sheet+lore | full`,
// host-set, default `sheet`). The owner/host always sees `full`. Read-only + while-present; viewing ≠
// owning (edit/clone/export stay owner-only — NOT this projection's concern).
//
// Levels widen left→right; the ordering is DERIVED from the canonical `MEMBER_CARD_VISIBILITY_LEVELS` tuple
// (one home, no re-spell). Fields above the effective level are nulled. `tags`/`lore` are NOT on the flat
// `CharacterCard` (tags = the `character_tags` junction; lore = the character's rendered world-info), so the
// caller resolves + passes them — the clamp never fabricates them, it only gates what it is given.

import type { CharacterCard } from "@orb/contracts/character";
import type { MemberCardView, MemberCardVisibility } from "@orb/contracts/chat";
import { MEMBER_CARD_VISIBILITY_LEVELS } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";

/** The visibility rank (index in the canonical tuple) — derive-don't-respell the ordering. */
function rank(level: MemberCardVisibility): number {
  return MEMBER_CARD_VISIBILITY_LEVELS.indexOf(level);
}

/**
 * The EFFECTIVE visibility for a viewer: the room host always sees `full`; every other present member sees
 * the host-configured level. (The GLOBAL owner/admin
 * override is the caller's concern — it passes `full` directly; this resolves the per-chat resource role.)
 */
export function resolveCardVisibility(
  viewerRole: ParticipantRole,
  configured: MemberCardVisibility,
): MemberCardVisibility {
  return viewerRole === "host" ? "full" : configured;
}

/**
 * Clamp a roster character's card to the {@link MemberCardView} the member may read at `visibility`
 * (D22). `name`/`avatarAssetId` are the always-present floor; `sheet`+ reveals the presentable identity;
 * `sheet+lore`+ adds the rendered world-info; `full` adds the prompt-steering internals. Pure — no I/O.
 */
export function clampMemberCard(input: {
  readonly characterId: CharacterId;
  readonly card: CharacterCard;
  /** Resolved `character_tags` (caller-supplied; clamped at `sheet`). */
  readonly tags: string[] | null;
  /** Resolved world-info entry contents (caller-supplied; clamped at `sheet+lore`). */
  readonly lore: string[] | null;
  readonly visibility: MemberCardVisibility;
}): MemberCardView {
  const { characterId, card, tags, lore, visibility } = input;
  const r = rank(visibility);
  const atSheet = r >= rank("sheet");
  const atLore = r >= rank("sheet+lore");
  const atFull = r >= rank("full");
  return {
    characterId,
    visibility,
    // ── name-avatar floor (always) ──
    name: card.name,
    avatarAssetId: card.avatarAssetId,
    // ── sheet (>= sheet) ──
    description: atSheet ? card.description : null,
    personality: atSheet ? card.personality : null,
    scenario: atSheet ? card.scenario : null,
    greetings: atSheet ? card.greetings : null,
    exampleMessages: atSheet ? card.exampleMessages : null,
    tags: atSheet ? tags : null,
    creatorNotes: atSheet ? card.creatorNotes : null,
    // ── sheet+lore (>= sheet+lore) ──
    lore: atLore ? lore : null,
    // ── full (== full): the prompt-steering internals ──
    systemPrompt: atFull ? card.systemPrompt : null,
    postHistoryInstructions: atFull ? card.postHistoryInstructions : null,
    authorsNoteDepth: atFull ? (card.depthPrompt?.depth ?? null) : null,
  };
}
